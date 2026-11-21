import type { NormalizedSurveyAnswer } from '../types/survey';
import type { SerializedRuleMeta, ValidationRuleContext, ValidationRuleDef } from './types';
declare function optKey(ctx: ValidationRuleContext, qId: string): string | null;
declare function optKeys(ctx: ValidationRuleContext, qId: string): string[];
declare function normOf(ctx: ValidationRuleContext, qId: string): NormalizedSurveyAnswer | undefined;
declare function isAnsweredOrNa(ctx: ValidationRuleContext, qId: string): boolean;
/**
 * Authoritative extensible validation rule catalog for the Assam-Wide Socio-Economic Baseline Survey
 * (Informed Consent + Part I B1–B10 + Part II Q1a–Q25b + Part III Q26–Q28).
 */
export declare const BUILTIN_VALIDATION_RULES: ValidationRuleDef[];
export declare const RULE_IDS: string[];
export declare const RULE_B4_DEMOGRAPHIC_TOTAL_MISMATCH: ValidationRuleDef;
export declare class SurveyRuleRegistry {
    private readonly rules;
    constructor(initialRules?: ValidationRuleDef[]);
    register(rule: ValidationRuleDef): void;
    listRules(): ValidationRuleDef[];
    getRuleIdsForDependencies(changedKeys: string[]): string[];
    getRuleManifest(): SerializedRuleMeta[];
}
export declare const defaultRuleRegistry: SurveyRuleRegistry;
/** Helper exported for external rule packs to verify answered-or-NA state. */
export { isAnsweredOrNa, optKey, optKeys, normOf };
