import { describe, expect, it } from 'vitest';
import { createEmptyProfile, QUESTIONS } from '@m2s/shared/data/questionnaire';
import type { QuestionAnswer, SurveyRecord } from '@m2s/shared/types/survey';
import {
  buildOptimisticQualityRecords,
  DEFAULT_QUALITY_POLICY,
  defaultAnswerNormalizer,
  defaultQualityService,
  defaultQualitySummary,
  defaultRuleRegistry,
  mergeQueuedQualityEvents,
  SurveyRuleRegistry,
  SurveyValidationEngine,
  SurveyQualityService,
} from '@m2s/shared/validation';
import { aggregateStudyIndices, evaluateHouseholdIndices } from '@m2s/shared/utils/studyIndicators';

function buildValidBaselineAnswers(overrides: Record<string, QuestionAnswer> = {}): Record<string, QuestionAnswer> {
  const answers: Record<string, QuestionAnswer> = {};
  for (const q of QUESTIONS) {
    if (q.type === 'text') continue;
    if (q.type === 'date') {
      answers[q.id] = { questionId: q.id, optionKeys: [], optionCodes: [], otherText: '2025-07-12' };
      continue;
    }
    const first = q.options?.[0];
    if (first) {
      answers[q.id] = {
        questionId: q.id,
        optionKeys: [first.key],
        optionCodes: [first.code],
        ...(q.alwaysShowDetailInput ? { otherText: 'Recorded during household interview' } : {}),
      };
    }
  }
  // Keep Q5=2 & Q13=1 non-contradictory by default
  answers.Q5 = { questionId: 'Q5', optionKeys: ['2'], optionCodes: ['2'] };
  answers.Q13 = { questionId: 'Q13', optionKeys: ['1'], optionCodes: ['1'] };
  answers.Q12a = { questionId: 'Q12a', optionKeys: ['1'], optionCodes: ['1'] };
  answers.Q12b = { questionId: 'Q12b', optionKeys: ['1'], optionCodes: ['1'] };
  return { ...answers, ...overrides };
}

function makeSurvey(overrides: Partial<SurveyRecord> = {}): SurveyRecord {
  const profile = createEmptyProfile('M2S-000777', 'Talha');
  profile.surveyDate = '2026-11-11';
  profile.clusterId = 'kandapara';
  profile.clusterName = 'Kandapara';
  profile.districtCode = '1';
  profile.headName = 'Salimuddin Sheikh';
  profile.headAge = 38;
  profile.headStatusCode = '1';
  profile.docVerifiedCode = '0';
  profile.docVerifiedLabel = 'No documents shown';
  profile.totalMembers = 4;
  profile.maleCount = 2;
  profile.femaleCount = 2;
  profile.otherGenderCount = 0;
  profile.ageUnder1 = 0;
  profile.age1to5 = 1;
  profile.age0to5 = 1;
  profile.age6to14 = 1;
  profile.age15to17 = 0;
  profile.age18to59 = 2;
  profile.age60Plus = 0;
  profile.incomeBeforeCode = '4';
  profile.incomeNowCode = '1';
  profile.landOwnedCode = '2';

  return {
    id: 'srv-q-1',
    householdId: 'hh-q-1',
    surveyCode: 'M2S-000777',
    clusterId: 'kandapara',
    clusterName: 'Kandapara',
    volunteerId: 'vol-1',
    volunteerName: 'Talha Tanweer',
    status: 'DRAFT',
    revision: 1,
    consentGiven: true,
    durationSec: 420,
    profile,
    answers: buildValidBaselineAnswers(),
    reviews: [],
    createdAt: '2026-11-11T08:00:00Z',
    updatedAt: '2026-11-11T08:10:00Z',
    ...overrides,
  };
}

