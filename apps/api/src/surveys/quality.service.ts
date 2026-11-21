import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  buildAnswerSnapshot,
  defaultQualityService,
  sanitizeResolutionNote,
} from '@m2s/shared/validation';
import type {
  HouseholdDocument,
  HouseholdProfile,
  QualityIssue,
  QualityPolicyConfig,
  QualityResolutionRecord,
  Role,
  SurveyQualityReport,
  SurveyRecord,
} from '@m2s/shared/types/survey';
import type { AuthUser } from '../common/auth';
import { AuditService } from '../common/audit.service';
import { documentInclude, surveyInclude, toDocument, toSurvey } from '../common/mappers';
import { PrismaService } from '../prisma.service';
import { SettingsService } from '../settings/settings.service';

export type QualityActionType =
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'ACKNOWLEDGED'
  | 'SUPERVISOR_APPROVE'
  | 'SUPERVISOR_WAIVE';

export interface IncomingQualityEvent {
  ruleId: string;
  action: QualityActionType;
  note?: string;
  clientEventId: string;
}

const ACTION_EVENT_TYPE: Record<QualityActionType, string> = {
  UNDER_REVIEW: 'OPENED',
  VERIFIED: 'VERIFIED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  SUPERVISOR_APPROVE: 'SUPERVISOR_APPROVED',
  SUPERVISOR_WAIVE: 'SUPERVISOR_WAIVED',
};

@Injectable()
export class SurveyQualityServerService {
  constructor(
    private db: PrismaService,
    private settings: SettingsService,
    private audit: AuditService
  ) {}

  async loadValidationContext(
    tx: Prisma.TransactionClient,
    surveyId: string,
    householdId: string,
    clusterId: string
  ): Promise<{
    documents: HouseholdDocument[];
    peerSurveys: SurveyRecord[];
    requiredDocCategoryIds: string[];
    policy: QualityPolicyConfig;
  }> {
    const [rawDocs, rawPeers, cats, policy] = await Promise.all([
      tx.document.findMany({
        where: { householdId, status: 'AVAILABLE' },
        include: documentInclude,
      }),
      tx.survey.findMany({
        where: {
          id: { not: surveyId },
          household: { clusterId },
        },
        take: 150,
        orderBy: { updatedAt: 'desc' },
        include: surveyInclude,
      }),
      this.settings.docCategories(tx),
      this.settings.qualityPolicy(tx),
    ]);

    const study = await this.settings.study(tx);
    const requiredDocCategoryIds = study.requireDocumentsForSubmission
      ? cats.filter((c) => c.enabled && c.requiredForSubmission).map((c) => c.id)
      : [];

    return {
      documents: rawDocs.map(toDocument) as unknown as HouseholdDocument[],
      peerSurveys: rawPeers.map((s) => toSurvey(s)) as unknown as SurveyRecord[],
      requiredDocCategoryIds,
      policy,
    };
  }

  /**
   * Builds a shared SurveyRecord view from database state (or unsaved draft overrides)
   * so frontend and backend run identical centralized validation rules.
   */
  async loadSurveyRecord(tx: Prisma.TransactionClient, surveyId: string): Promise<SurveyRecord> {
    const row = await tx.survey.findUniqueOrThrow({
      where: { id: surveyId },
      include: surveyInclude,
    });
    return toSurvey(row) as unknown as SurveyRecord;
  }

