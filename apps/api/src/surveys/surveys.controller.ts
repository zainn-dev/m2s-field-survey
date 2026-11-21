import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { Prisma, SurveyStatus } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, isAdmin, REVIEWER_ROLES, Roles } from '../common/auth';
import { assertHouseholdAccess, surveyScope } from '../common/scope';
import { missingDocumentsError, resolveAnswer } from '../common/validation';
import { sanitizeProfile } from '../common/profile';
import { surveyInclude, toSurvey } from '../common/mappers';
import { describeGpsArea, extractClientIp, resolveIpLocation } from '../common/network';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../documents/storage.service';
import { SurveyQualityServerService } from './quality.service';

class QualityEventItemDto {
  @IsString() @MinLength(2) @MaxLength(100) ruleId: string;
  @IsIn(['UNDER_REVIEW', 'VERIFIED', 'ACKNOWLEDGED', 'SUPERVISOR_APPROVE', 'SUPERVISOR_WAIVE'])
  action: 'UNDER_REVIEW' | 'VERIFIED' | 'ACKNOWLEDGED' | 'SUPERVISOR_APPROVE' | 'SUPERVISOR_WAIVE';
  @IsOptional() @IsString() @MaxLength(600) note?: string;
  @IsString() @MinLength(4) @MaxLength(120) clientEventId: string;
}

class RecordQualityEventsDto {
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => QualityEventItemDto)
  events: QualityEventItemDto[];
}

class QualityOverrideDto {
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) ruleIds: string[];
  @IsString() @MinLength(5) @MaxLength(600) reason: string;
  @IsOptional() @IsString() @MaxLength(120) clientEventId?: string;
}

class AnswerDto {
  @Matches(/^Q\d{1,2}[a-z]?$/i) questionId: string;
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) optionKeys: string[];
  /** Ignored: codes are always re-derived from keys on the server. */
  @IsOptional() @IsArray() @IsString({ each: true }) optionCodes?: string[];
  @IsOptional() @IsString() @MaxLength(4000) otherText?: string;
}

class SaveSurveyDto {
  @IsString() @MinLength(8) @MaxLength(100) idempotencyKey: string;
  /** Revision the client edited from; 0 when creating. A mismatch returns 409 instead of overwriting. */
  @IsInt() @Min(0) baseRevision: number;
  @IsObject() profile: Record<string, unknown>;
  @IsBoolean() consentGiven: boolean;
  @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => AnswerDto) answers: AnswerDto[];
  /** Save and submit for review in one request (used by the offline queue). */
  @IsOptional() @IsBoolean() submit?: boolean;
  /** Optional consent-based GPS capture (coordinates ignored unless gpsConsent is true). */
  @IsOptional() @IsBoolean() gpsConsent?: boolean;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) gpsLat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) gpsLng?: number;
  /** Clamped server-side (IP/Wi-Fi fixes can report > 50 km); never reject a whole survey sync over it. */
  @IsOptional() @IsNumber() @Min(0) gpsAccuracyMeters?: number;
  @IsOptional() @IsString() @MaxLength(60) gpsCapturedAt?: string;
  @IsOptional() @IsIn(['granted', 'denied', 'prompt', 'unavailable']) gpsPermissionStatus?: string;
  /** Interview duration tracking for supervisor quality checks. */
  @IsOptional() @IsString() @MaxLength(60) startedAt?: string;
  /** Clamped to 24 h server-side: a draft resumed the next day must still save. */
  @IsOptional() @IsInt() @Min(0) durationSec?: number;
  /** Optional queued quality resolution/acknowledgement events synced alongside the survey. */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => QualityEventItemDto)
  qualityEvents?: QualityEventItemDto[];
}

const MAX_DURATION_SEC = 86_400;
const MAX_GPS_ACCURACY_M = 10_000_000;
/** Interactive transactions run validation + quality checks; Prisma's 5 s default is too tight under sync bursts. */
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 };