describe('Intelligent Survey Quality Checker — 20 Core Validation & Architecture Scenarios', () => {
  it('1-5: validates Q7 schooling & B4 child count contradictions without mutating answers', () => {
    // 1. Valid: B4 age6to14=1 + Q7=1 (attending school)
    const s1 = makeSurvey({
      answers: buildValidBaselineAnswers({
        Q7: { questionId: 'Q7', optionKeys: ['1'], optionCodes: ['1'] },
      }),
    });
    const r1 = defaultQualityService.evaluate({ survey: s1 });
    expect(r1.errors.some((e) => e.id === 'RULE_Q7_DEMOGRAPHIC_CONSISTENCY')).toBe(false);

    // 2. Contradiction: age6to14=1 yet Q7=5 ("No children aged 6 to 14") -> ERROR & blocks submission without mutation
    const s2 = makeSurvey({
      answers: buildValidBaselineAnswers({
        Q7: { questionId: 'Q7', optionKeys: ['5'], optionCodes: ['5'] },
      }),
    });
    const r2 = defaultQualityService.evaluate({ survey: s2 });
    const q7Err = r2.errors.find((e) => e.id === 'RULE_Q7_DEMOGRAPHIC_CONSISTENCY');
    expect(q7Err).toBeDefined();
    expect(q7Err?.relevantQuestionIds).toEqual(['Q7']);
    expect(q7Err?.blocksSubmission).toBe(true);
    expect(r2.canSubmit).toBe(false);
    expect(s2.answers.Q7.optionKeys).toEqual(['5']);

    // 3. Contradiction: age6to14=0 yet Q7=1 (attending school) -> ERROR
    const s3 = makeSurvey();
    s3.profile.age6to14 = 0;
    s3.profile.age18to59 = 3;
    s3.answers = buildValidBaselineAnswers({
      Q7: { questionId: 'Q7', optionKeys: ['1'], optionCodes: ['1'] },
    });
    expect(defaultQualityService.evaluate({ survey: s3 }).errors.some((e) => e.id === 'RULE_Q7_DEMOGRAPHIC_CONSISTENCY')).toBe(true);

    // 4. Contradiction: femaleCount=0 yet Q16=2 (unhygienic menstrual cloths) -> ERROR
    const s4 = makeSurvey();
    s4.profile.femaleCount = 0;
    s4.profile.maleCount = 4;
    s4.answers = buildValidBaselineAnswers({
      Q16: { questionId: 'Q16', optionKeys: ['2'], optionCodes: ['2'] },
    });
    expect(defaultQualityService.evaluate({ survey: s4 }).errors.some((e) => e.id === 'RULE_Q16_MENSTRUAL_PRIVACY_CONSISTENCY')).toBe(true);

    // 5. Contradiction warning: Q12a=5 (no serious illness) yet Q12b=2 (government hospital) -> WARNING
    const s5 = makeSurvey({
      answers: buildValidBaselineAnswers({
        Q12a: { questionId: 'Q12a', optionKeys: ['5'], optionCodes: ['5'] },
        Q12b: { questionId: 'Q12b', optionKeys: ['2'], optionCodes: ['2'] },
      }),
    });
    expect(defaultQualityService.evaluate({ survey: s5 }).warnings.some((w) => w.id === 'RULE_Q12A_Q12B_ILLNESS_CONSISTENCY')).toBe(true);
  });

  it('6: warns when Q8=4 (no under-6) while B4 under-6 count > 0 without false-positiving valid combinations', () => {
    const s = makeSurvey({
      answers: buildValidBaselineAnswers({
        Q8: { questionId: 'Q8', optionKeys: ['4'], optionCodes: ['4'] },
      }),
    });
    const r = defaultQualityService.evaluate({ survey: s });
    const w = r.warnings.find((x) => x.id === 'RULE_Q8_ANGANWADI_CONSISTENCY');
    expect(w).toBeDefined();
    expect(w?.supportsVerifiedException).toBe(true);

    const valid = makeSurvey({
      answers: buildValidBaselineAnswers({
        Q8: { questionId: 'Q8', optionKeys: ['1'], optionCodes: ['1'] },
      }),
    });
    expect(defaultQualityService.evaluate({ survey: valid }).warnings.some((x) => x.id === 'RULE_Q8_ANGANWADI_CONSISTENCY')).toBe(false);
  });

  it('7-10: checks Q5 vs Q13 shelter consistency while avoiding false positives on secondary shelters', () => {
    // 7. Conflict: Q5=1 (roadside makeshift tarpaulin tent) + Q13=1 (Pucca house) -> WARNING requiring verification
    const conflict = makeSurvey({
      answers: buildValidBaselineAnswers({
        Q5: { questionId: 'Q5', optionKeys: ['1'], optionCodes: ['1'] },
        Q13: { questionId: 'Q13', optionKeys: ['1'], optionCodes: ['1'] },
      }),
    });
    const rConflict = defaultQualityService.evaluate({ survey: conflict });
    const w = rConflict.warnings.find((x) => x.id === 'RULE_Q5_Q13_SHELTER_CONSISTENCY');
    expect(w).toBeDefined();
    expect(w?.relevantQuestionIds).toEqual(['Q5', 'Q13']);
    expect(w?.supervisorReviewRecommended).toBe(true);
    expect(rConflict.canSubmit).toBe(false);

    // 8. Valid: Q5=2 (rented) + Q13=1 (Pucca) -> NO warning
    const validRented = makeSurvey({
      answers: buildValidBaselineAnswers({
        Q5: { questionId: 'Q5', optionKeys: ['2'], optionCodes: ['2'] },
        Q13: { questionId: 'Q13', optionKeys: ['1'], optionCodes: ['1'] },
      }),
    });
    expect(defaultQualityService.evaluate({ survey: validRented }).warnings.some((x) => x.id === 'RULE_Q5_Q13_SHELTER_CONSISTENCY')).toBe(false);

    // 9. Valid: Q5=1 (roadside tarpaulin) + Q13=2 (Plastic/Tin kutcha) -> NO warning
    const validCampKutcha = makeSurvey({
      answers: buildValidBaselineAnswers({
        Q5: { questionId: 'Q5', optionKeys: ['1'], optionCodes: ['1'] },
        Q13: { questionId: 'Q13', optionKeys: ['2'], optionCodes: ['2'] },
      }),
    });
    expect(defaultQualityService.evaluate({ survey: validCampKutcha }).warnings.some((x) => x.id === 'RULE_Q5_Q13_SHELTER_CONSISTENCY')).toBe(false);
  });

  it('11-14: preserves semantic categories on Q14 (water) and Q20 (bank/debt) in indicators', () => {
    const sDeprivedDebt = makeSurvey({
      id: 's-safe-debt',
      answers: buildValidBaselineAnswers({
        Q14: { questionId: 'Q14', optionKeys: ['3'], optionCodes: ['3'] },
        Q20: { questionId: 'Q20', optionKeys: ['2'], optionCodes: ['2'] },
      }),
    });
    const sSafeNoDebt = makeSurvey({
      id: 's-safe-nodebt',
      answers: buildValidBaselineAnswers({
        Q14: { questionId: 'Q14', optionKeys: ['1'], optionCodes: ['1'] },
        Q20: { questionId: 'Q20', optionKeys: ['1'], optionCodes: ['1'] },
      }),
    });

    const nSafe = defaultAnswerNormalizer.normalizeAnswer('Q14', sSafeNoDebt.answers.Q14);
    const nUnsafe = defaultAnswerNormalizer.normalizeAnswer('Q14', sDeprivedDebt.answers.Q14);
    expect(nSafe.semantic_category).toBe('safe_water_available');
    expect(nUnsafe.semantic_category).toBe('unsafe_water_deprived');

    const nDebt = defaultAnswerNormalizer.normalizeAnswer('Q20', sDeprivedDebt.answers.Q20);
    const nNoDebt = defaultAnswerNormalizer.normalizeAnswer('Q20', sSafeNoDebt.answers.Q20);
    expect(nDebt.semantic_category).toBe('informal_debt_trap');
    expect(nNoDebt.semantic_category).toBe('active_bank_no_new_debt');

    expect(evaluateHouseholdIndices(sDeprivedDebt).tookInformalDebt).toBe(true);
    expect(evaluateHouseholdIndices(sSafeNoDebt).tookInformalDebt).toBe(false);

    const agg = aggregateStudyIndices([sDeprivedDebt, sSafeNoDebt]);
    expect(agg.q14SemanticCounts.safeWater).toBe(1);
    expect(agg.q14SemanticCounts.over30MinOrUnsafe).toBe(1);
    expect(agg.q20SemanticCounts.informalDebtTrap).toBe(1);
    expect(agg.q20SemanticCounts.activeBankNoDebt).toBe(1);
  });

  it('15-17: validates specifyText/Other blank details and normalizes all 34 questions cleanly', () => {
    const withEmptyOther = makeSurvey({
      answers: buildValidBaselineAnswers({
        Q21: { questionId: 'Q21', optionKeys: ['6'], optionCodes: ['6'], otherText: '' },
      }),
    });
    const rep = defaultQualityService.evaluate({ survey: withEmptyOther });
    const specWarn = rep.warnings.find((w) => w.id === 'RULE_OTHER_SPECIFY_TEXT');
    expect(specWarn).toBeDefined();
    expect(specWarn?.relevantQuestionIds).toContain('Q21');

    // Filling specifyText clears RULE_OTHER_SPECIFY_TEXT
    withEmptyOther.answers.Q21.otherText = 'Brick kiln helper';
    const repFixed = defaultQualityService.evaluate({ survey: withEmptyOther });
    expect(repFixed.warnings.some((w) => w.id === 'RULE_OTHER_SPECIFY_TEXT')).toBe(false);

    // Partial missing Q7 must not trigger Q7 demographic contradiction
    const partial = makeSurvey({ answers: { Q1a: { questionId: 'Q1a', optionKeys: ['1'], optionCodes: ['1'] } } });
    expect(defaultQualityService.evaluate({ survey: partial }).errors.some((e) => e.id === 'RULE_Q7_DEMOGRAPHIC_CONSISTENCY')).toBe(false);
  });

  it('18-19: enforces resolution workflow, rejects blind dismissal, reopens on stale snapshot, and honors configurable policies', () => {
    const q5Conflict = makeSurvey({
      answers: buildValidBaselineAnswers({
        Q5: { questionId: 'Q5', optionKeys: ['1'], optionCodes: ['1'] },
        Q13: { questionId: 'Q13', optionKeys: ['1'], optionCodes: ['1'] },
      }),
    });
    const rInitial = defaultQualityService.evaluate({ survey: q5Conflict });
    const q5Issue = rInitial.warnings.find((w) => w.id === 'RULE_Q5_Q13_SHELTER_CONSISTENCY')!;
    expect(q5Issue).toBeDefined();

    // Reject blind click without verification note
    const emptyVerify = defaultQualityService.validateResolutionAction({
      issue: q5Issue,
      action: 'VERIFIED',
      note: 'ok',
      actorRole: 'VOLUNTEER',
    });
    expect(emptyVerify.ok).toBe(false);

    // Valid field note escalates to SUPERVISOR_REVIEW_REQUIRED under default policy
    const validVerify = defaultQualityService.validateResolutionAction({
      issue: q5Issue,
      action: 'VERIFIED',
      note: 'Temporary roadside tent while pucca house in native village is damaged.',
      actorRole: 'VOLUNTEER',
    });
    expect(validVerify.ok).toBe(true);
    expect(validVerify.nextStatus).toBe('SUPERVISOR_REVIEW_REQUIRED');

    // Apply optimistic resolution & confirm submission unblocked; then mutate Q5 and confirm stale snapshot reopens issue!
    const { resolutionRecord, historyEntry } = buildOptimisticQualityRecords({
      survey: q5Conflict,
      issue: q5Issue,
      action: 'VERIFIED',
      nextStatus: validVerify.nextStatus!,
      sanitizedNote: validVerify.sanitizedNote,
      actorId: 'vol-1',
      actorName: 'Talha Tanweer',
      actorRole: 'VOLUNTEER',
      clientEventId: 'evt-local-1',
    });
    const updatedList = mergeQueuedQualityEvents([q5Conflict], [
      { id: 'q-evt-1', surveyId: q5Conflict.id, queuedAt: Date.now(), resolutionRecord, historyEntry },
    ]);
    const rVerified = defaultQualityService.evaluate({ survey: updatedList[0] });
    expect(rVerified.warnings.find((w) => w.id === 'RULE_Q5_Q13_SHELTER_CONSISTENCY')?.resolutionStatus).toBe('SUPERVISOR_REVIEW_REQUIRED');
    expect(rVerified.canSubmit).toBe(true);

    // Reopening test: mutate Q5 while resolution snapshot held old value
    const edited = {
      ...updatedList[0],
      answers: {
        ...updatedList[0].answers,
        Q5: { questionId: 'Q5', optionKeys: ['1'], optionCodes: ['1'], otherText: 'Changed context' },
      },
    };
    const rEdited = defaultQualityService.evaluate({ survey: edited });
    expect(rEdited.warnings.find((w) => w.id === 'RULE_Q5_Q13_SHELTER_CONSISTENCY')?.resolutionStatus).toBe('OPEN');
    expect(rEdited.canSubmit).toBe(false);

    // Reject blind click-to-dismiss on strict Q7 contradiction error
    const q7Survey = makeSurvey({
      answers: buildValidBaselineAnswers({
        Q7: { questionId: 'Q7', optionKeys: ['5'], optionCodes: ['5'] },
      }),
    });
    const q7Issue = defaultQualityService.evaluate({ survey: q7Survey }).errors.find((e) => e.id === 'RULE_Q7_DEMOGRAPHIC_CONSISTENCY')!;
    expect(
      defaultQualityService.validateResolutionAction({
        issue: q7Issue,
        action: 'VERIFIED',
        note: 'Long note trying to dismiss strict contradiction without fixing data',
        actorRole: 'VOLUNTEER',
      }).ok
    ).toBe(false);

    // Policy configuration test: requireWarningAcknowledgement=false skips warning block; minDurationSec=30 skips duration warning at 50s
    const shortSurvey = makeSurvey({ durationSec: 20 });
    expect(
      defaultQualityService.evaluate({
        survey: shortSurvey,
        policy: { ...DEFAULT_QUALITY_POLICY, minDurationSec: 30, requireWarningAcknowledgement: false },
      }).canSubmit
    ).toBe(true);
    expect(
      defaultQualityService.evaluate({
        survey: makeSurvey({ durationSec: 50 }),
        policy: { ...DEFAULT_QUALITY_POLICY, minDurationSec: 30 },
      }).warnings.some((w) => w.id === 'RULE_SHORT_DURATION')
    ).toBe(false);
  });

  it('20: supports extensible custom rules, incremental validateAffected caching, and Supervisor Portfolio Summary + Filters', () => {
    const registry = new SurveyRuleRegistry(defaultRuleRegistry.listRules());
    registry.register({
      id: 'RULE_CUSTOM_Q28_CHECK',
      version: '1.0.0',
      title: 'Custom Q28 check',
      code: 'CUSTOM_Q28',
      severity: 'info',
      category: 'informational',
      dependencies: ['Q28'],
      relevantQuestionIds: ['Q28'],
      requiresAcknowledgement: false,
      supervisorReviewRecommended: false,
      supportsVerifiedException: false,
      blocksSubmission: false,
      description: 'Tests custom rule registration without modifying engine core.',
      evaluate: (ctx) => (!ctx.normalized.Q28?.is_missing ? { detail: 'Q28 custom note recorded.' } : null),
    });

    const engine = new SurveyValidationEngine(registry);
    const service = new SurveyQualityService(engine);
    const base = makeSurvey();
    const pass1 = service.evaluateIncremental({ survey: base }, ['*'], null);
    expect(pass1.report.issues.some((i) => i.id === 'RULE_CUSTOM_Q28_CHECK')).toBe(false);

    const updated = {
      ...base,
      answers: { ...base.answers, Q28: { questionId: 'Q28', optionKeys: [], optionCodes: [], otherText: 'Flood wall needed' } },
    };
    const pass2 = service.evaluateIncremental({ survey: updated }, ['Q28'], pass1.engineResult);
    expect(pass2.report.infos.some((i) => i.id === 'RULE_CUSTOM_Q28_CHECK')).toBe(true);
    expect(pass2.report.affectedRuleIds).toContain('RULE_CUSTOM_Q28_CHECK');

    const errSurvey = makeSurvey({
      id: 'p-1',
      householdId: 'hh-p1',
      volunteerId: 'v-a',
      volunteerName: 'Volunteer Alpha',
      profile: { ...makeSurvey().profile, surveyDate: '2026-11-10', headName: 'Household Alpha' },
      answers: buildValidBaselineAnswers({
        Q7: { questionId: 'Q7', optionKeys: ['5'], optionCodes: ['5'] },
        Q14: { questionId: 'Q14', optionKeys: ['1'], optionCodes: ['1'] },
      }),
    });
    const cleanSurvey = makeSurvey({
      id: 'p-2',
      householdId: 'hh-p2',
      surveyCode: 'M2S-000778',
      volunteerId: 'v-b',
      volunteerName: 'Volunteer Beta',
      profile: { ...makeSurvey().profile, surveyCode: 'M2S-000778', surveyDate: '2026-11-12', headName: 'Household Beta' },
    });

    const fullPortfolio = defaultQualitySummary.aggregatePortfolio([errSurvey, cleanSurvey]);
    expect(fullPortfolio.totalSurveysReviewed).toBe(2);
    expect(fullPortfolio.surveysWithErrors).toBe(1);
    expect(fullPortfolio.topTriggeredRules.some((r) => r.ruleId === 'RULE_Q7_DEMOGRAPHIC_CONSISTENCY')).toBe(true);
    expect(fullPortfolio.questionInconsistencyRates.some((q) => q.questionId === 'Q7')).toBe(true);
    expect(fullPortfolio.volunteerStats).toHaveLength(2);
    expect(fullPortfolio.pendingSupervisorQueue.length).toBeGreaterThanOrEqual(1);

    const filteredByVol = defaultQualitySummary.aggregatePortfolio([errSurvey, cleanSurvey], {
      filter: { volunteerId: 'v-b', dateFrom: '2026-11-11' },
    });
    expect(filteredByVol.totalSurveysReviewed).toBe(1);
    expect(filteredByVol.surveysWithErrors).toBe(0);

    const filteredByErrorQ7 = defaultQualitySummary.aggregatePortfolio([errSurvey, cleanSurvey], {
      filter: { severity: 'error', questionId: 'Q7' },
    });
    expect(filteredByErrorQ7.totalSurveysReviewed).toBe(1);
    expect(filteredByErrorQ7.surveysWithErrors).toBe(1);
  });
});