  /**
   * Applies queued or live quality resolution events safely with:
   * - clientEventId idempotent deduplication (no duplicate history rows on retry)
   * - RBAC checks and mandatory note sanitization
   * - snapshot capture so edits reopen rules cleanly
   */
  async applyClientEvents(
    tx: Prisma.TransactionClient,
    input: {
      survey: SurveyRecord;
      events: IncomingQualityEvent[];
      actor: AuthUser;
      documents: HouseholdDocument[];
      peerSurveys: SurveyRecord[];
      requiredDocCategoryIds: string[];
      policy: QualityPolicyConfig;
    }
  ): Promise<SurveyRecord> {
    if (!input.events.length) return input.survey;
    const now = new Date();
    const currentSurvey = { ...input.survey };
    const resMap = new Map<string, QualityResolutionRecord>(
      (currentSurvey.qualityResolutions ?? []).map((r) => [r.ruleId, r])
    );

    const baseReport = defaultQualityService.evaluate({
      survey: currentSurvey,
      documents: input.documents,
      peerSurveys: input.peerSurveys,
      requiredDocCategoryIds: input.requiredDocCategoryIds,
      elapsedSec: currentSurvey.durationSec,
      policy: input.policy,
    });

    for (const ev of input.events) {
      const seen = await tx.surveyQualityEvent.findUnique({
        where: { surveyId_clientEventId: { surveyId: currentSurvey.id, clientEventId: ev.clientEventId } },
      });
      if (seen) continue;

      const issue: QualityIssue | undefined =
        baseReport.issues.find((i) => i.id === ev.ruleId || i.ruleId === ev.ruleId);

      // If offline queue sends a resolution event after the underlying issue was already fixed, record history harmlessly.
      if (!issue) {
        await tx.surveyQualityEvent.create({
          data: {
            surveyId: currentSurvey.id,
            ruleId: ev.ruleId,
            ruleTitle: ev.ruleId,
            severity: 'info',
            eventType: ACTION_EVENT_TYPE[ev.action] ?? 'ACKNOWLEDGED',
            status: 'CORRECTED',
            actorId: input.actor.sub,
            actorName: input.actor.name,
            actorRole: input.actor.role,
            note: sanitizeResolutionNote(ev.note),
            clientEventId: ev.clientEventId,
          },
        });
        continue;
      }

      if ((ev.action === 'SUPERVISOR_APPROVE' || ev.action === 'SUPERVISOR_WAIVE') && input.actor.role === 'VOLUNTEER') {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Only supervisors or admins can approve or override escalated quality exceptions.',
        });
      }

      const check = defaultQualityService.validateResolutionAction({
        issue,
        action: ev.action,
        note: ev.note,
        actorRole: input.actor.role as Role,
        policy: input.policy,
      });
      if (!check.ok || !check.nextStatus) {
        throw new BadRequestException({
          code: 'QUALITY_RESOLUTION_INVALID',
          message: check.error ?? 'Invalid validation resolution action.',
        });
      }

      const snapshot = buildAnswerSnapshot(currentSurvey, issue.relevantQuestionIds ?? []);
      const supervisorStatus =
        ev.action === 'SUPERVISOR_APPROVE'
          ? 'APPROVED'
          : ev.action === 'SUPERVISOR_WAIVE'
            ? 'WAIVED'
            : check.nextStatus === 'SUPERVISOR_REVIEW_REQUIRED'
              ? 'PENDING'
              : resMap.get(issue.id)?.supervisorStatus ?? null;

      const upserted = await tx.surveyQualityResolution.upsert({
        where: { surveyId_ruleId: { surveyId: currentSurvey.id, ruleId: issue.id } },
        create: {
          surveyId: currentSurvey.id,
          ruleId: issue.id,
          ruleVersion: issue.ruleVersion ?? '1.0.0',
          status: check.nextStatus,
          note: check.sanitizedNote || null,
          verifiedById: input.actor.role === 'VOLUNTEER' ? input.actor.sub : null,
          verifiedByName: input.actor.role === 'VOLUNTEER' ? input.actor.name : null,
          verifiedAt: ev.action === 'VERIFIED' || ev.action === 'ACKNOWLEDGED' ? now : null,
          answerSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          supervisorStatus,
          supervisorNote: ev.action === 'SUPERVISOR_APPROVE' || ev.action === 'SUPERVISOR_WAIVE' ? check.sanitizedNote || null : null,
          reviewedById: ev.action === 'SUPERVISOR_APPROVE' || ev.action === 'SUPERVISOR_WAIVE' ? input.actor.sub : null,
          reviewedByName: ev.action === 'SUPERVISOR_APPROVE' || ev.action === 'SUPERVISOR_WAIVE' ? input.actor.name : null,
          reviewedAt: ev.action === 'SUPERVISOR_APPROVE' || ev.action === 'SUPERVISOR_WAIVE' ? now : null,
          clientEventId: ev.clientEventId,
        },
        update: {
          ruleVersion: issue.ruleVersion ?? '1.0.0',
          status: check.nextStatus,
          ...(check.sanitizedNote ? { note: check.sanitizedNote } : {}),
          ...(ev.action === 'VERIFIED' || ev.action === 'ACKNOWLEDGED'
            ? { verifiedById: input.actor.sub, verifiedByName: input.actor.name, verifiedAt: now }
            : {}),
          answerSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          supervisorStatus,
          ...(ev.action === 'SUPERVISOR_APPROVE' || ev.action === 'SUPERVISOR_WAIVE'
            ? {
                supervisorNote: check.sanitizedNote || null,
                reviewedById: input.actor.sub,
                reviewedByName: input.actor.name,
                reviewedAt: now,
              }
            : {}),
          clientEventId: ev.clientEventId,
        },
      });

