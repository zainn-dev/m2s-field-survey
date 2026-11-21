import { PART1_OPTIONS, QUESTIONS, SURVEY_SECTIONS } from '../data/questionnaire';
import type { Language, QuestionAnswer, QuestionDef, SurveyRecord, SurveyStatus } from '../types/survey';

/** Map B2 ID-Verified codes to DocumentCategoryConfig IDs. */
export const B2_CODE_TO_CATEGORY_ID: Record<string, string> = {
  '1': 'aadhaar',
  '2': 'voter_id',
  '3': 'ration_card',
  '5': 'nrc_legacy',
  '7': 'other',
};

/** Backward-compatible alias for document checklists. */
export const B3_CODE_TO_CATEGORY_ID = B2_CODE_TO_CATEGORY_ID;

/** Parse single ('1') or multi-select comma-separated ('1,3') B2 docVerifiedCode values. */
export function parseDocVerifiedCodes(raw?: string): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Check whether a target B2 code ('1', '0', etc.) is present in raw docVerifiedCode. */
export function hasDocVerifiedCode(raw: string | undefined, target: string): boolean {
  return parseDocVerifiedCodes(raw).includes(target);
}

/** Human-readable joined labels for selected B2 document codes. */
export function formatDocVerifiedLabels(codes: string[], lang: Language = 'en'): string {
  const byCode = new Map(PART1_OPTIONS.b2DocVerified.map((o) => [o.code, lang === 'hi' ? o.hi : o.en]));
  return codes.map((c) => byCode.get(c) ?? c).join(' + ');
}

/** Natural sort comparator for question IDs such as Q1a, Q1b, Q2a, Q10, Q25a, Q28. */
export function compareQuestionIds(a: string, b: string): number {
  const parse = (id: string) => {
    const m = /^Q(\d+)([a-z]?)$/i.exec(id.trim());
    if (!m) return { n: Number.MAX_SAFE_INTEGER, suffix: id };
    return { n: Number(m[1]), suffix: m[2].toLowerCase() };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa.n !== pb.n) return pa.n - pb.n;
  return pa.suffix.localeCompare(pb.suffix);
}

export type WizardSection =
  | { key: 'consent'; kind: 'consent'; short: string; titleEn: string; titleHi: string }
  | { key: 'profile'; kind: 'profile'; short: string; titleEn: string; titleHi: string }
  | {
      key: 'questions';
      kind: 'questions';
      sectionId: string;
      short: string;
      range: string;
      titleEn: string;
      titleHi: string;
      questions: QuestionDef[];
    }
  | { key: 'documents'; kind: 'documents'; short: string; titleEn: string; titleHi: string }
  | { key: 'review'; kind: 'review'; short: string; titleEn: string; titleHi: string };

export const WIZARD_SECTIONS: WizardSection[] = [
  { key: 'consent', kind: 'consent', short: 'Consent', titleEn: 'Consent & Rapport', titleHi: 'सहमति और परिचय' },
  { key: 'profile', kind: 'profile', short: 'B1–B10', titleEn: 'Part I — Household Profile (B1–B10)', titleHi: 'भाग I — परिवार विवरण (B1–B10)' },
  ...SURVEY_SECTIONS.map((s) => ({
    key: 'questions' as const,
    kind: 'questions' as const,
    sectionId: s.id,
    short: s.range,
    range: s.range,
    titleEn: `${s.range} ${s.titleEn}`,
    titleHi: `${s.range} ${s.titleHi}`,
    questions: QUESTIONS.filter((q) => q.section === s.id),
  })),
  { key: 'documents', kind: 'documents', short: 'Docs', titleEn: 'Document Photos', titleHi: 'दस्तावेज़ फोटो' },
  { key: 'review', kind: 'review', short: 'Review', titleEn: 'Review & Submit', titleHi: 'समीक्षा और सबमिट' },
];

export const sectionTitle = (s: WizardSection, lang: Language) => (lang === 'hi' ? s.titleHi : s.titleEn);

export const sectionIndexOfQuestion = (questionId: string) =>
  WIZARD_SECTIONS.findIndex((s) => s.kind === 'questions' && s.questions.some((q) => q.id === questionId));

export const SECTION_INDEX = {
  consent: 0,
  profile: 1,
  firstQuestions: 2,
  documents: WIZARD_SECTIONS.findIndex((s) => s.kind === 'documents'),
  review: WIZARD_SECTIONS.findIndex((s) => s.kind === 'review'),
};

/** Open-ended reflective items (Section F: Q26–Q28) are optional; structured Part II items are required. */
export const isRequired = (q: QuestionDef) => q.type !== 'text';

export function isAnswered(q: QuestionDef, a: QuestionAnswer | undefined): boolean {
  if (!a) return false;
  if (q.type === 'text') return (a.otherText ?? '').trim().length > 0;
  if (q.type === 'date') return (a.otherText ?? '').trim().length > 0 || a.optionKeys.length > 0;
  if (q.type === 'q40') return a.optionKeys.length === 2;
  return a.optionKeys.length > 0;
}

export const countAnswered = (answers: SurveyRecord['answers']) =>
  QUESTIONS.filter((q) => isAnswered(q, answers[q.id])).length;

export const missingRequired = (answers: SurveyRecord['answers'], questions: QuestionDef[] = QUESTIONS) =>
  questions.filter((q) => isRequired(q) && !isAnswered(q, answers[q.id]));

/** Editable survey workflow statuses on device. */
export const EDITABLE_STATUSES: SurveyStatus[] = ['DRAFT', 'RETURNED', 'PENDING_SYNC'];

export const STATUS_TEXT: Record<SurveyStatus, string> = {
  DRAFT: 'Draft on device',
  PENDING_SYNC: 'Waiting to upload',
  SUBMITTED: 'Uploaded — waiting review',
  APPROVED: 'Verified & approved',
  RETURNED: 'Returned for changes',
  REJECTED: 'Rejected',
};

export const isOtherOption = (label: string) =>
  /(?:^|\s|\b)(?:other|specify)/i.test(label.trim()) ||
  /^\s*\d+[\.\)]\s*(?:other|specify)/i.test(label.trim()) ||
  /अन्य|विवरण|लिखें/.test(label.trim());

export const isPdfPage = (p: { mime?: string; fileName?: string }) =>
  p.mime === 'application/pdf' || /\.pdf$/i.test(p.fileName || '');
