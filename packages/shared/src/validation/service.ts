import { QUESTIONS } from '../data/questionnaire';
import type {
  QualityIssue,
  QualityOverrideRecord,
  QualityPolicyConfig,
  QualityResolutionRecord,
  QualitySeverity,
  ResolutionStatus,
  SurveyQualityReport,
  SurveyRecord,
  ValidationHistoryEntry,
} from '../types/survey';
import { SurveyAnswerNormalizer } from './normalizer';
import { defaultValidationEngine, IncrementalEngineResult, SurveyValidationEngine } from './engine';
import {
  DEFAULT_QUALITY_POLICY,
  type PendingSupervisorQueueItem,
  type QualityEvaluationInput,
  type QualityInsightsFilter,
  type QuestionInconsistencyEntry,
  type RuleStatsEntry,
  type SurveyQualityPortfolioSummary,
  type VolunteerQualityStats,
} from './types';

const RESOLVED_STATUSES = new Set<ResolutionStatus>([
  'VERIFIED',
  'CORRECTED',
  'ACKNOWLEDGED',
  'SUPERVISOR_REVIEW_REQUIRED',
  'WAIVED_WITH_REASON',
]);

export function sanitizeResolutionNote(raw: string | undefined | null, maxLen = 500): string {
  if (!raw) return '';
  return String(raw)
    .replace(/<[^>]*>/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function buildAnswerSnapshot(
  survey: SurveyRecord,
  questionIds: string[]
): Record<string, { optionKeys: string[]; optionCodes: string[]; otherText?: string }> {
  const snap: Record<string, { optionKeys: string[]; optionCodes: string[]; otherText?: string }> = {};
  for (const qId of questionIds) {
    const a = survey.answers?.[qId];
    snap[qId] = a
      ? {
          optionKeys: [...a.optionKeys],
          optionCodes: [...a.optionCodes],
          ...(a.otherText ? { otherText: a.otherText } : {}),
        }
      : { optionKeys: [], optionCodes: [] };
  }
  return snap;
}

function snapshotsMatch(
  saved: Record<string, { optionKeys: string[]; optionCodes: string[]; otherText?: string }> | undefined,
  survey: SurveyRecord,
  questionIds: string[]
): boolean {
  if (!saved || questionIds.length === 0) return true;
  for (const qId of questionIds) {
    const prev = saved[qId];
    const cur = survey.answers?.[qId];
    const prevKeys = (prev?.optionKeys ?? []).join('|');
    const curKeys = (cur?.optionKeys ?? []).join('|');
    if (prevKeys !== curKeys) return false;
    const prevText = (prev?.otherText ?? '').trim();
    const curText = (cur?.otherText ?? '').trim();
    if (prevText !== curText) return false;
  }
  return true;
}

export class SurveyQualityService {
  constructor(private readonly engine: SurveyValidationEngine = defaultValidationEngine) {}

  getEngine(): SurveyValidationEngine {
    return this.engine;
  }

  /**
   * Runs centralized validation + applies persisted resolutions, overrides,
   * and submission policy rules without ever fabricating or mutating survey answers.
   */
  evaluate(input: QualityEvaluationInput): SurveyQualityReport {
    const engineResult = this.engine.validate(input);
    return this.assembleReport(input, engineResult);
  }

  /**
   * Incremental evaluation when only specific questions or profile fields changed,
   * reusing cached unaffected rule outputs where possible.
   */
  evaluateIncremental(
    input: QualityEvaluationInput,
    changedKeys: string[],
    previousEngineResult?: IncrementalEngineResult | null
  ): { report: SurveyQualityReport; engineResult: IncrementalEngineResult } {
    const engineResult = this.engine.validateAffected(input, changedKeys, previousEngineResult);
    return {
      report: this.assembleReport(input, engineResult),
      engineResult,
    };
  }

  private assembleReport(input: QualityEvaluationInput, engineResult: IncrementalEngineResult): SurveyQualityReport {
    const policy: QualityPolicyConfig = { ...DEFAULT_QUALITY_POLICY, ...(input.policy ?? {}), ...engineResult.policy };
    const resolutionsList = input.resolutions ?? input.survey.qualityResolutions ?? [];
    const history = [...(input.history ?? input.survey.qualityHistory ?? [])].sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
    );
    const overrides = input.overrides ?? input.survey.qualityOverrides ?? [];

    const resMap: Record<string, QualityResolutionRecord> = {};
    for (const r of resolutionsList) {
      resMap[r.ruleId] = r;
    }

    const activeOverrideByRule = new Map<string, QualityOverrideRecord>();
    for (const ov of overrides) {
      if (!ov.active) continue;
      for (const rId of ov.ruleIds) {
        activeOverrideByRule.set(rId, ov);
      }
    }

    const resolvedIssues: QualityIssue[] = engineResult.issues.map((issue) => {
      const ruleKey = issue.id;
      const parentRuleKey = issue.ruleId ?? issue.id;
      const res = resMap[ruleKey] ?? resMap[parentRuleKey];
      const ov =
        (policy.allowSupervisorOverride
          ? activeOverrideByRule.get(ruleKey) ?? activeOverrideByRule.get(parentRuleKey)
          : undefined) ?? undefined;

      let resolutionStatus: ResolutionStatus = 'OPEN';
      let resolutionNote = res?.note;
      let resolvedAt = res?.verifiedAt ?? res?.reviewedAt;
      let resolvedByName = res?.verifiedByName ?? res?.reviewedByName;
      let supervisorReviewStatus = res?.supervisorStatus;
      let overrideReason: string | undefined;

      if (ov) {
        resolutionStatus = 'WAIVED_WITH_REASON';
        overrideReason = ov.reason;
        resolvedAt = ov.createdAt;
        resolvedByName = ov.actorName;
        supervisorReviewStatus = 'WAIVED';
      } else if (res) {
        const snapshotValid = snapshotsMatch(res.answerSnapshot, input.survey, issue.relevantQuestionIds ?? []);
        if (res.status === 'WAIVED_WITH_REASON' && policy.allowSupervisorOverride) {
          resolutionStatus = 'WAIVED_WITH_REASON';
          overrideReason = res.supervisorNote || res.note;
          supervisorReviewStatus = res.supervisorStatus ?? 'WAIVED';
        } else if (res.status === 'UNDER_REVIEW') {
          resolutionStatus = 'UNDER_REVIEW';
        } else if (res.status === 'VERIFIED' || res.status === 'SUPERVISOR_REVIEW_REQUIRED') {
          // Strict contradictions that do not support verified exceptions CANNOT stay verified by click alone!
          if (!issue.supportsVerifiedException || !snapshotValid) {
            resolutionStatus = 'OPEN';
          } else {
            resolutionStatus =
              issue.supervisorReviewRecommended && policy.escalateVerifiedExceptionsToSupervisor && res.supervisorStatus !== 'APPROVED'
                ? 'SUPERVISOR_REVIEW_REQUIRED'
                : 'VERIFIED';
          }
        } else if (res.status === 'ACKNOWLEDGED') {
          if (issue.severity === 'error' || !snapshotValid) {
            resolutionStatus = 'OPEN';
          } else {
            resolutionStatus = 'ACKNOWLEDGED';
          }
        }
      }

      const waived = resolutionStatus === 'WAIVED_WITH_REASON';
      const effectiveBlocksSubmission =
        issue.severity === 'error' && (issue.blocksSubmission ?? true) && policy.blockOnErrors && !waived;

      return {
        ...issue,
        resolutionStatus,
        resolutionNote,
        resolvedAt,
        resolvedByName,
        supervisorReviewStatus,
        overrideReason,
        blocksSubmission: effectiveBlocksSubmission,
      };
    });

    const errors = resolvedIssues.filter((i) => i.severity === 'error');
    const warnings = resolvedIssues.filter((i) => i.severity === 'warning');
    const advisories = resolvedIssues.filter((i) => i.severity === 'advisory');
    const infos = resolvedIssues.filter((i) => i.severity === 'info');

    const unresolvedErrors = errors.filter((e) => e.resolutionStatus !== 'WAIVED_WITH_REASON' && (e.blocksSubmission ?? true));
    const unresolvedWarnings = warnings.filter(
      (w) =>
        Boolean(w.requiresAcknowledgement) &&
        (w.resolutionStatus === 'OPEN' || w.resolutionStatus === 'UNDER_REVIEW' || !w.resolutionStatus)
    );

    const hasBlockingErrors = policy.blockOnErrors && unresolvedErrors.length > 0;
    const blockingWarnings = policy.requireWarningAcknowledgement ? unresolvedWarnings : [];

    const submissionBlockReasons = [
      ...unresolvedErrors.map((e) => `${e.title}: ${e.detail}`),
      ...(policy.requireWarningAcknowledgement
        ? blockingWarnings.map((w) => `Verify/Acknowledge warning — ${w.title}`)
        : []),
    ];

    const completeness = this.engine.computeCompleteness(input, engineResult.normalizedAnswers);
    const needsSupervisorReview = resolvedIssues.some(
      (i) =>
        i.resolutionStatus === 'SUPERVISOR_REVIEW_REQUIRED' ||
        (i.supervisorReviewRecommended && i.resolutionStatus !== 'WAIVED_WITH_REASON' && i.supervisorReviewStatus !== 'APPROVED')
    );

    return {
      ...completeness,
      hasBlockingErrors,
      errors,
      warnings,
      advisories,
      infos,
      issues: resolvedIssues,
      unresolvedErrors,
      unresolvedWarnings,
      needsSupervisorReview,
      canSubmit: !hasBlockingErrors && blockingWarnings.length === 0,
      submissionBlockReasons,
      normalizedAnswers: engineResult.normalizedAnswers,
      resolutions: resMap,
      history,
      overrides,
      ruleCountEvaluated: engineResult.evaluatedRuleIds.length,
      affectedRuleIds: engineResult.evaluatedRuleIds,
    };
  }

  /**
   * Validates whether a proposed resolution action by an actor is legitimately allowed
   * under resolution workflow & RBAC rules (never allowing blind click-to-dismiss).
   */
  validateResolutionAction(input: {
    issue: QualityIssue;
    action: 'UNDER_REVIEW' | 'VERIFIED' | 'ACKNOWLEDGED' | 'SUPERVISOR_APPROVE' | 'SUPERVISOR_WAIVE';
    note?: string;
    actorRole: SurveyRecord['volunteerId'] extends string ? 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'VOLUNTEER' : never;
    policy?: Partial<QualityPolicyConfig>;
  }): { ok: boolean; error?: string; nextStatus?: ResolutionStatus; sanitizedNote: string } {
    const policy = { ...DEFAULT_QUALITY_POLICY, ...(input.policy ?? {}) };
    const sanitizedNote = sanitizeResolutionNote(input.note);
    const { issue, action, actorRole } = input;

    if (action === 'SUPERVISOR_WAIVE' || action === 'SUPERVISOR_APPROVE') {
      if (!['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'].includes(actorRole)) {
        return { ok: false, error: 'Only supervisors or admins can waive or approve escalated quality exceptions.', sanitizedNote };
      }
      if (action === 'SUPERVISOR_WAIVE' && sanitizedNote.length < 5) {
        return { ok: false, error: 'A supervisor override reason (at least 5 characters) is mandatory.', sanitizedNote };
      }
      return {
        ok: true,
        nextStatus: action === 'SUPERVISOR_WAIVE' ? 'WAIVED_WITH_REASON' : 'VERIFIED',
        sanitizedNote,
      };
    }

    if (action === 'UNDER_REVIEW') {
      return { ok: true, nextStatus: 'UNDER_REVIEW', sanitizedNote };
    }

    if (action === 'VERIFIED') {
      if (!issue.supportsVerifiedException) {
        return {
          ok: false,
          error:
            'This validation error cannot be marked verified while answers remain contradictory. Update the conflicting response(s), or request a Supervisor override.',
          sanitizedNote,
        };
      }
      if (sanitizedNote.length < 5) {
        return {
          ok: false,
          error: 'Please enter a brief field verification note (at least 5 characters) explaining why the current answers are accurate.',
          sanitizedNote,
        };
      }
      const nextStatus: ResolutionStatus =
        issue.supervisorReviewRecommended && policy.escalateVerifiedExceptionsToSupervisor
          ? 'SUPERVISOR_REVIEW_REQUIRED'
          : 'VERIFIED';
      return { ok: true, nextStatus, sanitizedNote };
    }

    if (action === 'ACKNOWLEDGED') {
      if (issue.severity === 'error') {
        return {
          ok: false,
          error: 'Critical validation errors cannot be bypassed by acknowledgement.',
          sanitizedNote,
        };
      }
      if (issue.supportsVerifiedException && sanitizedNote.length < 3) {
        return {
          ok: false,
          error: 'Please add a short note before acknowledging this consistency warning.',
          sanitizedNote,
        };
      }
      return { ok: true, nextStatus: 'ACKNOWLEDGED', sanitizedNote };
    }

    return { ok: false, error: 'Unsupported resolution action.', sanitizedNote };
  }
}

export class SurveyQualitySummary {
  constructor(private readonly service: SurveyQualityService = new SurveyQualityService()) {}

  /** Computes real aggregate metrics, top triggered rules, question inconsistency rates, volunteer stats, and review queue. */
  aggregatePortfolio(
    surveys: SurveyRecord[],
    opts: {
      documents?: import('../types/survey').HouseholdDocument[];
      requiredDocCategoryIds?: string[];
      policy?: Partial<QualityPolicyConfig>;
      filter?: QualityInsightsFilter;
    } = {}
  ): SurveyQualityPortfolioSummary {
    const f = opts.filter ?? {};
    const filteredSurveys = surveys.filter((s) => {
      const day = (s.profile?.surveyDate || s.createdAt || '').slice(0, 10);
      if (f.dateFrom && day < f.dateFrom) return false;
      if (f.dateTo && day > f.dateTo) return false;
      if (f.volunteerId && s.volunteerId !== f.volunteerId) return false;
      if (f.surveyStatus && s.status !== f.surveyStatus) return false;
      return true;
    });

    const evaluatedAll = filteredSurveys.map((survey) => ({
      survey,
      report: this.service.evaluate({
        survey,
        documents: opts.documents,
        peerSurveys: surveys,
        requiredDocCategoryIds: opts.requiredDocCategoryIds,
        elapsedSec: survey.durationSec,
        policy: opts.policy,
      }),
    }));

    const matchesIssueFilter = (issue: QualityIssue) => {
      if (f.severity && issue.severity !== f.severity) return false;
      if (f.questionId) {
        const qList = issue.relevantQuestionIds?.length
          ? issue.relevantQuestionIds
          : issue.questionId
            ? [issue.questionId]
            : [];
        if (!qList.includes(f.questionId)) return false;
      }
      if (f.resolutionStatus && (issue.resolutionStatus ?? 'OPEN') !== f.resolutionStatus) return false;
      return true;
    };

    const evaluatedReports = evaluatedAll.filter(({ report }) => {
      if (!f.severity && !f.questionId && !f.resolutionStatus) return true;
      return report.issues.some(matchesIssueFilter);
    });

    const totalSurveysReviewed = evaluatedReports.length;
    let surveysWithErrors = 0;
    let surveysWithWarnings = 0;
    let surveysWithAdvisories = 0;
    let unresolvedValidationIssues = 0;
    let totalIssues = 0;
    let resolvedIssues = 0;

    const ruleMap = new Map<string, RuleStatsEntry>();
    const qMap = new Map<string, { triggered: number; error: number; warning: number; advisory: number }>();
    const volMap = new Map<
      string,
      VolunteerQualityStats & { totalIssues: number; resolvedIssues: number }
    >();
    const pendingSupervisorQueue: PendingSupervisorQueueItem[] = [];
    const resolutionDurationsMin: number[] = [];

    for (const { survey, report } of evaluatedReports) {
      const scopedIssues = report.issues.filter(matchesIssueFilter);
      const hasErr = scopedIssues.some((i) => i.severity === 'error');
      const hasWarn = scopedIssues.some((i) => i.severity === 'warning');
      const hasAdv = scopedIssues.some((i) => i.severity === 'advisory');
      if (hasErr) surveysWithErrors++;
      if (hasWarn) surveysWithWarnings++;
      if (hasAdv) surveysWithAdvisories++;

      const volEntry = volMap.get(survey.volunteerId) ?? {
        volunteerId: survey.volunteerId,
        volunteerName: survey.volunteerName || 'Unknown',
        surveysCount: 0,
        surveysWithErrors: 0,
        surveysWithWarnings: 0,
        unresolvedIssues: 0,
        overridesCount: 0,
        resolutionRatePct: 100,
        totalIssues: 0,
        resolvedIssues: 0,
      };
      volEntry.surveysCount++;
      if (hasErr) volEntry.surveysWithErrors++;
      if (hasWarn) volEntry.surveysWithWarnings++;
      volEntry.overridesCount += (survey.qualityOverrides ?? []).filter((o) => o.active).length;

      const seenQuestionsInSurvey = new Set<string>();

      for (const issue of scopedIssues) {
        if (issue.severity === 'info') continue;
        totalIssues++;
        volEntry.totalIssues++;

        const status = issue.resolutionStatus ?? 'OPEN';
        const isResolved = RESOLVED_STATUSES.has(status) && status !== 'SUPERVISOR_REVIEW_REQUIRED';
        if (isResolved) {
          resolvedIssues++;
          volEntry.resolvedIssues++;
        } else if (issue.severity === 'error' || issue.severity === 'warning') {
          unresolvedValidationIssues++;
          volEntry.unresolvedIssues++;
        }

        const rKey = issue.ruleId ?? issue.id;
        const rStat = ruleMap.get(rKey) ?? {
          ruleId: rKey,
          code: issue.code,
          title: issue.title,
          severity: issue.severity,
          triggeredCount: 0,
          openCount: 0,
          resolvedCount: 0,
        };
        rStat.triggeredCount++;
        if (isResolved) rStat.resolvedCount++;
        else rStat.openCount++;
        ruleMap.set(rKey, rStat);

        const relQs = issue.relevantQuestionIds?.length
          ? issue.relevantQuestionIds
          : issue.questionId
            ? [issue.questionId]
            : [];
        for (const qId of relQs) {
          if (seenQuestionsInSurvey.has(`${rKey}:${qId}`)) continue;
          seenQuestionsInSurvey.add(`${rKey}:${qId}`);
          const qs = qMap.get(qId) ?? { triggered: 0, error: 0, warning: 0, advisory: 0 };
          qs.triggered++;
          if (issue.severity === 'error') qs.error++;
          else if (issue.severity === 'warning') qs.warning++;
          else if (issue.severity === 'advisory') qs.advisory++;
          qMap.set(qId, qs);
        }

        if (
          status === 'SUPERVISOR_REVIEW_REQUIRED' ||
          (issue.severity === 'error' && status !== 'WAIVED_WITH_REASON')
        ) {
          pendingSupervisorQueue.push({
            surveyId: survey.id,
            householdId: survey.householdId,
            surveyCode: survey.surveyCode || 'Unsynced',
            headName: survey.profile.headName || 'Household',
            clusterId: survey.clusterId,
            clusterName: survey.clusterName,
            volunteerId: survey.volunteerId,
            volunteerName: survey.volunteerName || 'Unknown',
            surveyStatus: survey.status,
            ruleId: rKey,
            ruleTitle: issue.title,
            severity: issue.severity,
            resolutionStatus: status,
            note: issue.resolutionNote,
            relevantQuestionIds: relQs,
            updatedAt: issue.resolvedAt || survey.updatedAt,
          });
        }
      }

      // Compute resolution time from history entries if available
      const history = survey.qualityHistory ?? [];
      const firstTriggeredByRule = new Map<string, number>();
      for (const h of [...history].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))) {
        const ts = Date.parse(h.timestamp);
        if (!Number.isFinite(ts)) continue;
        if ((h.eventType === 'TRIGGERED' || h.eventType === 'REOPENED') && !firstTriggeredByRule.has(h.ruleId)) {
          firstTriggeredByRule.set(h.ruleId, ts);
        } else if (
          h.eventType === 'CORRECTED' ||
          h.eventType === 'VERIFIED' ||
          h.eventType === 'OVERRIDE_APPLIED' ||
          h.eventType === 'SUPERVISOR_WAIVED' ||
          h.eventType === 'SUPERVISOR_APPROVED'
        ) {
          const start = firstTriggeredByRule.get(h.ruleId);
          if (start != null && ts >= start) {
            resolutionDurationsMin.push((ts - start) / 60000);
          }
        }
      }

      volMap.set(survey.volunteerId, volEntry);
    }

    const resolutionRatePct = totalIssues > 0 ? Math.round((resolvedIssues / totalIssues) * 100) : 100;
    const avgResolutionMinutes =
      resolutionDurationsMin.length > 0
        ? Math.round((resolutionDurationsMin.reduce((a, b) => a + b, 0) / resolutionDurationsMin.length) * 10) / 10
        : null;

    const volunteerStats: VolunteerQualityStats[] = [...volMap.values()]
      .map((v) => ({
        volunteerId: v.volunteerId,
        volunteerName: v.volunteerName,
        surveysCount: v.surveysCount,
        surveysWithErrors: v.surveysWithErrors,
        surveysWithWarnings: v.surveysWithWarnings,
        unresolvedIssues: v.unresolvedIssues,
        overridesCount: v.overridesCount,
        resolutionRatePct: v.totalIssues > 0 ? Math.round((v.resolvedIssues / v.totalIssues) * 100) : 100,
      }))
      .sort((a, b) => b.unresolvedIssues - a.unresolvedIssues || b.surveysCount - a.surveysCount);

    const questionInconsistencyRates: QuestionInconsistencyEntry[] = [...qMap.entries()]
      .filter(([qId]) => QUESTIONS.some((q) => q.id === qId) || qId.startsWith('Q'))
      .map(([questionId, counts]) => ({
        questionId,
        triggeredCount: counts.triggered,
        errorCount: counts.error,
        warningCount: counts.warning,
        advisoryCount: counts.advisory,
        inconsistencyRatePct: totalSurveysReviewed > 0 ? Math.round((counts.triggered / totalSurveysReviewed) * 100) : 0,
      }))
      .sort((a, b) => b.triggeredCount - a.triggeredCount);

    const topTriggeredRules = [...ruleMap.values()].sort((a, b) => b.triggeredCount - a.triggeredCount);

    return {
      totalSurveysReviewed,
      surveysWithErrors,
      surveysWithWarnings,
      surveysWithAdvisories,
      unresolvedValidationIssues,
      totalIssues,
      resolvedIssues,
      resolutionRatePct,
      avgResolutionMinutes,
      topTriggeredRules,
      questionInconsistencyRates,
      volunteerStats,
      pendingSupervisorQueue: pendingSupervisorQueue.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
      evaluatedReports,
    };
  }
}

