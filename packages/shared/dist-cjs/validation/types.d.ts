import type { HouseholdDocument, NormalizedSurveyAnswer, QualityCategory, QualityOverrideRecord, QualityPolicyConfig, QualityResolutionRecord, QualitySeverity, QuestionDef, ResolutionStatus, SurveyQualityReport, SurveyRecord, ValidationHistoryEntry } from '../types/survey';
export declare const DEFAULT_QUALITY_POLICY: QualityPolicyConfig;
export interface ValidationRuleContext {
    survey: SurveyRecord;
    questions: QuestionDef[];
    questionById: Map<string, QuestionDef>;
    normalized: Record<string, NormalizedSurveyAnswer>;
    documents: HouseholdDocument[];
    peerSurveys: SurveyRecord[];
    requiredDocCategoryIds: string[];
    elapsedSec?: number;
    policy: QualityPolicyConfig;
}
export interface ValidationRuleMatch {
    id?: string;
    code?: string;
    severity?: QualitySeverity;
    questionId?: string;
    relevantQuestionIds?: string[];
    sectionKey?: string;
    title?: string;
    detail: string;
    explanation?: string;
    suggestedCorrection?: string;
    answeredSummary?: string;
    dataInterpretation?: string;
    suggestedSupervisorAction?: string;
    blocksSubmission?: boolean;
    requiresAcknowledgement?: boolean;
    supervisorReviewRecommended?: boolean;
    supportsVerifiedException?: boolean;
}
export interface ValidationRuleDef {
    id: string;
    version: string;
    title: string;
    code: string;
    severity: QualitySeverity;
    category: QualityCategory;
    dependencies: string[];
    relevantQuestionIds: string[];
    sectionKey?: string;
    requiresAcknowledgement: boolean;
    supervisorReviewRecommended: boolean;
    supportsVerifiedException: boolean;
    blocksSubmission: boolean;
    description: string;
    evaluate: (ctx: ValidationRuleContext) => ValidationRuleMatch | ValidationRuleMatch[] | null;
}
export interface SerializedRuleMeta {
    id: string;
    version: string;
    title: string;
    code: string;
    severity: QualitySeverity;
    category: QualityCategory;
    dependencies: string[];
    relevantQuestionIds: string[];
    requiresAcknowledgement: boolean;
    supervisorReviewRecommended: boolean;
    supportsVerifiedException: boolean;
    blocksSubmission: boolean;
    description: string;
}
export interface ValidationEngineInput {
    survey: SurveyRecord;
    questions?: QuestionDef[];
    documents?: HouseholdDocument[];
    peerSurveys?: SurveyRecord[];
    requiredDocCategoryIds?: string[];
    elapsedSec?: number;
    policy?: Partial<QualityPolicyConfig>;
}
export interface QualityEvaluationInput extends ValidationEngineInput {
    resolutions?: QualityResolutionRecord[];
    history?: ValidationHistoryEntry[];
    overrides?: QualityOverrideRecord[];
}
export interface RuleStatsEntry {
    ruleId: string;
    code: string;
    title: string;
    severity: QualitySeverity;
    triggeredCount: number;
    openCount: number;
    resolvedCount: number;
}
export interface QuestionInconsistencyEntry {
    questionId: string;
    triggeredCount: number;
    errorCount: number;
    warningCount: number;
    advisoryCount: number;
    inconsistencyRatePct: number;
}
export interface VolunteerQualityStats {
    volunteerId: string;
    volunteerName: string;
    surveysCount: number;
    surveysWithErrors: number;
    surveysWithWarnings: number;
    unresolvedIssues: number;
    overridesCount: number;
    resolutionRatePct: number;
}
export interface PendingSupervisorQueueItem {
    surveyId: string;
    householdId: string;
    surveyCode: string;
    headName: string;
    clusterId: string;
    clusterName: string;
    volunteerId: string;
    volunteerName: string;
    surveyStatus: SurveyRecord['status'];
    ruleId: string;
    ruleTitle: string;
    severity: QualitySeverity;
    resolutionStatus: ResolutionStatus;
    note?: string;
    relevantQuestionIds: string[];
    updatedAt: string;
}
export interface QualityInsightsFilter {
    dateFrom?: string;
    dateTo?: string;
    volunteerId?: string;
    surveyStatus?: string;
    severity?: QualitySeverity | '';
    questionId?: string;
    resolutionStatus?: ResolutionStatus | '';
}
export interface SurveyQualityPortfolioSummary {
    totalSurveysReviewed: number;
    surveysWithErrors: number;
    surveysWithWarnings: number;
    surveysWithAdvisories: number;
    unresolvedValidationIssues: number;
    totalIssues: number;
    resolvedIssues: number;
    resolutionRatePct: number;
    avgResolutionMinutes: number | null;
    topTriggeredRules: RuleStatsEntry[];
    questionInconsistencyRates: QuestionInconsistencyEntry[];
    volunteerStats: VolunteerQualityStats[];
    pendingSupervisorQueue: PendingSupervisorQueueItem[];
    evaluatedReports: {
        survey: SurveyRecord;
        report: SurveyQualityReport;
    }[];
}
