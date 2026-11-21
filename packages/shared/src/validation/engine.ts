import { QUESTIONS } from '../data/questionnaire';
import { isAnswered, isRequired } from '../survey/surveyModel';
import type {
  NormalizedSurveyAnswer,
  QualityIssue,
  QualityPolicyConfig,
  QuestionDef,
  SurveyQualityReport,
} from '../types/survey';
import { defaultAnswerNormalizer, SurveyAnswerNormalizer } from './normalizer';
import { defaultRuleRegistry, SurveyRuleRegistry } from './rules';
import {
  DEFAULT_QUALITY_POLICY,
  type SerializedRuleMeta,
  type ValidationEngineInput,
  type ValidationRuleContext,
  type ValidationRuleDef,
  type ValidationRuleMatch,
} from './types';

export interface IncrementalEngineResult {
  issues: QualityIssue[];
  ruleIssuesByRuleId: Record<string, QualityIssue[]>;
  normalizedAnswers: SurveyQualityReport['normalizedAnswers'];
  evaluatedRuleIds: string[];
  policy: QualityPolicyConfig;
}

function toQualityIssue(rule: ValidationRuleDef, match: ValidationRuleMatch, idx: number): QualityIssue {
  const rel = match.relevantQuestionIds ?? rule.relevantQuestionIds;
  const qId = match.questionId ?? rel[0];
  return {
    id: match.id ?? (idx === 0 ? rule.id : `${rule.id}_${idx}`),
    code: match.code ?? rule.code,
    ruleId: rule.id,
    ruleVersion: rule.version,
    severity: match.severity ?? rule.severity,
    category: rule.category,
    questionId: qId,
    relevantQuestionIds: rel,
    dependencies: rule.dependencies,
    sectionKey: match.sectionKey ?? rule.sectionKey,
    title: match.title ?? rule.title,
    detail: match.detail,
    explanation: match.explanation ?? rule.description,
    suggestedCorrection: match.suggestedCorrection,
    answeredSummary: match.answeredSummary,
    dataInterpretation: match.dataInterpretation,
    suggestedSupervisorAction: match.suggestedSupervisorAction,
    requiresAcknowledgement: match.requiresAcknowledgement ?? rule.requiresAcknowledgement,
    supervisorReviewRecommended: match.supervisorReviewRecommended ?? rule.supervisorReviewRecommended,
    supportsVerifiedException: match.supportsVerifiedException ?? rule.supportsVerifiedException,
    blocksSubmission: match.blocksSubmission ?? rule.blocksSubmission,
  };
}

export class SurveyValidationEngine {
  constructor(
    private readonly registry: SurveyRuleRegistry = defaultRuleRegistry,
    private readonly questions: QuestionDef[] = QUESTIONS
  ) {}

  getRegistry(): SurveyRuleRegistry {
    return this.registry;
  }

  getRuleManifest(): SerializedRuleMeta[] {
    return this.registry.getRuleManifest();
  }

  /** Evaluates all registered rules in a single pass with schema-driven semantic normalization. */
  validate(input: ValidationEngineInput): IncrementalEngineResult {
    return this.runRules(input, this.registry.listRules());
  }

  /**
   * Incrementally re-evaluates only rules whose registered dependencies overlap `changedKeys`,
   * merging their fresh results with the cached unaffected rule outputs.
   */
  validateAffected(
    input: ValidationEngineInput,
    changedKeys: string[],
    previous?: IncrementalEngineResult | null
  ): IncrementalEngineResult {
    if (!previous || changedKeys.length === 0) {
      return this.validate(input);
    }
    const targetIds = new Set(this.registry.getRuleIdsForDependencies(changedKeys));
    if (targetIds.size === 0) {
      return previous;
    }
    const targetRules = this.registry.listRules().filter((r) => targetIds.has(r.id));
    const delta = this.runRules(input, targetRules);

    const mergedByRule: Record<string, QualityIssue[]> = { ...previous.ruleIssuesByRuleId };
    for (const id of targetIds) {
      const next = delta.ruleIssuesByRuleId[id];
      if (next && next.length > 0) mergedByRule[id] = next;
      else delete mergedByRule[id];
    }

    const issues = this.registry
      .listRules()
      .flatMap((r) => mergedByRule[r.id] ?? []);

    return {
      issues,
      ruleIssuesByRuleId: mergedByRule,
      normalizedAnswers: delta.normalizedAnswers,
      evaluatedRuleIds: [...targetIds],
      policy: delta.policy,
    };
  }