export const defaultQualityService = new SurveyQualityService();
export const defaultQualitySummary = new SurveyQualitySummary(defaultQualityService);
export { SurveyAnswerNormalizer };

export type OfflineQualityAction = 'UNDER_REVIEW' | 'VERIFIED' | 'ACKNOWLEDGED' | 'SUPERVISOR_APPROVE' | 'SUPERVISOR_WAIVE';

const OFFLINE_EVENT_TYPE: Record<OfflineQualityAction, import('../types/survey').ValidationHistoryEntry['eventType']> = {
  UNDER_REVIEW: 'OPENED',
  VERIFIED: 'VERIFIED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  SUPERVISOR_APPROVE: 'SUPERVISOR_APPROVED',
  SUPERVISOR_WAIVE: 'SUPERVISOR_WAIVED',
};

/**
 * Builds deterministic optimistic QualityResolutionRecord + ValidationHistoryEntry
 * so offline mobile/web UI immediately reflects verification & persists across restarts.
 */
export function buildOptimisticQualityRecords(input: {
  survey: SurveyRecord;
  issue: QualityIssue;
  action: OfflineQualityAction;
  nextStatus: ResolutionStatus;
  sanitizedNote: string;
  actorId: string;
  actorName: string;
  actorRole: import('../types/survey').Role;
  clientEventId: string;
  nowIso?: string;
}): {
  resolutionRecord: QualityResolutionRecord;
  historyEntry: ValidationHistoryEntry;
} {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const snapshot = buildAnswerSnapshot(input.survey, input.issue.relevantQuestionIds ?? []);
  const supervisorStatus: QualityResolutionRecord['supervisorStatus'] =
    input.action === 'SUPERVISOR_APPROVE'
      ? 'APPROVED'
      : input.action === 'SUPERVISOR_WAIVE'
        ? 'WAIVED'
        : input.nextStatus === 'SUPERVISOR_REVIEW_REQUIRED'
          ? 'PENDING'
          : undefined;

  const resolutionRecord: QualityResolutionRecord = {
    id: input.clientEventId,
    surveyId: input.survey.id,
    ruleId: input.issue.id,
    ruleVersion: input.issue.ruleVersion ?? '1.0.0',
    status: input.nextStatus,
    note: input.sanitizedNote || undefined,
    verifiedById: input.actorRole === 'VOLUNTEER' ? input.actorId : undefined,
    verifiedByName: input.actorRole === 'VOLUNTEER' ? input.actorName : undefined,
    verifiedAt: input.action === 'VERIFIED' || input.action === 'ACKNOWLEDGED' ? nowIso : undefined,
    answerSnapshot: snapshot,
    supervisorStatus,
    supervisorNote:
      input.action === 'SUPERVISOR_APPROVE' || input.action === 'SUPERVISOR_WAIVE' ? input.sanitizedNote || undefined : undefined,
    reviewedById: input.action === 'SUPERVISOR_APPROVE' || input.action === 'SUPERVISOR_WAIVE' ? input.actorId : undefined,
    reviewedByName: input.action === 'SUPERVISOR_APPROVE' || input.action === 'SUPERVISOR_WAIVE' ? input.actorName : undefined,
    reviewedAt: input.action === 'SUPERVISOR_APPROVE' || input.action === 'SUPERVISOR_WAIVE' ? nowIso : undefined,
    clientEventId: input.clientEventId,
    updatedAt: nowIso,
  };

  const historyEntry: ValidationHistoryEntry = {
    id: input.clientEventId,
    surveyId: input.survey.id,
    ruleId: input.issue.id,
    ruleTitle: input.issue.title,
    severity: input.issue.severity,
    eventType:
      input.nextStatus === 'SUPERVISOR_REVIEW_REQUIRED' ? 'SUPERVISOR_QUEUED' : OFFLINE_EVENT_TYPE[input.action],
    status: input.nextStatus,
    timestamp: nowIso,
    actorId: input.actorId,
    actorName: input.actorName,
    actorRole: input.actorRole,
    note: input.sanitizedNote || undefined,
    updatedAnswers: snapshot,
    supervisorStatus,
    clientEventId: input.clientEventId,
  };

  return { resolutionRecord, historyEntry };
}

