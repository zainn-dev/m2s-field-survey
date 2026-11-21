import { BadRequestException, Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Archiver } from 'archiver';
import type { Prisma, SurveyStatus, VerificationStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, REVIEWER_ROLES, Roles } from '../common/auth';
import { documentScope, surveyScope } from '../common/scope';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import { StorageService } from '../documents/storage.service';
import { defaultAnswerNormalizer } from '@m2s/shared/validation';
import { compareQuestionIds } from '@m2s/shared/survey/surveyModel';
import { evaluateHouseholdIndices } from '@m2s/shared/utils/studyIndicators';
import type { HouseholdProfile, QuestionAnswer, SurveyRecord } from '@m2s/shared/types/survey';

// archiver@7 exports a factory function; the installed @types describe v8's class API.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver: (format: 'zip', opts: { zlib: { level: number } }) => Archiver = require('archiver');

/** CSV cell with formula-injection protection (=, +, -, @ prefixed with an apostrophe). */
function cell(v: unknown): string {
  let s = v == null ? '' : Array.isArray(v) ? v.join('|') : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');

const PROFILE_COLUMNS = [
  'surveyDate', 'interviewer', 'translator', 'districtCode', 'districtOther', 'revenueCircleVillage',
  'clusterName', 'clusterOther', 'docVerifiedCode', 'docVerifiedOther', 'idLast4', 'headName', 'headAge',
  'headStatusCode', 'headStatusOther', 'religionCode', 'religionOther', 'casteName', 'casteCategoryCode',
  'primaryLanguageCode', 'primaryLanguageOther', 'totalMembers', 'maleCount', 'femaleCount', 'otherGenderCount',
  'ageUnder1', 'age1to5', 'age0to5', 'age6to14', 'age15to17', 'age18to59', 'age60Plus', 'vulnerableCodes',
  'incomeBeforeCode', 'incomeBeforeApprox', 'incomeNowCode', 'landOwnedCode', 'landBighas', 'landSizeCode',
  'landDocTypeCode', 'landDocOther', 'kitTarpaulin', 'kitFood', 'docPhotoConsent',
];

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function deriveIndices(
  qids: string[],
  profile: Record<string, unknown>,
  byQ: Map<string, { optionKeys: string[]; optionCodes: string[]; otherText: string | null }>
) {
  const answersRecord: Record<string, QuestionAnswer> = {};
  for (const [id, a] of byQ.entries()) {
    answersRecord[id] = {
      questionId: id,
      optionKeys: a.optionKeys,
      optionCodes: a.optionCodes,
      otherText: a.otherText ?? undefined,
    };
  }
  const indices = evaluateHouseholdIndices({
    profile: profile as unknown as HouseholdProfile,
    answers: answersRecord,
  } as SurveyRecord);

  const a14 = byQ.get('Q14');
  const n14 = defaultAnswerNormalizer.normalizeAnswer('Q14', a14 ? answersRecord.Q14 : undefined);
  const a20 = byQ.get('Q20');
  const n20 = defaultAnswerNormalizer.normalizeAnswer('Q20', a20 ? answersRecord.Q20 : undefined);

  const dupKeyEntries: string[] = [];
  const ambiguousFlags: string[] = [];
  for (const id of qids) {
    if (!defaultAnswerNormalizer.hasDuplicateNumericCodes(id)) continue;
    const raw = byQ.get(id);
    if (!raw) continue;
    const norm = defaultAnswerNormalizer.normalizeAnswer(id, {
      questionId: id,
      optionKeys: raw.optionKeys,
      optionCodes: raw.optionCodes,
      otherText: raw.otherText ?? undefined,
    });
    if (norm.is_missing) continue;
    if (norm.is_ambiguous_legacy) ambiguousFlags.push(id);
    else if (norm.option_keys.length > 0) dupKeyEntries.push(`${id}=${norm.option_keys.join('|')}`);
  }

  return {
    q14OptionKey: n14.is_ambiguous_legacy ? 'AMBIGUOUS_CODE_0' : n14.option_key ?? a14?.optionKeys[0] ?? '',
    q14SemanticCategory: n14.semantic_category,
    q20OptionKey: n20.is_ambiguous_legacy ? 'AMBIGUOUS_CODE_0' : n20.option_key ?? a20?.optionKeys[0] ?? '',
    q20SemanticCategory: n20.semantic_category,
    mpiScorePct: indices.mpiAnsweredCount > 0 ? indices.mpiScorePct : '',
    mpiPoor: indices.mpiAnsweredCount > 0 ? (indices.isMpiPoor ? 'YES' : 'NO') : '',
    hungerScore: indices.hhsAnsweredCount > 0 ? indices.hhsScore : '',
    hungerCategory: indices.hhsAnsweredCount > 0 ? indices.hhsCategory : '',
    dueProcessBreach: indices.dueProcessBreach ? 'YES' : 'NO',
    pre1971Settlement: indices.pre1971Settlement ? 'YES' : 'NO',
    duplicateCodeOptionKeys: dupKeyEntries.join('; '),
    semanticAmbiguousFlags: ambiguousFlags.join('|'),
  };
}
const recordDay = (profile: unknown, createdAt: Date): string => {
  const d = (profile as Record<string, unknown> | null)?.surveyDate;
  return typeof d === 'string' && YMD.test(d.slice(0, 10)) ? d.slice(0, 10) : createdAt.toISOString().slice(0, 10);
};
const inDateRange = (day: string, from?: string, to?: string): boolean => {
  if (from && YMD.test(from) && day < from) return false;
  if (to && YMD.test(to) && day > to) return false;
  return true;
};

const SURVEY_STATUSES: ReadonlySet<string> = new Set(['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REJECTED']);
const VERIFICATION_STATUSES: ReadonlySet<string> = new Set(['PENDING', 'VERIFIED', 'REJECTED']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Roles(...REVIEWER_ROLES)
@Controller({ path: 'exports', version: '1' })
export class ExportsController {
  constructor(
    private db: PrismaService,
    private audit: AuditService,
    private questionnaire: QuestionnaireService,
    private storage: StorageService
  ) {}

  private async surveys(me: AuthUser, status?: string, clusterId?: string, from?: string, to?: string) {
    const where: Prisma.SurveyWhereInput = { ...surveyScope(me) };
    if (status && status !== 'ALL') {
      if (!SURVEY_STATUSES.has(status)) {
        throw new BadRequestException({ code: 'INVALID_STATUS', message: `Unsupported survey status: ${status}` });
      }
      where.status = status as SurveyStatus;
    }
    if (clusterId && clusterId !== 'ALL') where.household = { AND: [(where.household as Prisma.HouseholdWhereInput) ?? {}, { clusterId }] }; // never widen the caller's scope
    const rows = await this.db.survey.findMany({
      where,
      include: { household: { include: { cluster: true } }, volunteer: { select: { name: true } }, answers: true },
      orderBy: { household: { code: 'asc' } },
    });
    if (!from && !to) return rows;
    return rows.filter((s) => inDateRange(recordDay(s.profile, s.createdAt), from, to));
  }

  /** One row per household; question columns hold option CODES (multi-select joined with |). */
  @Get('surveys.csv')
  async surveysCsv(
    @CurrentUser() me: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('clusterId') clusterId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    const qv = await this.questionnaire.latest();
    const qids = [...qv.questions.keys()];
    const rows = await this.surveys(me, status, clusterId, from, to);
    const header = [
      'surveyCode', 'status', 'cluster', 'volunteer', 'consentGiven', 'submittedAt',
      'gpsConsent', 'gpsLat', 'gpsLng', 'gpsAccuracyMeters', 'durationSec',
      ...PROFILE_COLUMNS, ...qids, ...qids.map((id) => `${id}_text`),
      'mpiScorePct', 'mpiPoor', 'hungerScore', 'hungerCategory', 'dueProcessBreach', 'pre1971Settlement',
      'q14OptionKey', 'q14SemanticCategory', 'q20OptionKey', 'q20SemanticCategory',
      'duplicateCodeOptionKeys', 'semanticAmbiguousFlags',
    ];
    const body = rows.map((s) => {
      const p = s.profile as Record<string, unknown>;
      const byQ = new Map(s.answers.map((a) => [a.questionId, a]));
      const derived = deriveIndices(qids, p, byQ);
      return [
        s.household.code, s.status, s.household.cluster.name, s.volunteer.name, s.consentGiven, s.submittedAt?.toISOString() ?? '',
        s.gpsConsent, s.gpsConsent ? s.gpsLat ?? '' : '', s.gpsConsent ? s.gpsLng ?? '' : '', s.gpsConsent ? s.gpsAccuracyMeters ?? '' : '', s.durationSec ?? '',
        ...PROFILE_COLUMNS.map((c) => p[c]),
        ...qids.map((id) => byQ.get(id)?.optionCodes ?? ''),
        ...qids.map((id) => byQ.get(id)?.otherText ?? ''),
        derived.mpiScorePct, derived.mpiPoor, derived.hungerScore, derived.hungerCategory,
        derived.dueProcessBreach, derived.pre1971Settlement,
        derived.q14OptionKey, derived.q14SemanticCategory, derived.q20OptionKey, derived.q20SemanticCategory,
        derived.duplicateCodeOptionKeys, derived.semanticAmbiguousFlags,
      ];
    });
    await this.audit.log({ actorId: me.sub, action: 'export_surveys_csv', entity: 'export', summary: `${me.name} exported ${rows.length} surveys (CSV)`, ip: req.ip });
    this.send(res, 'text/csv; charset=utf-8', `m2s-surveys-${today()}.csv`, csv([header, ...body]));
  }

  /** Long format: one row per answered question — easiest for SPSS/Stata/R. */
  @Get('answers.csv')
  async answersCsv(
    @CurrentUser() me: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('clusterId') clusterId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    const rows = await this.surveys(me, status, clusterId, from, to);
    const body: unknown[][] = [];
    for (const s of rows) {
      for (const a of [...s.answers].sort((x, y) => compareQuestionIds(x.questionId, y.questionId))) {
        const norm = defaultAnswerNormalizer.normalizeAnswer(a.questionId, {
          questionId: a.questionId,
          optionKeys: a.optionKeys,
          optionCodes: a.optionCodes,
          otherText: a.otherText ?? undefined,
        });
        body.push([
          s.household.code,
          s.household.cluster.name,
          s.status,
          a.questionId,
          a.optionCodes,
          a.optionKeys,
          norm.semantic_category,
          norm.is_ambiguous_legacy ? 'YES' : 'NO',
          a.otherText ?? '',
        ]);
      }
    }
    await this.audit.log({ actorId: me.sub, action: 'export_answers_csv', entity: 'export', summary: `${me.name} exported answers for ${rows.length} surveys (long CSV)`, ip: req.ip });
    this.send(
      res,
      'text/csv; charset=utf-8',
      `m2s-answers-long-${today()}.csv`,
      csv([['surveyCode', 'cluster', 'status', 'questionId', 'optionCodes', 'optionKeys', 'semanticCategory', 'isAmbiguousLegacy', 'text'], ...body])
    );
  }

  /** ZIP of document pages, one folder per household, plus a manifest. Bytes are streamed from private storage. */
  @Get('documents.zip')
  async documentsZip(
    @CurrentUser() me: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
    @Query('verification') verification?: string,
    @Query('clusterId') clusterId?: string,
    @Query('ids') ids?: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    const where: Prisma.DocumentWhereInput = { ...documentScope(me), status: 'AVAILABLE' };
    if (verification && verification !== 'ALL') {
      if (!VERIFICATION_STATUSES.has(verification)) {
        throw new BadRequestException({ code: 'INVALID_VERIFICATION', message: `Unsupported verification status: ${verification}` });
      }
      where.verificationStatus = verification as VerificationStatus;
    }
    if (clusterId && clusterId !== 'ALL') where.household = { AND: [(where.household as Prisma.HouseholdWhereInput) ?? {}, { clusterId }] }; // never widen the caller's scope
    // An explicit (even empty) ids filter means "exactly these" — never fall back to exporting everything.
    if (ids !== undefined) {
      const idList = [...new Set(ids.split(',').map((s) => s.trim()).filter(Boolean))];
      if (idList.length > 500) {
        throw new BadRequestException({ code: 'TOO_MANY_IDS', message: 'Select at most 500 documents per ZIP, or export by filter instead.' });
      }
      if (idList.some((x) => !UUID_RE.test(x))) {
        throw new BadRequestException({ code: 'INVALID_IDS', message: 'Document ids filter must contain valid UUIDs.' });
      }
      where.id = { in: idList };
    }
    const allDocs = await this.db.document.findMany({
      where,
      include: {
        household: { include: { survey: { select: { profile: true, createdAt: true } } } },
        pages: { orderBy: { pageNo: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const docs =
      !from && !to
        ? allDocs
        : allDocs.filter((d) =>
            inDateRange(
              d.household.survey ? recordDay(d.household.survey.profile, d.household.survey.createdAt) : d.createdAt.toISOString().slice(0, 10),
              from,
              to
            )
          );

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="m2s-documents-${today()}.zip"`);
    const zip = archiver('zip', { zlib: { level: 6 } });
    let aborted = false;
    zip.on('error', () => {
      aborted = true;
      res.destroy();
    });
    res.on('close', () => {
      if (!res.writableFinished) aborted = true;
    });
    zip.pipe(res);
    const manifest: unknown[][] = [['surveyCode', 'docType', 'categoryId', 'verification', 'aadhaarLast4', 'page', 'file', 'sha256']];
    const usedNames = new Set<string>();
    for (const d of docs) {
      if (aborted) break;
      for (const p of d.pages) {
        if (aborted) break;
        // Two documents of the same category for one household would otherwise collide inside the archive.
        let name = `${d.household.code}/${d.categoryId}-p${p.pageNo}-${p.fileName}`;
        if (usedNames.has(name)) name = `${d.household.code}/${d.categoryId}-${d.id.slice(0, 8)}-p${p.pageNo}-${p.fileName}`;
        usedNames.add(name);
        try {
          const buf = await this.storage.get(p.objectKey);
          // Wait until archiver has consumed this entry so a large export never holds every file in memory at once.
          await new Promise<void>((resolve) => {
            const done = () => {
              zip.off('entry', done);
              zip.off('error', done);
              resolve();
            };
            zip.on('entry', done);
            zip.on('error', done);
            zip.append(buf, { name });
          });
          manifest.push([d.household.code, d.docType, d.categoryId, d.verificationStatus, d.aadhaarLast4 ?? '', p.pageNo, name, p.sha256]);
        } catch {
          manifest.push([d.household.code, d.docType, d.categoryId, d.verificationStatus, d.aadhaarLast4 ?? '', p.pageNo, 'MISSING', p.sha256]);
        }
      }
    }
    if (aborted) return;
    zip.append(csv(manifest), { name: 'manifest.csv' });
    await this.audit.log({ actorId: me.sub, action: 'export_documents_zip', entity: 'export', summary: `${me.name} exported ${docs.length} documents (ZIP)`, ip: req.ip });
    await zip.finalize();
  }

  private send(res: Response, type: string, filename: string, body: string) {
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  }
}

const today = () => new Date().toISOString().slice(0, 10);
