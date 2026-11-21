import type { HouseholdDocument, SurveyQualityReport, SurveyRecord } from '../types/survey';
import { defaultQualityService, defaultQualitySummary, type QualityEvaluationInput } from '../validation';
export type QualityCheckContext = QualityEvaluationInput;
export declare function evaluateSurveyQuality(ctx: {
    survey: SurveyRecord;
    documents?: HouseholdDocument[];
    peerSurveys?: SurveyRecord[];
    requiredDocCategoryIds?: string[];
    elapsedSec?: number;
    policy?: QualityEvaluationInput['policy'];
    resolutions?: QualityEvaluationInput['resolutions'];
    history?: QualityEvaluationInput['history'];
    overrides?: QualityEvaluationInput['overrides'];
}): SurveyQualityReport;
export { defaultQualityService, defaultQualitySummary };
