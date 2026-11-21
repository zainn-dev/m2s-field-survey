import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { QUESTIONS } from '@m2s/shared/data/questionnaire';
import { WIZARD_SECTIONS } from '@m2s/shared/survey/surveyModel';
import { detectMagicMime } from '@m2s/shared/utils/fileCapture';
import { evaluateSurveyQuality } from '@m2s/shared/utils/surveyQuality';
import { defaultQualityService } from '@m2s/shared/validation';

function listSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

describe('M2S Volunteer Mobile App boundary & core workflows', () => {
  const mobileSrc = path.resolve(__dirname, '../src');
  const files = listSourceFiles(mobileSrc);

  it('contains zero Admin screens, routes, or admin-only store modules', () => {
    const joinedPaths = files.map((f) => path.relative(mobileSrc, f).replace(/\\/g, '/'));
    expect(joinedPaths.some((p) => /admin/i.test(p))).toBe(false);

    const appTsx = fs.readFileSync(path.join(mobileSrc, 'App.tsx'), 'utf8');
    expect(appTsx).not.toMatch(/\/admin/);
    expect(appTsx).not.toMatch(/AdminDashboard|AdminReviews|AdminVolunteers|AdminAnalytics|AdminSettings|AdminUsers/);

    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8');
      expect(code).not.toMatch(/\/api\/v1\/(admin|users|audit-logs|settings|analytics)/);
      expect(code).not.toMatch(/\b10\.0\.2\.2\b|\b192\.168\./);
    }

    const capConfig = fs.readFileSync(path.resolve(__dirname, '../capacitor.config.ts'), 'utf8');
    expect(capConfig).toContain("appId: 'org.miles2smile.fieldsurvey'");
    expect(capConfig).toContain("appName: 'M2S Field Survey'");
  });

  it('includes all 10 volunteer wizard steps and all 34 questionnaire items (Q1a–Q28)', () => {
    expect(QUESTIONS).toHaveLength(34);
    expect(WIZARD_SECTIONS.map((s) => s.kind)).toEqual([
      'consent',
      'profile',
      'questions',
      'questions',
      'questions',
      'questions',
      'questions',
      'questions',
      'documents',
      'review',
    ]);
  });

  it('validates camera/gallery/PDF uploads by file signature magic bytes', () => {
    expect(detectMagicMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectMagicMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(detectMagicMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]))).toBe('application/pdf');
    expect(detectMagicMime(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBeNull(); // Reject SVG disguised as JPG
  });

  it('exposes Q5/Q13 shelter warning and completeness scoring in survey quality checker', () => {
    const report = evaluateSurveyQuality({
      survey: {
        id: 'h1',
        householdId: 'h1',
        surveyCode: 'M2S-0001',
        clusterId: 'c1',
        clusterName: 'Kandapara',
        volunteerId: 'v1',
        volunteerName: 'Volunteer',
        status: 'DRAFT',
        revision: 1,
        consentGiven: true,
        durationSec: 400,
        profile: {
          surveyCode: 'M2S-0001',
          surveyDate: '2026-11-11',
          interviewer: 'Volunteer',
          translator: '',
          clusterId: 'c1',
          clusterName: 'Kandapara',
          clusterOther: '',
          districtCode: '1',
          docVerifiedCode: '1',
          docVerifiedLabel: 'Aadhaar',
          idLast4: '1234',
          headName: 'Test Head',
          headAge: 42,
          headStatusCode: '1',
          religionCode: '1',
          casteName: '',
          casteCategoryCode: '3',
          primaryLanguageCode: '1',
          totalMembers: 4,
          maleCount: 2,
          femaleCount: 2,
          otherGenderCount: 0,
          ageUnder1: 0,
          age1to5: 1,
          age0to5: 1,
          age6to14: 1,
          age15to17: 0,
          age18to59: 2,
          age60Plus: 0,
          vulnerableCodes: [],
          incomeBeforeCode: '4',
          incomeBeforeApprox: '10000',
          incomeNowCode: '2',
          landOwnedCode: '2',
          kitTarpaulin: true,
          kitFood: true,
        },
        answers: {
          Q5: { questionId: 'Q5', optionKeys: ['1'], optionCodes: ['1'] },
          Q13: { questionId: 'Q13', optionKeys: ['1'], optionCodes: ['1'] },
        },
        reviews: [],
        createdAt: '2026-11-11T00:00:00Z',
        updatedAt: '2026-11-11T00:00:00Z',
      },
    });
    expect(report.hasBlockingErrors).toBe(true);
    expect(report.errors.some((e) => e.code === 'REQUIRED_QUESTIONS_MISSING')).toBe(true);
    expect(report.completenessScore).toBeGreaterThan(0);
    expect(report.completenessScore).toBeLessThan(100);
    expect(report.warnings.some((w) => w.id === 'RULE_Q5_Q13_SHELTER_CONSISTENCY')).toBe(true);
  });

  it('wires offline qualityEventQueue, rule cache, QualityReviewReturnBar direct navigation, and QuestionCard highlighting', () => {
    const dbTs = fs.readFileSync(path.join(mobileSrc, 'db.ts'), 'utf8');
    expect(dbTs).toContain('qualityEventQueue');
    expect(dbTs).toContain('clearOfflineData');

    const storeTsx = fs.readFileSync(path.join(mobileSrc, 'store/mobileStore.tsx'), 'utf8');
    expect(storeTsx).toContain('quality_rules_v1');
    expect(storeTsx).toContain('qualityEventQueue');
    expect(storeTsx).toContain('mergeQueuedQualityEvents');
    expect(storeTsx).toContain('recordQualityAction');

    const wizardTsx = fs.readFileSync(path.join(mobileSrc, 'pages/VolunteerSurveyWizard.tsx'), 'utf8');
    expect(wizardTsx).toContain('QualityReviewReturnBar');
    expect(wizardTsx).toContain('evaluateIncremental');
    expect(wizardTsx).toContain('highlightIssues');
    expect(wizardTsx).toContain('isFocused');

    // Verify local incremental check catches Q8/Q9 contradiction even offline without server
    const offlineReport = defaultQualityService.evaluateIncremental(
      {
        survey: {
          id: 'off-1',
          householdId: 'hh-off-1',
          surveyCode: 'M2S-OFFLINE',
          clusterId: 'c1',
          clusterName: 'Kandapara',
          volunteerId: 'v1',
          volunteerName: 'Volunteer',
          status: 'DRAFT',
          revision: 0,
          consentGiven: true,
          profile: {
            surveyCode: 'M2S-OFFLINE',
            surveyDate: '2026-11-11',
            interviewer: 'Volunteer',
            translator: '',
            clusterId: 'c1',
            clusterName: 'Kandapara',
            clusterOther: '',
            docVerifiedCode: '2',
            docVerifiedLabel: 'Voter ID',
            idLast4: '',
            headName: 'Offline Household',
            headAge: 35,
            headStatusCode: '1',
            religionCode: '1',
            casteName: '',
            casteCategoryCode: '3',
            primaryLanguageCode: '1',
            totalMembers: 4,
            maleCount: 2,
            femaleCount: 2,
            otherGenderCount: 0,
            age0to5: 1,
            age6to14: 1,
            age15to17: 0,
            age18to59: 2,
            age60Plus: 0,
            vulnerableCodes: [],
            incomeBeforeCode: '3',
            incomeBeforeApprox: '8000',
            incomeNowCode: '2',
            kitTarpaulin: false,
            kitFood: false,
          },
          answers: {
            Q7: { questionId: 'Q7', optionKeys: ['5'], optionCodes: ['5'] },
          },
          reviews: [],
          createdAt: '2026-11-11T00:00:00Z',
          updatedAt: '2026-11-11T00:00:00Z',
        },
      },
      ['Q7'],
      null
    ).report;
    expect(offlineReport.canSubmit).toBe(false);
    expect(offlineReport.errors.some((e) => e.id === 'RULE_Q7_DEMOGRAPHIC_CONSISTENCY')).toBe(true);
  });

  it('renders transparent volunteer PNG logo without a black background box and enables auto GPS telemetry', () => {
    const logoSrc = fs.readFileSync(path.resolve(process.cwd(), '..', '..', 'packages', 'shared', 'src', 'components', 'Miles2SmileLogo.tsx'), 'utf8');
    expect(logoSrc).toContain('survey-logo.png');
    expect(logoSrc).not.toContain('bg-[#191712]');

    const storeSrc = fs.readFileSync(path.resolve(process.cwd(), 'src', 'store', 'mobileStore.tsx'), 'utf8');
    expect(storeSrc).toContain('/auth/location');
    expect(storeSrc).toContain('initialSurveyGpsFields');
    expect(storeSrc).toContain('dispatchSessionLocationPing');

    const wizardSrc = fs.readFileSync(path.resolve(process.cwd(), 'src', 'pages', 'VolunteerSurveyWizard.tsx'), 'utf8');
    expect(wizardSrc).toContain('captureSessionLocation');
    expect(wizardSrc).toContain('mergeSurveyGpsReading');
  });
});
