import { describe, expect, it } from 'vitest';
import { createEmptyProfile } from '@m2s/shared/data/questionnaire';
import type { HouseholdDocument, SurveyRecord } from '@m2s/shared/types/survey';
import { buildHouseholdCaseFilePdf } from '@m2s/shared/utils/caseFilePdf';
import { detectMagicMime } from '@m2s/shared/utils/fileCapture';
import { aggregateStudyIndices, evaluateHouseholdIndices } from '@m2s/shared/utils/studyIndicators';
import { evaluateSurveyQuality } from '@m2s/shared/utils/surveyQuality';
import { buildAnalyticsReportSheets, buildCodebookRows } from '../src/utils/exportHelpers';

function buildSurvey(overrides: Partial<SurveyRecord> = {}): SurveyRecord {
  const profile = createEmptyProfile('M2S-000555', 'Talha');
  profile.clusterId = 'kandapara';
  profile.clusterName = 'Kandapara';
  profile.headName = 'Aftab Khan';
  profile.headAge = 42;
  profile.headStatusCode = '1';
  profile.docVerifiedCode = '1';
  profile.docVerifiedLabel = 'Aadhaar Card';
  profile.idLast4 = '4821';
  profile.religionCode = '1';
  profile.casteCategoryCode = '3';
  profile.primaryLanguageCode = '2';
  profile.totalMembers = 4;
  profile.maleCount = 2;
  profile.femaleCount = 2;
  profile.otherGenderCount = 0;
  profile.districtCode = '1';
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
    id: 'srv-case-1',
    householdId: 'hh-case-1',
    surveyCode: 'M2S-000555',
    clusterId: 'kandapara',
    clusterName: 'Kandapara',
    volunteerId: 'vol-1',
    volunteerName: 'Talha Tanweer',
    status: 'SUBMITTED',
    revision: 2,
    consentGiven: true,
    gpsConsent: true,
    gpsLat: 26.218912,
    gpsLng: 92.681234,
    gpsAccuracyMeters: 8,
    gpsCapturedAt: '2026-11-11T08:00:00Z',
    gpsPermissionStatus: 'granted',
    durationSec: 600,
    profile,
    answers: {
      Q7: { questionId: 'Q7', optionKeys: ['1'], optionCodes: ['1'] },
      Q14: { questionId: 'Q14', optionKeys: ['1'], optionCodes: ['1'] },
      Q20: { questionId: 'Q20', optionKeys: ['2'], optionCodes: ['2'] },
    },
    reviews: [],
    createdAt: '2026-11-11T08:00:00Z',
    updatedAt: '2026-11-11T08:10:00Z',
    ...overrides,
  };
}

