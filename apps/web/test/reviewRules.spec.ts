import { describe, expect, it } from 'vitest';
import {
  answerStats,
  canReviewSurvey,
  decisionsFor,
  docStats,
  isAdminRole,
  isAnswered,
  isReviewerRole,
} from '../src/pages/admin/HouseholdDetailDrawer';
import { createEmptyProfile } from '../src/data/questionnaire';
import type { HouseholdDocument, SurveyRecord } from '../src/types/survey';

function mockSurvey(answers: SurveyRecord['answers'] = {}): SurveyRecord {
  return {
    id: 's1',
    householdId: 'h1',
    surveyCode: 'M2S-001',
    clusterId: 'kandapara',
    clusterName: 'Kandapara',
    volunteerId: 'v1',
    volunteerName: 'Talha',
    status: 'SUBMITTED',
    revision: 1,
    consentGiven: true,
    profile: createEmptyProfile(),
    answers,
    reviews: [],
    createdAt: '2026-11-10T00:00:00Z',
    updatedAt: '2026-11-10T00:00:00Z',
  };
}

describe('Review & completion rules', () => {
  it('enforces reviewer vs admin status transitions', () => {
    expect(isAdminRole('SUPER_ADMIN')).toBe(true);
    expect(isAdminRole('ADMIN')).toBe(true);
    expect(isAdminRole('SUPERVISOR')).toBe(false);
    expect(isReviewerRole('VOLUNTEER')).toBe(false);

    expect(canReviewSurvey('VOLUNTEER', 'SUBMITTED')).toBe(false);
    expect(canReviewSurvey('SUPERVISOR', 'SUBMITTED')).toBe(true);
    expect(canReviewSurvey('SUPERVISOR', 'APPROVED')).toBe(false);
    expect(canReviewSurvey('SUPERVISOR', 'DRAFT')).toBe(false);
    expect(canReviewSurvey('ADMIN', 'APPROVED')).toBe(true);
    expect(canReviewSurvey('ADMIN', 'DRAFT')).toBe(false);

    expect(decisionsFor('VOLUNTEER', 'SUBMITTED')).toEqual([]);
    expect(decisionsFor('SUPERVISOR', 'SUBMITTED')).toEqual(['APPROVE', 'RETURN', 'REJECT']);
    expect(decisionsFor('ADMIN', 'APPROVED')).toEqual(['RETURN', 'REJECT']);
    expect(decisionsFor('SUPER_ADMIN', 'REJECTED')).toEqual(['APPROVE', 'RETURN']);
  });

  it('tracks answered questions and document verification breakdown', () => {
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered({ questionId: 'Q1a', optionKeys: [], optionCodes: [] })).toBe(false);
    expect(isAnswered({ questionId: 'Q28', optionKeys: [], optionCodes: [], otherText: '  salvaged tin  ' })).toBe(true);
    expect(isAnswered({ questionId: 'Q1a', optionKeys: ['1'], optionCodes: ['1'] })).toBe(true);

    const stats = answerStats(
      mockSurvey({
        Q1a: { questionId: 'Q1a', optionKeys: ['1'], optionCodes: ['1'] },
        Q2b: { questionId: 'Q2b', optionKeys: ['2'], optionCodes: ['2'] },
      })
    );
    expect(stats.answered).toBe(2);
    expect(stats.total).toBe(34);
    expect(stats.pct).toBe(6);

    const docs: HouseholdDocument[] = [
      { id: 'd1', householdId: 'h1', surveyCode: 'M2S-001', headName: 'A', clusterName: 'K', categoryId: 'aadhaar', docType: 'Aadhaar', consentConfirmed: true, uploadStatus: 'UPLOADED', uploadProgress: 100, verificationStatus: 'VERIFIED', uploadedById: 'v1', uploadedByName: 'Talha', uploadedAt: '2026-11-10', pages: [] },
      { id: 'd2', householdId: 'h1', surveyCode: 'M2S-001', headName: 'A', clusterName: 'K', categoryId: 'voter_id', docType: 'Voter ID', consentConfirmed: true, uploadStatus: 'UPLOADED', uploadProgress: 100, verificationStatus: 'PENDING', uploadedById: 'v1', uploadedByName: 'Talha', uploadedAt: '2026-11-10', pages: [] },
      { id: 'd3', householdId: 'h1', surveyCode: 'M2S-001', headName: 'A', clusterName: 'K', categoryId: 'other', docType: 'Other', consentConfirmed: true, uploadStatus: 'UPLOADED', uploadProgress: 100, verificationStatus: 'REJECTED', uploadedById: 'v1', uploadedByName: 'Talha', uploadedAt: '2026-11-10', pages: [] },
    ];
    expect(docStats(docs)).toEqual({ total: 3, verified: 1, pending: 1, rejected: 1 });
  });
});