  private runRules(input: ValidationEngineInput, rules: ValidationRuleDef[]): IncrementalEngineResult {
    const questions = input.questions ?? this.questions;
    const normalizer = questions === this.questions ? defaultAnswerNormalizer : new SurveyAnswerNormalizer(questions);
    const normalized = normalizer.normalizeSurveyAnswers(input.survey);
    const policy: QualityPolicyConfig = { ...DEFAULT_QUALITY_POLICY, ...(input.policy ?? {}) };

    const ctx: ValidationRuleContext = {
      survey: input.survey,
      questions,
      questionById: new Map(questions.map((q) => [q.id, q])),
      normalized,
      documents: input.documents ?? [],
      peerSurveys: input.peerSurveys ?? [],
      requiredDocCategoryIds: input.requiredDocCategoryIds ?? [],
      elapsedSec: input.elapsedSec,
      policy,
    };

    const ruleIssuesByRuleId: Record<string, QualityIssue[]> = {};
    const issues: QualityIssue[] = [];

    for (const rule of rules) {
      const raw = rule.evaluate(ctx);
      if (!raw) continue;
      const list = Array.isArray(raw) ? raw : [raw];
      if (list.length === 0) continue;
      const converted = list.map((m, idx) => toQualityIssue(rule, m, idx));
      ruleIssuesByRuleId[rule.id] = converted;
      issues.push(...converted);
    }

    return {
      issues,
      ruleIssuesByRuleId,
      normalizedAnswers: normalized,
      evaluatedRuleIds: rules.map((r) => r.id),
      policy,
    };
  }

  computeCompleteness(input: ValidationEngineInput, precomputedNormalized?: Record<string, NormalizedSurveyAnswer>) {
    const questions = input.questions ?? this.questions;
    const normalizer = questions === this.questions ? defaultAnswerNormalizer : new SurveyAnswerNormalizer(questions);
    const normalized = precomputedNormalized ?? normalizer.normalizeSurveyAnswers(input.survey);
    const p = input.survey.profile;
    const mandatoryProfileChecks = [
      Boolean(p.clusterId),
      Boolean(p.headName?.trim()),
      p.totalMembers >= 1,
      Boolean(p.surveyDate),
      Boolean(input.survey.consentGiven),
    ];
    const profilePct = Math.round((mandatoryProfileChecks.filter(Boolean).length / mandatoryProfileChecks.length) * 100);

    const hasAnswer = (q: QuestionDef) => {
      const a = input.survey.answers[q.id];
      if (!a) return false;
      if (isAnswered(q, a)) return true;
      const n = normalized[q.id];
      return Boolean(n && !n.is_missing);
    };

    const requiredQuestions = questions.filter((q) => isRequired(q));
    const answeredRequired = requiredQuestions.filter(hasAnswer).length;
    const totalAnswered = questions.filter(hasAnswer).length;
    const missingQuestionIds = requiredQuestions.filter((q) => !hasAnswer(q)).map((q) => q.id);
    const questionsPct = requiredQuestions.length ? Math.round((answeredRequired / requiredQuestions.length) * 100) : 100;
    const completenessScore = Math.round(profilePct * 0.2 + questionsPct * 0.8);

    const hhDocs = (input.documents ?? []).filter((d) => d.householdId === input.survey.householdId);
    const missingRequiredCategories = (input.requiredDocCategoryIds ?? []).filter(
      (catId) => !hhDocs.some((d) => d.categoryId === catId)
    );

    return {
      completenessScore,
      answeredRequired,
      totalRequired: requiredQuestions.length,
      totalQuestions: questions.length,
      answeredQuestions: totalAnswered,
      missingQuestionIds,
      profileCompletenessPct: profilePct,
      questionsCompletenessPct: questionsPct,
      documentCompletion: {
        uploadedCount: hhDocs.length,
        verifiedCount: hhDocs.filter((d) => d.verificationStatus === 'VERIFIED').length,
        pendingCount: hhDocs.filter((d) => d.verificationStatus === 'PENDING').length,
        rejectedCount: hhDocs.filter((d) => d.verificationStatus === 'REJECTED').length,
        missingRequiredCategories,
      },
      lastSavedAt: input.survey.updatedAt,
    };
  }
}

export const defaultValidationEngine = new SurveyValidationEngine();