describe('Phase 2–7 Quality, Security & Case File guarantees', () => {
  it('detectMagicMime validates genuine JPG/PNG/PDF and rejects spoofed content', () => {
    expect(detectMagicMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe1]))).toBe('image/jpeg');
    expect(detectMagicMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(detectMagicMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('application/pdf');
    expect(detectMagicMime(new TextEncoder().encode('<html/>'))).toBeNull();
  });

  it('evaluateSurveyQuality flags B4 mismatch, missing Q1a–Q25b, duplicate HH, duration<120s, and Q7 contradiction', () => {
    const peer = buildSurvey({ id: 'srv-peer', householdId: 'hh-peer', surveyCode: 'M2S-000555' });
    const bad = buildSurvey({ durationSec: 45 });
    bad.profile.maleCount = 9; // B4 sum mismatch
    bad.answers.Q7 = { questionId: 'Q7', optionKeys: ['5'], optionCodes: ['5'] }; // Contradicts age6to14=1

    const report = evaluateSurveyQuality({
      survey: bad,
      documents: [],
      peerSurveys: [peer],
    });

    expect(report.hasBlockingErrors).toBe(true);
    expect(report.errors.some((e) => e.category === 'demographic_sum')).toBe(true);
    expect(report.errors.some((e) => e.id === 'RULE_Q7_DEMOGRAPHIC_CONSISTENCY')).toBe(true);
    expect(report.errors.some((e) => e.id === 'RULE_MISSING_REQUIRED_QUESTIONS')).toBe(true);
    expect(report.warnings.some((w) => w.category === 'duplicate_household')).toBe(true);
    expect(report.warnings.some((w) => w.category === 'duration')).toBe(true);
    expect(report.warnings.some((w) => w.category === 'missing_document')).toBe(true);
  });

  it('supports multi-tick B2 codes (e.g. "1,3") for Aadhaar last-4 & document checks', () => {
    const withAadhaarAndRation = buildSurvey();
    withAadhaarAndRation.profile.docVerifiedCode = '1,3';
    withAadhaarAndRation.profile.docVerifiedLabel = 'Aadhaar Card, Ration Card';
    withAadhaarAndRation.profile.idLast4 = '12';
    const r1 = evaluateSurveyQuality({ survey: withAadhaarAndRation, documents: [] });
    expect(r1.errors.some((e) => e.code === 'AADHAAR_LAST4_INVALID')).toBe(true);
    expect(r1.warnings.some((w) => w.category === 'missing_document')).toBe(true);

    const voterAndRationOnly = buildSurvey();
    voterAndRationOnly.profile.docVerifiedCode = '2,3';
    voterAndRationOnly.profile.docVerifiedLabel = 'Voter ID, Ration Card';
    voterAndRationOnly.profile.idLast4 = '12';
    const r2 = evaluateSurveyQuality({ survey: voterAndRationOnly, documents: [] });
    expect(r2.errors.some((e) => e.code === 'AADHAAR_LAST4_INVALID')).toBe(false);
  });

  it('buildHouseholdCaseFilePdf generates valid PDF, masks Aadhaar, and gates GPS by viewerRole', () => {
    const survey = buildSurvey();
    const doc: HouseholdDocument = {
      id: 'doc-1',
      householdId: survey.householdId,
      surveyCode: survey.surveyCode,
      headName: survey.profile.headName,
      clusterName: survey.clusterName,
      categoryId: 'aadhaar',
      docType: 'Aadhaar Card',
      aadhaarLast4: '4821',
      consentConfirmed: true,
      uploadStatus: 'UPLOADED',
      uploadProgress: 100,
      verificationStatus: 'VERIFIED',
      uploadedById: 'vol-1',
      uploadedByName: 'Talha Tanweer',
      uploadedAt: '2026-11-11T08:05:00Z',
      verifiedByName: 'Supervisor One',
      pages: [
        {
          id: 'p1',
          pageNo: 1,
          fileName: 'front.jpg',
          mime: 'image/jpeg',
          sizeBytes: 24500,
          localPreviewUrl: '/api/v1/documents/doc-1/pages/p1/content',
        },
      ],
    };

    const adminPdfText = new TextDecoder().decode(
      buildHouseholdCaseFilePdf({ survey, documents: [doc], viewerRole: 'ADMIN' })
    );
    expect(adminPdfText.startsWith('%PDF-1.4')).toBe(true);
    expect(adminPdfText).toContain('XXXX-XXXX-4821');
    expect(adminPdfText).toContain('26.218912');
    expect(adminPdfText).not.toMatch(/\d{12}/); // Never exposes 12-digit full Aadhaar

    const volPdfText = new TextDecoder().decode(
      buildHouseholdCaseFilePdf({ survey, documents: [doc], viewerRole: 'VOLUNTEER' })
    );
    expect(volPdfText).not.toContain('26.218912'); // GPS excluded for Volunteer role
  });

  it('buildAnalyticsReportSheets builds workbook sheets distinguishing Missing vs Explicit Zero', () => {
    const sheets = buildAnalyticsReportSheets({
      filterLabel: 'All Clusters · All Statuses',
      totalSurveys: 10,
      indicators: [
        {
          domain: 'Income',
          indicator: 'Zero monthly income now (B12 = ₹0)',
          affected: 3,
          answered: 8,
          missing: 2,
          zeroCount: 3,
          pctOfAnswered: 38,
        },
        {
          domain: 'Hunger',
          indicator: 'Never no food in household (Q14 = 0_never)',
          affected: 4,
          answered: 7,
          missing: 3,
          zeroCount: 4,
          pctOfAnswered: 57,
        },
      ],
      clusterRows: [['Cluster', 'Target', 'Completed'], ['Kandapara', 25, 12]],
      trendRows: [['Date', 'Submitted', 'Cumulative'], ['2026-11-11', 2, 10]],
    });

    expect(sheets).toHaveLength(3);
    expect(sheets[0].name).toBe('Summary & Missing vs Zero');
    const headerRow = sheets[0].rows[5] as unknown[];
    expect(headerRow).toContain('Missing / Unanswered');
    expect(headerRow).toContain('Explicit Zero Value');
    const incomeRow = sheets[0].rows[6] as unknown[];
    expect(incomeRow[4]).toBe(2); // Missing
    expect(incomeRow[5]).toBe(3); // Explicit Zero
  });

  it('computes UNDP/NITI MPI weights, hunger severity (Q11), informal debt safeguard, and due process/pre-1971 flags', () => {
    const hhPoor = buildSurvey({
      answers: {
        Q1a: { questionId: 'Q1a', optionKeys: ['1'], optionCodes: ['1'] }, // Pre-1971 settlement
        Q4: { questionId: 'Q4', optionKeys: ['1'], optionCodes: ['1'] }, // Due process breach
        Q6: { questionId: 'Q6', optionKeys: ['1'], optionCodes: ['1'] }, // 1/6
        Q7: { questionId: 'Q7', optionKeys: ['2'], optionCodes: ['2'] }, // 1/6
        Q11: { questionId: 'Q11', optionKeys: ['3'], optionCodes: ['3'] }, // 1/12 + Severe hunger (4)
        Q17: { questionId: 'Q17', optionKeys: ['2'], optionCodes: ['2'] }, // 1/21
        Q20: { questionId: 'Q20', optionKeys: ['2'], optionCodes: ['2'] }, // 1/21 + informal debt
      },
    });
    const idx = evaluateHouseholdIndices(hhPoor);
    expect(idx.isMpiPoor).toBe(true);
    expect(idx.mpiDeprivedCount).toBe(5);
    expect(idx.tookInformalDebt).toBe(true);
    expect(idx.dueProcessBreach).toBe(true);
    expect(idx.pre1971Settlement).toBe(true);
    expect(idx.hhsScore).toBe(4);
    expect(idx.hhsCategory).toBe('Severe Hunger');

    const hhClean = buildSurvey({
      id: 'srv-clean',
      householdId: 'hh-clean',
      surveyCode: 'M2S-000556',
      answers: {
        Q6: { questionId: 'Q6', optionKeys: ['3'], optionCodes: ['3'] },
        Q7: { questionId: 'Q7', optionKeys: ['1'], optionCodes: ['1'] },
        Q11: { questionId: 'Q11', optionKeys: ['1'], optionCodes: ['1'] },
        Q20: { questionId: 'Q20', optionKeys: ['1'], optionCodes: ['1'] },
      },
    });
    const agg = aggregateStudyIndices([hhPoor, hhClean]);
    expect(agg.mpiHeadcountPct).toBe(50);
    expect(agg.hhsSevere).toBe(1);
    expect(agg.hhsLittleOrNo).toBe(1);

    const pdfText = new TextDecoder().decode(
      buildHouseholdCaseFilePdf({ survey: hhPoor, documents: [], viewerRole: 'ADMIN' })
    );
    expect(pdfText).toContain('UNDP/NITI Aayog MPI');
    expect(pdfText).toContain('Severe Hunger');

    const codebook = buildCodebookRows();
    expect(codebook.length).toBe(35);
  });
});
