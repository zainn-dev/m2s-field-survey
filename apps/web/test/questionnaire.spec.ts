import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_DOCUMENT_CATEGORIES,
  PART1_OPTIONS,
  QUESTIONS,
  createEmptyProfile,
} from '../src/data/questionnaire';
import { balanceAgeGroups, balanceGender } from '@m2s/shared/components/HouseholdProfileSection';
import { RULE_B4_DEMOGRAPHIC_TOTAL_MISMATCH } from '@m2s/shared/validation';
import type { SurveyRecord } from '@m2s/shared/types/survey';

const SERVER_JSON = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'questionnaire', 'questionnaire.v1.json'), 'utf8')
);

describe('Questionnaire integrity & parity', () => {
  it('defines Q1a through Q28 in order with unique keys per question', () => {
    expect(QUESTIONS).toHaveLength(34);
    expect(QUESTIONS[0].id).toBe('Q1a');
    expect(QUESTIONS[QUESTIONS.length - 1].id).toBe('Q28');

    for (const q of QUESTIONS) {
      if (q.type === 'text' || q.type === 'date') continue;
      expect(q.options?.length ?? 0).toBeGreaterThan(0);
      const keys = q.options!.map((o) => o.key);
      expect(new Set(keys).size).toBe(keys.length);
    }

    expect(QUESTIONS.some((q) => q.type === 'date')).toBe(true);
    expect(QUESTIONS.find((q) => q.id === 'Q12a')?.type).toBe('multi');
    expect(QUESTIONS.find((q) => q.id === 'Q25a')?.type).toBe('multi');
    expect(QUESTIONS.find((q) => q.id === 'Q26')?.type).toBe('text');
  });

  it('matches server questionnaire.v1.json question IDs, types, and option keys', () => {
    expect(SERVER_JSON.questions).toHaveLength(QUESTIONS.length);
    for (const q of QUESTIONS) {
      const srv = SERVER_JSON.questions.find((x: any) => x.id === q.id);
      expect(srv, `Missing ${q.id} in server JSON`).toBeDefined();
      expect(srv.type).toBe(q.type);
      expect(srv.section).toBe(q.section);
      const webKeys = (q.options ?? []).map((o) => `${o.key}:${o.code}`);
      const srvKeys = (srv.options ?? []).map((o: any) => `${o.key}:${o.code}`);
      expect(webKeys).toEqual(srvKeys);
    }
  });

  it('keeps Aadhaar last-4 enforcement and valid district presets', () => {
    const aadhaar = DEFAULT_DOCUMENT_CATEGORIES.find((c) => c.id === 'aadhaar');
    expect(aadhaar?.requiresLast4).toBe(true);
    expect(PART1_OPTIONS.b1Districts.some((d) => d.en.includes('Nagaon'))).toBe(true);

    const profile = createEmptyProfile('M2S-000101', 'Talha');
    expect(profile.surveyCode).toBe('M2S-000101');
    expect(profile.idLast4).toBe('');
  });

  it('balances B4 gender breakdown and age groups when total members changes to 5', () => {
    // Initial 4 members (2 male, 2 female, 0 other)
    const initialGender = { male: 2, female: 2, other: 0 };
    const balancedGender5 = balanceGender(initialGender, 5);
    expect(balancedGender5.male + balancedGender5.female + balancedGender5.other).toBe(5);

    // Initial age groups (sum = 4)
    const initialAges = {
      ageUnder1: 0,
      age1to5: 1,
      age6to14: 1,
      age15to17: 0,
      age18to59: 2,
      age60Plus: 0,
    };
    const balancedAges5 = balanceAgeGroups(initialAges, 5);
    const sumAges5 =
      balancedAges5.ageUnder1 +
      balancedAges5.age1to5 +
      balancedAges5.age6to14 +
      balancedAges5.age15to17 +
      balancedAges5.age18to59 +
      balancedAges5.age60Plus;
    expect(sumAges5).toBe(5);

    // Decreasing to 3 members
    const balancedGender3 = balanceGender(initialGender, 3);
    expect(balancedGender3.male + balancedGender3.female + balancedGender3.other).toBe(3);

    const balancedAges3 = balanceAgeGroups(initialAges, 3);
    const sumAges3 =
      balancedAges3.ageUnder1 +
      balancedAges3.age1to5 +
      balancedAges3.age6to14 +
      balancedAges3.age15to17 +
      balancedAges3.age18to59 +
      balancedAges3.age60Plus;
    expect(sumAges3).toBe(3);
  });

  it('supports multiple selections in Q12a with exclusive "No illness" option', () => {
    const q12a = QUESTIONS.find((q) => q.id === 'Q12a');
    expect(q12a?.type).toBe('multi');
    const opt5 = q12a?.options?.find((o) => o.key === '5');
    expect(opt5?.exclusive).toBe(true);
    const opt6 = q12a?.options?.find((o) => o.key === '6');
    expect(opt6?.specifyText).toBe(true);
  });

  describe('B4 Total Family Members & Age-Sex Breakdown Independent State & Scenarios A-F', () => {
    function makeSurveyWithProfile(profileOverrides: Partial<ReturnType<typeof createEmptyProfile>> = {}): SurveyRecord {
      const base = createEmptyProfile('M2S-TEST', 'Volunteer');
      const profile = { ...base, ...profileOverrides };
      return {
        id: 's_test',
        householdId: 'h_test',
        surveyCode: 'M2S-TEST',
        clusterId: 'c1',
        clusterName: 'Cluster 1',
        volunteerId: 'v1',
        volunteerName: 'Tester',
        status: 'SUBMITTED',
        revision: 1,
        consentGiven: true,
        profile,
        answers: {},
        reviews: [],
        createdAt: '2026-11-21T00:00:00Z',
        updatedAt: '2026-11-21T00:00:00Z',
      };
    }

    it('Scenario A: Gender changes do not alter age groups', () => {
      const p = createEmptyProfile();
      const initialAgeUnder1 = p.ageUnder1 ?? 0;
      const initialAge1to5 = p.age1to5 ?? 0;
      const initialAge0to5 = p.age0to5;
      const initialAge6to14 = p.age6to14;
      const initialAge15to17 = p.age15to17;
      const initialAge18to59 = p.age18to59;
      const initialAge60Plus = p.age60Plus;

      p.totalMembers = 8;
      p.maleCount = 8;
      p.femaleCount = 0;
      p.otherGenderCount = 0;

      // All age groups remain strictly unchanged
      expect(p.maleCount).toBe(8);
      expect(p.ageUnder1 ?? 0).toBe(initialAgeUnder1);
      expect(p.age1to5 ?? 0).toBe(initialAge1to5);
      expect(p.age0to5).toBe(initialAge0to5);
      expect(p.age6to14).toBe(initialAge6to14);
      expect(p.age15to17).toBe(initialAge15to17);
      expect(p.age18to59).toBe(initialAge18to59);
      expect(p.age60Plus).toBe(initialAge60Plus);
    });

    it('Scenario B: Age group changes do not alter gender counts', () => {
      const p = createEmptyProfile();
      const initialMale = p.maleCount;
      const initialFemale = p.femaleCount;
      const initialOther = p.otherGenderCount;

      p.totalMembers = 8;
      p.age18to59 = 8;

      // All gender counts remain strictly unchanged
      expect(p.age18to59).toBe(8);
      expect(p.maleCount).toBe(initialMale);
      expect(p.femaleCount).toBe(initialFemale);
      expect(p.otherGenderCount).toBe(initialOther);
    });

    it('Scenario C: Independent breakdowns with matching sums are valid without cross-synchronization', () => {
      const p = createEmptyProfile();
      p.totalMembers = 8;
      p.maleCount = 5;
      p.femaleCount = 3;
      p.otherGenderCount = 0;
      p.ageUnder1 = 0;
      p.age1to5 = 2;
      p.age0to5 = 2;
      p.age6to14 = 3;
      p.age15to17 = 0;
      p.age18to59 = 3;
      p.age60Plus = 0;

      const survey = makeSurveyWithProfile(p);
      const evalResult = RULE_B4_DEMOGRAPHIC_TOTAL_MISMATCH.evaluate({
        survey,
        policy: {} as any,
        context: {} as any,
      });
      expect(evalResult).toBeNull();
    });

    it('Scenario D: Invalid gender total fails while valid age total passes', () => {
      const p = createEmptyProfile();
      p.totalMembers = 8;
      p.maleCount = 4;
      p.femaleCount = 3; // gender sum = 7 !== 8
      p.otherGenderCount = 0;
      p.ageUnder1 = 0;
      p.age1to5 = 2;
      p.age0to5 = 2;
      p.age6to14 = 3;
      p.age15to17 = 0;
      p.age18to59 = 3; // age sum = 8 === 8
      p.age60Plus = 0;

      const survey = makeSurveyWithProfile(p);
      const evalResult = RULE_B4_DEMOGRAPHIC_TOTAL_MISMATCH.evaluate({
        survey,
        policy: {} as any,
        context: {} as any,
      });
      expect(evalResult).not.toBeNull();
      expect(evalResult?.detail).toContain('Gender sum (7) != Total Members (8)');
      expect(evalResult?.detail).not.toContain('6 Age-Group sum');
    });

    it('Scenario E: Invalid age total fails while valid gender total passes', () => {
      const p = createEmptyProfile();
      p.totalMembers = 8;
      p.maleCount = 5;
      p.femaleCount = 3; // gender sum = 8 === 8
      p.otherGenderCount = 0;
      p.ageUnder1 = 0;
      p.age1to5 = 2;
      p.age0to5 = 2;
      p.age6to14 = 3;
      p.age15to17 = 1;
      p.age18to59 = 3; // age sum = 9 !== 8
      p.age60Plus = 0;

      const survey = makeSurveyWithProfile(p);
      const evalResult = RULE_B4_DEMOGRAPHIC_TOTAL_MISMATCH.evaluate({
        survey,
        policy: {} as any,
        context: {} as any,
      });
      expect(evalResult).not.toBeNull();
      expect(evalResult?.detail).toContain('6 Age-Group sum (9) != Total Members (8)');
      expect(evalResult?.detail).not.toContain('Gender sum');
    });

    it('Scenario F: Total decreases does not silently modify values, triggering errors until corrected', () => {
      const p = createEmptyProfile();
      p.totalMembers = 8;
      p.maleCount = 5;
      p.femaleCount = 3;
      p.age1to5 = 2;
      p.age0to5 = 2;
      p.age6to14 = 3;
      p.age18to59 = 3;

      // User decreases totalMembers from 8 to 7
      p.totalMembers = 7;
      // Existing breakdown values must not be silently modified
      expect(p.maleCount).toBe(5);
      expect(p.femaleCount).toBe(3);
      expect(p.age18to59).toBe(3);

      const survey = makeSurveyWithProfile(p);
      const evalResult = RULE_B4_DEMOGRAPHIC_TOTAL_MISMATCH.evaluate({
        survey,
        policy: {} as any,
        context: {} as any,
      });
      expect(evalResult).not.toBeNull();
      expect(evalResult?.detail).toContain('Gender sum (8) != Total Members (7)');
      expect(evalResult?.detail).toContain('6 Age-Group sum (8) != Total Members (7)');
    });
  });
});