      resMap.set(issue.id, {
        id: upserted.id,
        surveyId: upserted.surveyId,
        ruleId: upserted.ruleId,
        ruleVersion: upserted.ruleVersion,
        status: upserted.status as QualityResolutionRecord['status'],
        note: upserted.note ?? undefined,
        verifiedById: upserted.verifiedById ?? undefined,
        verifiedByName: upserted.verifiedByName ?? undefined,
        verifiedAt: upserted.verifiedAt?.toISOString(),
        answerSnapshot: snapshot,
        supervisorStatus: (upserted.supervisorStatus ?? undefined) as QualityResolutionRecord['supervisorStatus'],
        supervisorNote: upserted.supervisorNote ?? undefined,
        reviewedById: upserted.reviewedById ?? undefined,
        reviewedByName: upserted.reviewedByName ?? undefined,
        reviewedAt: upserted.reviewedAt?.toISOString(),
        clientEventId: upserted.clientEventId ?? undefined,
        updatedAt: upserted.updatedAt.toISOString(),
      });

      const resolvedEventType =
        check.nextStatus === 'SUPERVISOR_REVIEW_REQUIRED'
          ? 'SUPERVISOR_QUEUED'
          : ACTION_EVENT_TYPE[ev.action];

      await tx.surveyQualityEvent.create({
        data: {
          surveyId: currentSurvey.id,
          ruleId: issue.id,
          ruleTitle: issue.title,
          severity: issue.severity,
          eventType: resolvedEventType,
          status: check.nextStatus,
          actorId: input.actor.sub,
          actorName: input.actor.name,
          actorRole: input.actor.role,
          note: check.sanitizedNote || null,
          updatedAnswers: snapshot as unknown as Prisma.InputJsonValue,
          supervisorStatus,
          clientEventId: ev.clientEventId,
        },
      });
    }

    currentSurvey.qualityResolutions = [...resMap.values()];
    return currentSurvey;
  }

  /**
   * Re-runs centralized validation after edits, reconciles stale/fixed resolutions,
   * records TRIGGERED/CORRECTED/REOPENED history transitions, and enforces submission gates.
   */
  async reconcileAndEnforce(
    tx: Prisma.TransactionClient,
    input: {
      survey: SurveyRecord;
      previousAnswers?: SurveyRecord['answers'];
      documents: HouseholdDocument[];
      peerSurveys: SurveyRecord[];
      requiredDocCategoryIds: string[];
      policy: QualityPolicyConfig;
      actor: AuthUser;
      submit: boolean;
      idempotencyKey?: string;
    }
  ): Promise<SurveyQualityReport> {
    const report = defaultQualityService.evaluate({
      survey: input.survey,
      documents: input.documents,
      peerSurveys: input.peerSurveys,
      requiredDocCategoryIds: input.requiredDocCategoryIds,
      elapsedSec: input.survey.durationSec,
      policy: input.policy,
    });

    const activeIssueIds = new Set(report.issues.map((i) => i.id));
    const existingRes = input.survey.qualityResolutions ?? [];
    const suffix = input.idempotencyKey ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // 1. Auto-close previously triggered/verified rules whose conditions are now fixed.
    for (const r of existingRes) {
      if (!activeIssueIds.has(r.ruleId) && r.status !== 'CORRECTED') {
        await tx.surveyQualityResolution.update({
          where: { id: r.id },
          data: { status: 'CORRECTED', supervisorStatus: r.supervisorStatus === 'PENDING' ? 'APPROVED' : r.supervisorStatus },
        });
        const clientEventId = `corrected:${r.ruleId}:${suffix}`;
        await tx.surveyQualityEvent.upsert({
          where: { surveyId_clientEventId: { surveyId: input.survey.id, clientEventId } },
          create: {
            surveyId: input.survey.id,
            ruleId: r.ruleId,
            ruleTitle: r.ruleId,
            severity: 'info',
            eventType: 'CORRECTED',
            status: 'CORRECTED',
            actorId: input.actor.sub,
            actorName: input.actor.name,
            actorRole: input.actor.role,
            note: 'Issue resolved after survey data update.',
            clientEventId,
          },
          update: {},
        });
      } else if (activeIssueIds.has(r.ruleId)) {
        const liveIssue = report.issues.find((i) => i.id === r.ruleId);
        // If snapshot became stale after edits and qualityService reopened it, reflect in DB + history.
        if (liveIssue && liveIssue.resolutionStatus === 'OPEN' && r.status !== 'OPEN' && r.status !== 'UNDER_REVIEW') {
          await tx.surveyQualityResolution.update({
            where: { id: r.id },
            data: { status: 'OPEN' },
          });
          const clientEventId = `reopened:${r.ruleId}:${suffix}`;
          await tx.surveyQualityEvent.upsert({
            where: { surveyId_clientEventId: { surveyId: input.survey.id, clientEventId } },
            create: {
              surveyId: input.survey.id,
              ruleId: liveIssue.id,
              ruleTitle: liveIssue.title,
              severity: liveIssue.severity,
              eventType: 'REOPENED',
              status: 'OPEN',
              actorId: input.actor.sub,
              actorName: input.actor.name,
              actorRole: input.actor.role,
              note: 'Reopened because affected answers were modified while rule remained active.',
              clientEventId,
            },
            update: {},
          });
        }
      }
    }

    // 2. Record initial TRIGGERED entries for cross-question errors/warnings not yet tracked.
    const trackedRuleIds = new Set(existingRes.map((r) => r.ruleId));
    for (const issue of report.issues) {
      if ((issue.severity !== 'error' && issue.severity !== 'warning') || issue.id === 'RULE_MISSING_REQUIRED_QUESTIONS') continue;
      if (!trackedRuleIds.has(issue.id) || existingRes.find((r) => r.ruleId === issue.id)?.status === 'CORRECTED') {
        const snap = buildAnswerSnapshot(input.survey, issue.relevantQuestionIds ?? []);
        await tx.surveyQualityResolution.upsert({
          where: { surveyId_ruleId: { surveyId: input.survey.id, ruleId: issue.id } },
          create: {
            surveyId: input.survey.id,
            ruleId: issue.id,
            ruleVersion: issue.ruleVersion ?? '1.0.0',
            status: 'OPEN',
            answerSnapshot: snap as unknown as Prisma.InputJsonValue,
            supervisorStatus: issue.supervisorReviewRecommended ? 'PENDING' : null,
          },
          update: {
            status: 'OPEN',
            answerSnapshot: snap as unknown as Prisma.InputJsonValue,
            supervisorStatus: issue.supervisorReviewRecommended ? 'PENDING' : null,
          },
        });
        const clientEventId = `triggered:${issue.id}:${suffix}`;
        await tx.surveyQualityEvent.upsert({
          where: { surveyId_clientEventId: { surveyId: input.survey.id, clientEventId } },
          create: {
            surveyId: input.survey.id,
            ruleId: issue.id,
            ruleTitle: issue.title,
            severity: issue.severity,
            eventType: 'TRIGGERED',
            status: 'OPEN',
            actorId: input.actor.sub,
            actorName: input.actor.name,
            actorRole: input.actor.role,
            note: issue.detail,
            updatedAnswers: snap as unknown as Prisma.InputJsonValue,
            supervisorStatus: issue.supervisorReviewRecommended ? 'PENDING' : null,
            clientEventId,
          },
          update: {},
        });
      }
    }

    // 3. Enforce independent server-side submission policy gate.
    if (input.submit && !report.canSubmit) {
      throw new BadRequestException({
        code: 'QUALITY_VALIDATION_BLOCKED',
        message: report.submissionBlockReasons?.[0] ?? 'Survey validation checks must be resolved before submission.',
        submissionBlockReasons: report.submissionBlockReasons ?? [],
        errorCount: report.unresolvedErrors?.length ?? report.errors.length,
        warningCount: report.unresolvedWarnings?.length ?? report.warnings.length,
      });
    }

    return report;
  }

  /**
   * Authorized supervisor/admin override with mandatory sanitized reason and audit trail.
   */
  async applySupervisorOverride(
    tx: Prisma.TransactionClient,
    input: {
      survey: SurveyRecord;
      ruleIds: string[];
      reason: string;
      actor: AuthUser;
      clientEventId?: string;
      ip?: string;
    }
  ): Promise<void> {
    const policy = await this.settings.qualityPolicy(tx);
    if (!policy.allowSupervisorOverride) {
      throw new ForbiddenException({
        code: 'OVERRIDE_DISABLED',
        message: 'Supervisor quality overrides are disabled in study settings.',
      });
    }
    const cleanReason = sanitizeResolutionNote(input.reason, 600);
    if (cleanReason.length < 5) {
      throw new BadRequestException({
        code: 'OVERRIDE_REASON_REQUIRED',
        message: 'Supervisor override reason (at least 5 characters) is required.',
      });
    }
    const uniqueRuleIds = [...new Set(input.ruleIds.map((r) => r.trim()).filter(Boolean))];
    if (uniqueRuleIds.length === 0) {
      throw new BadRequestException({ code: 'RULE_IDS_REQUIRED', message: 'Select at least one rule to override.' });
    }

    const baseKey = input.clientEventId || `override-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    const { documents, peerSurveys, requiredDocCategoryIds } = await this.loadValidationContext(
      tx,
      input.survey.id,
      input.survey.householdId,
      input.survey.clusterId
    );
    const report = defaultQualityService.evaluate({
      survey: input.survey,
      documents,
      peerSurveys,
      requiredDocCategoryIds,
      elapsedSec: input.survey.durationSec,
      policy,
    });

    for (const ruleId of uniqueRuleIds) {
      const issue = report.issues.find((i) => i.id === ruleId || i.ruleId === ruleId);
      const snap = issue ? buildAnswerSnapshot(input.survey, issue.relevantQuestionIds ?? []) : {};
      const clientEventId = `${baseKey}:${ruleId}`;

      await tx.surveyQualityResolution.upsert({
        where: { surveyId_ruleId: { surveyId: input.survey.id, ruleId } },
        create: {
          surveyId: input.survey.id,
          ruleId,
          ruleVersion: issue?.ruleVersion ?? '1.0.0',
          status: 'WAIVED_WITH_REASON',
          note: cleanReason,
          supervisorStatus: 'WAIVED',
          supervisorNote: cleanReason,
          reviewedById: input.actor.sub,
          reviewedByName: input.actor.name,
          reviewedAt: now,
          answerSnapshot: snap as unknown as Prisma.InputJsonValue,
          clientEventId,
        },
        update: {
          status: 'WAIVED_WITH_REASON',
          note: cleanReason,
          supervisorStatus: 'WAIVED',
          supervisorNote: cleanReason,
          reviewedById: input.actor.sub,
          reviewedByName: input.actor.name,
          reviewedAt: now,
          answerSnapshot: snap as unknown as Prisma.InputJsonValue,
          clientEventId,
        },
      });

      await tx.surveyQualityEvent.upsert({
        where: { surveyId_clientEventId: { surveyId: input.survey.id, clientEventId } },
        create: {
          surveyId: input.survey.id,
          ruleId,
          ruleTitle: issue?.title ?? ruleId,
          severity: issue?.severity ?? 'warning',
          eventType: 'OVERRIDE_APPLIED',
          status: 'WAIVED_WITH_REASON',
          actorId: input.actor.sub,
          actorName: input.actor.name,
          actorRole: input.actor.role,
          note: cleanReason,
          updatedAnswers: snap as unknown as Prisma.InputJsonValue,
          supervisorStatus: 'WAIVED',
          clientEventId,
        },
        update: {},
      });
    }

    await this.audit.log(
      {
        actorId: input.actor.sub,
        action: 'survey_quality_override',
        entity: 'survey',
        entityId: input.survey.id,
        summary: `${input.actor.name} (${input.actor.role}) waived [${uniqueRuleIds.join(', ')}] on ${input.survey.surveyCode}: ${cleanReason}`,
        meta: { ruleIds: uniqueRuleIds, reason: cleanReason },
        ip: input.ip,
      },
      tx
    );
  }
}

export function buildUnsavedDraftForValidation(input: {
  id: string;
  householdId: string;
  surveyCode: string;
  clusterId: string;
  clusterName: string;
  volunteerId: string;
  volunteerName: string;
  status: SurveyRecord['status'];
  revision: number;
  consentGiven: boolean;
  gpsConsent?: boolean;
  gpsLat?: number;
  gpsLng?: number;
  durationSec?: number;
  profile: HouseholdProfile;
  answers: Array<{ questionId: string; optionKeys: string[]; optionCodes: string[]; otherText: string | null }>;
  resolutions?: QualityResolutionRecord[];
}): SurveyRecord {
  const nowIso = new Date().toISOString();
  return {
    id: input.id,
    householdId: input.householdId,
    surveyCode: input.surveyCode,
    clusterId: input.clusterId,
    clusterName: input.clusterName,
    volunteerId: input.volunteerId,
    volunteerName: input.volunteerName,
    status: input.status,
    revision: input.revision,
    consentGiven: input.consentGiven,
    gpsConsent: input.gpsConsent,
    gpsLat: input.gpsLat,
    gpsLng: input.gpsLng,
    durationSec: input.durationSec,
    profile: input.profile,
    answers: Object.fromEntries(
      input.answers.map((a) => [
        a.questionId,
        {
          questionId: a.questionId,
          optionKeys: a.optionKeys,
          optionCodes: a.optionCodes,
          otherText: a.otherText ?? undefined,
        },
      ])
    ),
    reviews: [],
    qualityResolutions: input.resolutions ?? [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