/** Merges queued offline quality events non-destructively onto a SurveyRecord list. */
export function mergeQueuedQualityEvents(
  surveys: SurveyRecord[],
  events: Array<{
    id: string;
    surveyId: string;
    queuedAt: number;
    resolutionRecord?: QualityResolutionRecord;
    historyEntry?: ValidationHistoryEntry;
  }>
): SurveyRecord[] {
  if (!events.length) return surveys;
  const bySurvey = new Map<string, typeof events>();
  for (const ev of [...events].sort((a, b) => a.queuedAt - b.queuedAt)) {
    const arr = bySurvey.get(ev.surveyId) ?? [];
    arr.push(ev);
    bySurvey.set(ev.surveyId, arr);
  }
  return surveys.map((s) => {
    const evs = bySurvey.get(s.id);
    if (!evs?.length) return s;
    const resMap = new Map<string, QualityResolutionRecord>((s.qualityResolutions ?? []).map((r) => [r.ruleId, r]));
    const histSeen = new Set((s.qualityHistory ?? []).map((h) => h.clientEventId || h.id));
    const history = [...(s.qualityHistory ?? [])];
    for (const ev of evs) {
      if (ev.resolutionRecord) resMap.set(ev.resolutionRecord.ruleId, ev.resolutionRecord);
      if (ev.historyEntry && !histSeen.has(ev.historyEntry.clientEventId || ev.historyEntry.id)) {
        histSeen.add(ev.historyEntry.clientEventId || ev.historyEntry.id);
        history.unshift(ev.historyEntry);
      }
    }
    return {
      ...s,
      qualityResolutions: [...resMap.values()],
      qualityHistory: history,
    };
  });
}
