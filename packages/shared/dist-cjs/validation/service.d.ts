import type { QualityIssue, QualityPolicyConfig, QualityResolutionRecord, ResolutionStatus, SurveyQualityReport, SurveyRecord, ValidationHistoryEntry } from '../types/survey';
import { SurveyAnswerNormalizer } from './normalizer';
import { IncrementalEngineResult, SurveyValidationEngine } from './engine';
import { type QualityEvaluationInput, type QualityInsightsFilter, type SurveyQualityPortfolioSummary } from './types';
export declare function sanitizeResolutionNote(raw: string | undefined | null, maxLen?: number): string;
export declare function buildAnswerSnapshot(survey: SurveyRecord, questionIds: string[]): Record<string, {
    optionKeys: string[];
    optionCodes: string[];
    otherText?: string;
}>;
export declare class SurveyQualityService {
    private readonly engine;
    constructor(engine?: SurveyValidationEngine);
    getEngine(): SurveyValidationEngine;
    /**
     * Runs centralized validation + applies persisted resolutions, overrides,
     * and submission policy rules without ever fabricating or mutating survey answers.
     */
    evaluate(input: QualityEvaluationInput): SurveyQualityReport;
    /**
     * Incremental evaluation when only specific questions or profile fields changed,
     * reusing cached unaffected rule outputs where possible.
     */
    evaluateIncremental(input: QualityEvaluationInput, changedKeys: string[], previousEngineResult?: IncrementalEngineResult | null): {
        report: SurveyQualityReport;
        engineResult: IncrementalEngineResult;
    };
    private assembleReport;
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
    }): {
        ok: boolean;
        error?: string;
        nextStatus?: ResolutionStatus;
        sanitizedNote: string;
    };
}
export declare class SurveyQualitySummary {
    private readonly service;
    constructor(service?: SurveyQualityService);
    /** Computes real aggregate metrics, top triggered rules, question inconsistency rates, volunteer stats, and review queue. */
    aggregatePortfolio(surveys: SurveyRecord[], opts?: {
        documents?: import('../types/survey').HouseholdDocument[];
        requiredDocCategoryIds?: string[];
        policy?: Partial<QualityPolicyConfig>;
        filter?: QualityInsightsFilter;
    }): SurveyQualityPortfolioSummary;
}
export declare const defaultQualityService: SurveyQualityService;
export declare const defaultQualitySummary: SurveyQualitySummary;
export { SurveyAnswerNormalizer };
export type OfflineQualityAction = 'UNDER_REVIEW' | 'VERIFIED' | 'ACKNOWLEDGED' | 'SUPERVISOR_APPROVE' | 'SUPERVISOR_WAIVE';
/**
 * Builds deterministic optimistic QualityResolutionRecord + ValidationHistoryEntry
 * so offline mobile/web UI immediately reflects verification & persists across restarts.
 */
export declare function buildOptimisticQualityRecords(input: {
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
};
/** Merges queued offline quality events non-destructively onto a SurveyRecord list. */
export declare function mergeQueuedQualityEvents(surveys: SurveyRecord[], events: Array<{
    id: string;
    surveyId: string;
    queuedAt: number;
    resolutionRecord?: QualityResolutionRecord;
    historyEntry?: ValidationHistoryEntry;
}>): SurveyRecord[];