function parseIsoDate(raw?: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildTelemetryData(d: SaveSurveyDto) {
  const consented = d.gpsConsent === true && Number.isFinite(d.gpsLat) && Number.isFinite(d.gpsLng);
  return {
    gpsConsent: Boolean(d.gpsConsent),
    gpsLat: consented ? d.gpsLat! : null,
    gpsLng: consented ? d.gpsLng! : null,
    gpsAccuracyMeters: consented && Number.isFinite(d.gpsAccuracyMeters) ? Math.min(d.gpsAccuracyMeters!, MAX_GPS_ACCURACY_M) : null,
    gpsCapturedAt: consented ? parseIsoDate(d.gpsCapturedAt) : null,
    gpsPermissionStatus: d.gpsPermissionStatus ?? null,
    ...(d.startedAt !== undefined ? { startedAt: parseIsoDate(d.startedAt) } : {}),
    ...(d.durationSec !== undefined ? { durationSec: Math.min(d.durationSec, MAX_DURATION_SEC) } : {}),
  };
}

class ReviewDto {
  @IsIn(['APPROVE', 'RETURN', 'REJECT']) decision: 'APPROVE' | 'RETURN' | 'REJECT';
  @IsString() @MaxLength(1000) reason: string;
}

const EDITABLE: SurveyStatus[] = ['DRAFT', 'RETURNED'];
const SURVEY_STATUSES: ReadonlySet<string> = new Set(['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REJECTED']);
const DECISION_STATUS = { APPROVE: 'APPROVED', RETURN: 'RETURNED', REJECT: 'REJECTED' } as const;
const DECISION_VERB = { APPROVE: 'approved', RETURN: 'returned for corrections', REJECT: 'rejected' } as const;

@Controller({ path: 'surveys', version: '1' })
export class SurveysController {
  constructor(
    private db: PrismaService,
    private audit: AuditService,
    private questionnaire: QuestionnaireService,
    private storage: StorageService,
    private settings: SettingsService,
    private quality: SurveyQualityServerService
  ) {}

  @Get()
  async list(@CurrentUser() me: AuthUser, @Query('status') status?: string, @Query('clusterId') clusterId?: string) {
    const where: Prisma.SurveyWhereInput = { ...surveyScope(me) };
    if (status && status !== 'ALL') {
      if (!SURVEY_STATUSES.has(status)) {
        throw new BadRequestException({ code: 'INVALID_STATUS', message: `Unsupported survey status: ${status}` });
      }
      where.status = status as SurveyStatus;
    }
    if (clusterId) where.household = { AND: [(where.household as Prisma.HouseholdWhereInput) ?? {}, { clusterId }] }; // never widen the caller's scope
    const rows = await this.db.survey.findMany({ where, include: surveyInclude, orderBy: { household: { code: 'desc' } } });
    const canSeeTelemetry = REVIEWER_ROLES.includes(me.role as (typeof REVIEWER_ROLES)[number]);
    return rows.map((s) => toSurvey(s, canSeeTelemetry));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() me: AuthUser) {
    const s = await this.db.survey.findFirst({ where: { id, ...surveyScope(me) }, include: surveyInclude });
    if (!s) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Survey not found' });
    return toSurvey(s, REVIEWER_ROLES.includes(me.role as (typeof REVIEWER_ROLES)[number]));
  }

  /**
   * Create-or-update a survey (idempotent; safe to retry from the offline queue).
   * The household shares the survey's client-generated UUID so documents can be queued offline too.
   */
  @Put(':id')
  async save(@Param('id', ParseUUIDPipe) id: string, @Body() d: SaveSurveyDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const prev = await this.db.syncRecord.findUnique({ where: { idempotencyKey: d.idempotencyKey } });
    if (prev) {
      if (prev.userId !== me.sub || prev.surveyId !== id) throw new ConflictException({ code: 'IDEMPOTENCY_REUSED', message: 'Idempotency key reuse' });
      return this.get(id, me);
    }

    const qv = await this.questionnaire.latest();
    const submit = !!d.submit;
    const profile = sanitizeProfile(d.profile, { draft: !submit });

    // Validate answers against the questionnaire (keys → authoritative codes).
    const answers = d.answers.map((a) => {
      const q = qv.questions.get(a.questionId);
      if (!q) throw new BadRequestException({ code: 'UNKNOWN_QUESTION', message: `Unknown question ${a.questionId}` });
      const { codes, error } = resolveAnswer(q, a.optionKeys, !submit);
      if (error) throw new BadRequestException({ code: 'INVALID_ANSWER', message: error });
      return { questionId: a.questionId, optionKeys: q.type === 'text' ? [] : a.optionKeys, optionCodes: codes, otherText: a.otherText?.trim() || null };
    });
    if (new Set(answers.map((a) => a.questionId)).size !== answers.length) {
      throw new BadRequestException({ code: 'INVALID_ANSWER', message: 'Duplicate question in answers' });
    }

    if (submit) {
      if (!d.consentGiven) throw new BadRequestException({ code: 'CONSENT_REQUIRED', message: 'Informed consent must be recorded before submission.' });
      if (!String(profile.headName ?? '').trim()) throw new BadRequestException({ code: 'HEAD_NAME_REQUIRED', message: 'Head of household name (B3) is required.' });
    }

    const existing = await this.db.survey.findUnique({ where: { id }, include: { household: true } });
    const cluster = await this.db.cluster.findUnique({ where: { id: String(profile.clusterId || '') } });
    if (!cluster) throw new BadRequestException({ code: 'UNKNOWN_CLUSTER', message: 'Select a valid village cluster (B2).' });
    if (!cluster.active && (!existing || existing.household.clusterId !== cluster.id)) {
      throw new BadRequestException({ code: 'INACTIVE_CLUSTER', message: 'Selected village cluster is inactive.' });
    }
    profile.clusterName = cluster.name;

    if (submit && (!existing || EDITABLE.includes(existing.status))) {
      const study = await this.settings.study();
      if (study.requireDocumentsForSubmission) {
        const docs = existing
          ? await this.db.document.findMany({ where: { householdId: existing.householdId, status: 'AVAILABLE' }, select: { categoryId: true } })
          : [];
        const cats = await this.settings.docCategories();
        const docErr = missingDocumentsError(cats, docs.map((x) => x.categoryId));
        if (docErr) throw new BadRequestException({ code: 'DOCUMENTS_REQUIRED', message: docErr });
      }
    }
    if (existing) await assertHouseholdAccess(this.db, me, existing.householdId);
    const clientIp = extractClientIp(req);
    const clientIpLocation = await resolveIpLocation(clientIp, req);
    let result: string;
    try {
    result = await this.db.$transaction(async (tx) => {
      let surveyId = id;
      if (!existing) {
        if (d.baseRevision !== 0) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Survey no longer exists on the server.' });
        if (me.role === 'SUPERVISOR' && !me.clusterIds.includes(cluster.id)) {
          throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Cluster is outside your assignment.' });
        }
        // Serialise code allocation so two devices never receive the same survey code.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242001)`;
        const [{ max }] = await tx.$queryRaw<{ max: number | null }[]>`
          SELECT MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)) AS max FROM "Household" WHERE code ~ '^M2S-[0-9]{6}$'`;
        const code = `M2S-${String((max ?? 1000) + 1).padStart(6, '0')}`;
        await tx.household.create({
          data: { id, clusterId: cluster.id, code, headName: String(profile.headName || '') || null, assignedVolunteerId: me.sub },
        });
        await tx.survey.create({
          data: {
            id,
            householdId: id,
            volunteerId: me.sub,
            questionnaireVersionId: qv.id,
            consentGiven: d.consentGiven,
            profile: { ...profile, surveyCode: code },
            revision: 1,
          },
        });
        await this.audit.log(
          { actorId: me.sub, action: 'survey_create', entity: 'survey', entityId: id, summary: `Survey ${code} started by ${me.name}`, ip: clientIp },
          tx
        );
      } else {
        const owner = existing.volunteerId === me.sub;
        if (!isAdmin(me) && !(owner && EDITABLE.includes(existing.status))) {
          throw new ConflictException({
            code: 'LOCKED',
            message: `Survey is ${existing.status.toLowerCase()} and can no longer be edited from this account.`,
          });
        }
        if (d.baseRevision !== existing.revision) {
          throw new ConflictException({
            code: 'REVISION_CONFLICT',
            message: 'This survey was changed on another device. Reload to see the latest version.',
            serverRevision: existing.revision,
          });
        }
        // Re-check revision + editability atomically: the reads above happened outside this transaction, so a
        // concurrent save/review could have moved the survey on since then.
        const bumped = await tx.survey.updateMany({
          where: { id: existing.id, revision: d.baseRevision, ...(isAdmin(me) ? {} : { status: { in: EDITABLE } }) },
          data: { revision: { increment: 1 } },
        });
        if (bumped.count === 0) {
          const cur = await tx.survey.findUnique({ where: { id: existing.id }, select: { revision: true, status: true } });
          if (cur && !isAdmin(me) && !EDITABLE.includes(cur.status)) {
            throw new ConflictException({ code: 'LOCKED', message: `Survey is ${cur.status.toLowerCase()} and can no longer be edited from this account.` });
          }
          throw new ConflictException({
            code: 'REVISION_CONFLICT',
            message: 'This survey was changed on another device. Reload to see the latest version.',
            serverRevision: cur?.revision,
          });
        }
        surveyId = existing.id;
        await tx.household.update({
          where: { id: existing.householdId },
          data: { clusterId: cluster.id, headName: String(profile.headName || '') || null },
        });
      }

      await tx.answer.deleteMany({ where: { surveyId } });
      if (answers.length) await tx.answer.createMany({ data: answers.map((a) => ({ ...a, surveyId })) });

      const telemetry = buildTelemetryData(d);
      const current = await tx.survey.findUniqueOrThrow({ where: { id: surveyId }, include: { household: true } });
      const submitting = submit && EDITABLE.includes(current.status);
      // The household's GPS / capture IP describe the interviewer's device, not an admin correcting it later.
      const actorIsInterviewer = !existing || existing.volunteerId === me.sub;
      const updated = await tx.survey.update({
        where: { id: surveyId },
        data: {
          profile: { ...profile, surveyCode: current.household.code },
          consentGiven: d.consentGiven,
          ...(actorIsInterviewer ? telemetry : {}),
          ...(actorIsInterviewer && clientIp ? { submittedIp: clientIp } : {}),
          ...(actorIsInterviewer && clientIpLocation ? { submittedIpLocation: clientIpLocation } : {}),
          ...(submitting ? { status: 'SUBMITTED', submittedAt: new Date() } : {}),
        },
      });

      await tx.user.update({
        where: { id: me.sub },
        data: {
          lastActiveAt: new Date(),
          ...(clientIp ? { lastIp: clientIp } : {}),
          ...(clientIpLocation ? { lastIpLocation: clientIpLocation } : {}),
          ...(actorIsInterviewer && telemetry.gpsConsent && telemetry.gpsLat != null && telemetry.gpsLng != null
            ? {
                lastGpsLat: telemetry.gpsLat,
                lastGpsLng: telemetry.gpsLng,
                lastGpsAccuracy: telemetry.gpsAccuracyMeters ?? undefined,
                lastGpsCapturedAt: telemetry.gpsCapturedAt ?? new Date(),
                lastLocationLabel:
                  cluster.name ||
                  describeGpsArea(telemetry.gpsLat, telemetry.gpsLng) ||
                  clientIpLocation ||
                  undefined,
              }
            : {}),
        },
      });

      const valCtx = await this.quality.loadValidationContext(tx, surveyId, current.householdId, cluster.id);
      let surveyRecord = await this.quality.loadSurveyRecord(tx, surveyId);
      if (d.qualityEvents?.length) {
        surveyRecord = await this.quality.applyClientEvents(tx, {
          survey: surveyRecord,
          events: d.qualityEvents,
          actor: me,
          ...valCtx,
        });
      }
      await this.quality.reconcileAndEnforce(tx, {
        survey: surveyRecord,
        ...valCtx,
        actor: me,
        submit: submit && EDITABLE.includes(current.status),
        idempotencyKey: d.idempotencyKey,
      });

      if (submit && EDITABLE.includes(current.status)) {
        await this.audit.log(
          {
            actorId: me.sub,
            action: 'survey_submit',
            entity: 'survey',
            entityId: surveyId,
            summary: `Survey ${current.household.code} submitted by ${me.name}${clientIpLocation ? ` (${clientIpLocation})` : ''}`,
            ip: clientIp,
          },
          tx
        );
      } else if (existing && isAdmin(me) && existing.volunteerId !== me.sub) {
        await this.audit.log(
          { actorId: me.sub, action: 'survey_edit', entity: 'survey', entityId: surveyId, summary: `${me.name} edited ${current.household.code}`, ip: clientIp },
          tx
        );
      }
      await tx.syncRecord.create({
        data: { idempotencyKey: d.idempotencyKey, userId: me.sub, surveyId, result: { surveyId, revision: updated.revision } },
      });
      return surveyId;
    }, TX_OPTIONS);
    } catch (e) {
      // Two in-flight copies of the same save (online attempt + queued retry) race on the unique keys.
      if ((e as { code?: string })?.code === 'P2002') {
        const prev = await this.db.syncRecord.findUnique({ where: { idempotencyKey: d.idempotencyKey } });
        if (prev && prev.userId === me.sub && prev.surveyId === id) return this.get(id, me);
        const cur = await this.db.survey.findUnique({ where: { id }, select: { revision: true } });
        throw new ConflictException({
          code: 'REVISION_CONFLICT',
          message: 'This survey was changed on another device. Reload to see the latest version.',
          serverRevision: cur?.revision,
        });
      }
      throw e;
    }

    return this.get(result, me);
  }

  /**
   * Records volunteer/supervisor quality checker resolution events (with clientEventId deduplication).
   * Rejects attempts to click-dismiss critical contradictions or omit required verification notes.
   */
  @Post(':id/quality-events')
  @HttpCode(200)
  async recordQualityEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RecordQualityEventsDto,
    @CurrentUser() me: AuthUser
  ) {
    const existing = await this.db.survey.findFirst({ where: { id, ...surveyScope(me) }, include: { household: true } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Survey not found' });
    const isReviewer = REVIEWER_ROLES.includes(me.role as (typeof REVIEWER_ROLES)[number]);
    if (!isReviewer && !(existing.volunteerId === me.sub && EDITABLE.includes(existing.status))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You cannot modify quality status for this survey.' });
    }

    await this.db.$transaction(async (tx) => {
      const valCtx = await this.quality.loadValidationContext(tx, existing.id, existing.householdId, existing.household.clusterId);
      const record = await this.quality.loadSurveyRecord(tx, existing.id);
      await this.quality.applyClientEvents(tx, {
        survey: record,
        events: d.events,
        actor: me,
        ...valCtx,
      });
    }, TX_OPTIONS);

    return this.get(id, me);
  }

  /**
   * Authorized supervisor/admin override waiving blocked quality rule(s) with a mandatory reason & audit trail.
   */
  @Roles(...REVIEWER_ROLES)
  @Post(':id/quality-override')
  @HttpCode(200)
  async overrideQuality(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: QualityOverrideDto,
    @CurrentUser() me: AuthUser,
    @Req() req: Request
  ) {
    const existing = await this.db.survey.findFirst({ where: { id, ...surveyScope(me) }, include: surveyInclude });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Survey not found' });

    await this.db.$transaction(async (tx) => {
      const record = await this.quality.loadSurveyRecord(tx, existing.id);
      await this.quality.applySupervisorOverride(tx, {
        survey: record,
        ruleIds: d.ruleIds,
        reason: d.reason,
        actor: me,
        clientEventId: d.clientEventId,
        ip: req.ip,
      });
    });

    return this.get(id, me);
  }

  @Roles(...REVIEWER_ROLES)
  @Post(':id/review')
  @HttpCode(200)
  async review(@Param('id', ParseUUIDPipe) id: string, @Body() d: ReviewDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const s = await this.db.survey.findFirst({ where: { id, ...surveyScope(me) }, include: { household: true } });
    if (!s) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Survey not found' });
    const allowed = isAdmin(me) ? ['SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED'] : ['SUBMITTED'];
    if (!allowed.includes(s.status)) {
      throw new ConflictException({ code: 'NOT_REVIEWABLE', message: `A ${s.status.toLowerCase()} survey cannot be reviewed.` });
    }
    const reason = d.reason.trim();
    if (d.decision !== 'APPROVE' && reason.length < 5) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Give a reason (at least 5 characters) so the volunteer knows what to fix.' });
    }
    await this.db.$transaction(async (tx) => {
      await tx.reviewAction.create({ data: { surveyId: id, reviewerId: me.sub, decision: d.decision, reason: reason || 'Approved.' } });
      await tx.survey.update({ where: { id }, data: { status: DECISION_STATUS[d.decision], revision: { increment: 1 } } });
      await this.audit.log(
        {
          actorId: me.sub,
          action: `survey_${d.decision.toLowerCase()}`,
          entity: 'survey',
          entityId: id,
          summary: `${s.household.code} ${DECISION_VERB[d.decision]} by ${me.name}${d.decision !== 'APPROVE' ? `: ${reason}` : ''}`,
          ip: req.ip,
        },
        tx
      );
    });
    return this.get(id, me);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const s = await this.db.survey.findFirst({ where: { id, ...surveyScope(me) }, include: { household: { include: { documents: { include: { pages: true } } } } } });
    if (!s) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Survey not found' });
    if (!isAdmin(me)) {
      const study = await this.settings.study();
      if (!study.allowVolunteerDelete) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Draft deletion is disabled in study settings.' });
      }
      if (!(s.volunteerId === me.sub && s.status === 'DRAFT')) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only drafts can be discarded by the volunteer.' });
      }
    }
    const keys = s.household.documents.flatMap((d) => d.pages.map((p) => p.objectKey));
    await this.db.$transaction(async (tx) => {
      await tx.document.deleteMany({ where: { householdId: s.householdId } });
      await tx.survey.delete({ where: { id } });
      await tx.household.delete({ where: { id: s.householdId } });
      await this.audit.log(
        { actorId: me.sub, action: 'survey_delete', entity: 'survey', entityId: id, summary: `${s.household.code} deleted by ${me.name}`, ip: req.ip },
        tx
      );
    });
    await Promise.all(keys.map((k) => this.storage.remove(k)));
    return { ok: true };
  }
}
