import type { Language, QuestionAnswer, QuestionDef, SurveyRecord, SurveyStatus } from '../types/survey';
/** Map B2 ID-Verified codes to DocumentCategoryConfig IDs. */
export declare const B2_CODE_TO_CATEGORY_ID: Record<string, string>;
/** Backward-compatible alias for document checklists. */
export declare const B3_CODE_TO_CATEGORY_ID: Record<string, string>;
/** Parse single ('1') or multi-select comma-separated ('1,3') B2 docVerifiedCode values. */
export declare function parseDocVerifiedCodes(raw?: string): string[];
/** Check whether a target B2 code ('1', '0', etc.) is present in raw docVerifiedCode. */
export declare function hasDocVerifiedCode(raw: string | undefined, target: string): boolean;
/** Human-readable joined labels for selected B2 document codes. */
export declare function formatDocVerifiedLabels(codes: string[], lang?: Language): string;
/** Natural sort comparator for question IDs such as Q1a, Q1b, Q2a, Q10, Q25a, Q28. */
export declare function compareQuestionIds(a: string, b: string): number;
export type WizardSection = {
    key: 'consent';
    kind: 'consent';
    short: string;
    titleEn: string;
    titleHi: string;
} | {
    key: 'profile';
    kind: 'profile';
    short: string;
    titleEn: string;
    titleHi: string;
} | {
    key: 'questions';
    kind: 'questions';
    sectionId: string;
    short: string;
    range: string;
    titleEn: string;
    titleHi: string;
    questions: QuestionDef[];
} | {
    key: 'documents';
    kind: 'documents';
    short: string;
    titleEn: string;
    titleHi: string;
} | {
    key: 'review';
    kind: 'review';
    short: string;
    titleEn: string;
    titleHi: string;
};
export declare const WIZARD_SECTIONS: WizardSection[];
export declare const sectionTitle: (s: WizardSection, lang: Language) => string;
export declare const sectionIndexOfQuestion: (questionId: string) => number;
export declare const SECTION_INDEX: {
    consent: number;
    profile: number;
    firstQuestions: number;
    documents: number;
    review: number;
};
/** Open-ended reflective items (Section F: Q26–Q28) are optional; structured Part II items are required. */
export declare const isRequired: (q: QuestionDef) => boolean;
export declare function isAnswered(q: QuestionDef, a: QuestionAnswer | undefined): boolean;
export declare const countAnswered: (answers: SurveyRecord["answers"]) => number;
export declare const missingRequired: (answers: SurveyRecord["answers"], questions?: QuestionDef[]) => QuestionDef[];
/** Editable survey workflow statuses on device. */
export declare const EDITABLE_STATUSES: SurveyStatus[];
export declare const STATUS_TEXT: Record<SurveyStatus, string>;
export declare const isOtherOption: (label: string) => boolean;
export declare const isPdfPage: (p: {
    mime?: string;
    fileName?: string;
}) => boolean;
