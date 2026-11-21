import type { NormalizedSurveyAnswer, QualityIssue, QualityPolicyConfig, QuestionDef, SurveyQualityReport } from '../types/survey';
import { SurveyRuleRegistry } from './rules';
import { type SerializedRuleMeta, type ValidationEngineInput } from './types';
export interface IncrementalEngineResult {
    issues: QualityIssue[];
    ruleIssuesByRuleId: Record<string, QualityIssue[]>;
    normalizedAnswers: SurveyQualityReport['normalizedAnswers'];
    evaluatedRuleIds: string[];
    policy: QualityPolicyConfig;
}
export declare class SurveyValidationEngine {
    private readonly registry;
    private readonly questions;
    constructor(registry?: SurveyRuleRegistry, questions?: QuestionDef[]);
    getRegistry(): SurveyRuleRegistry;
    getRuleManifest(): SerializedRuleMeta[];
    /** Evaluates all registered rules in a single pass with schema-driven semantic normalization. */
    validate(input: ValidationEngineInput): IncrementalEngineResult;
    /**
     * Incrementally re-evaluates only rules whose registered dependencies overlap `changedKeys`,
     * merging their fresh results with the cached unaffected rule outputs.
     */
    validateAffected(input: ValidationEngineInput, changedKeys: string[], previous?: IncrementalEngineResult | null): IncrementalEngineResult;
    private runRules;
    computeCompleteness(input: ValidationEngineInput, precomputedNormalized?: Record<string, NormalizedSurveyAnswer>): {
        completenessScore: number;
        answeredRequired: number;
        totalRequired: number;
        totalQuestions: number;
        answeredQuestions: number;
        missingQuestionIds: string[];
        profileCompletenessPct: number;
        questionsCompletenessPct: number;
        documentCompletion: {
            uploadedCount: number;
            verifiedCount: number;
            pendingCount: number;
            rejectedCount: number;
            missingRequiredCategories: string[];
        };
        lastSavedAt: string;
    };
}
export declare const defaultValidationEngine: SurveyValidationEngine;
