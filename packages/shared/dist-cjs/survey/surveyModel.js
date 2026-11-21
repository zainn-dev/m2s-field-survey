"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPdfPage = exports.isOtherOption = exports.STATUS_TEXT = exports.EDITABLE_STATUSES = exports.missingRequired = exports.countAnswered = exports.isRequired = exports.SECTION_INDEX = exports.sectionIndexOfQuestion = exports.sectionTitle = exports.WIZARD_SECTIONS = exports.B3_CODE_TO_CATEGORY_ID = exports.B2_CODE_TO_CATEGORY_ID = void 0;
exports.parseDocVerifiedCodes = parseDocVerifiedCodes;
exports.hasDocVerifiedCode = hasDocVerifiedCode;
exports.formatDocVerifiedLabels = formatDocVerifiedLabels;
exports.compareQuestionIds = compareQuestionIds;
exports.isAnswered = isAnswered;
const questionnaire_1 = require("../data/questionnaire");
/** Map B2 ID-Verified codes to DocumentCategoryConfig IDs. */
exports.B2_CODE_TO_CATEGORY_ID = {
    '1': 'aadhaar',
    '2': 'voter_id',
    '3': 'ration_card',
    '5': 'nrc_legacy',
    '7': 'other',
};
/** Backward-compatible alias for document checklists. */
exports.B3_CODE_TO_CATEGORY_ID = exports.B2_CODE_TO_CATEGORY_ID;
/** Parse single ('1') or multi-select comma-separated ('1,3') B2 docVerifiedCode values. */
function parseDocVerifiedCodes(raw) {
    if (!raw)
        return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}
/** Check whether a target B2 code ('1', '0', etc.) is present in raw docVerifiedCode. */
function hasDocVerifiedCode(raw, target) {
    return parseDocVerifiedCodes(raw).includes(target);
}
/** Human-readable joined labels for selected B2 document codes. */
function formatDocVerifiedLabels(codes, lang = 'en') {
    const byCode = new Map(questionnaire_1.PART1_OPTIONS.b2DocVerified.map((o) => [o.code, lang === 'hi' ? o.hi : o.en]));
    return codes.map((c) => byCode.get(c) ?? c).join(' + ');
}
/** Natural sort comparator for question IDs such as Q1a, Q1b, Q2a, Q10, Q25a, Q28. */
function compareQuestionIds(a, b) {
    const parse = (id) => {
        const m = /^Q(\d+)([a-z]?)$/i.exec(id.trim());
        if (!m)
            return { n: Number.MAX_SAFE_INTEGER, suffix: id };
        return { n: Number(m[1]), suffix: m[2].toLowerCase() };
    };
    const pa = parse(a);
    const pb = parse(b);
    if (pa.n !== pb.n)
        return pa.n - pb.n;
    return pa.suffix.localeCompare(pb.suffix);
}
exports.WIZARD_SECTIONS = [
    { key: 'consent', kind: 'consent', short: 'Consent', titleEn: 'Consent & Rapport', titleHi: 'सहमति और परिचय' },
    { key: 'profile', kind: 'profile', short: 'B1–B10', titleEn: 'Part I — Household Profile (B1–B10)', titleHi: 'भाग I — परिवार विवरण (B1–B10)' },
    ...questionnaire_1.SURVEY_SECTIONS.map((s) => ({
        key: 'questions',
        kind: 'questions',
        sectionId: s.id,
        short: s.range,
        range: s.range,
        titleEn: `${s.range} ${s.titleEn}`,
        titleHi: `${s.range} ${s.titleHi}`,
        questions: questionnaire_1.QUESTIONS.filter((q) => q.section === s.id),
    })),
    { key: 'documents', kind: 'documents', short: 'Docs', titleEn: 'Document Photos', titleHi: 'दस्तावेज़ फोटो' },
    { key: 'review', kind: 'review', short: 'Review', titleEn: 'Review & Submit', titleHi: 'समीक्षा और सबमिट' },
];
const sectionTitle = (s, lang) => (lang === 'hi' ? s.titleHi : s.titleEn);
exports.sectionTitle = sectionTitle;
const sectionIndexOfQuestion = (questionId) => exports.WIZARD_SECTIONS.findIndex((s) => s.kind === 'questions' && s.questions.some((q) => q.id === questionId));
exports.sectionIndexOfQuestion = sectionIndexOfQuestion;
exports.SECTION_INDEX = {
    consent: 0,
    profile: 1,
    firstQuestions: 2,
    documents: exports.WIZARD_SECTIONS.findIndex((s) => s.kind === 'documents'),
    review: exports.WIZARD_SECTIONS.findIndex((s) => s.kind === 'review'),
};
/** Open-ended reflective items (Section F: Q26–Q28) are optional; structured Part II items are required. */
const isRequired = (q) => q.type !== 'text';
exports.isRequired = isRequired;
function isAnswered(q, a) {
    if (!a)
        return false;
    if (q.type === 'text')
        return (a.otherText ?? '').trim().length > 0;
    if (q.type === 'date')
        return (a.otherText ?? '').trim().length > 0 || a.optionKeys.length > 0;
    if (q.type === 'q40')
        return a.optionKeys.length === 2;
    return a.optionKeys.length > 0;
}
const countAnswered = (answers) => questionnaire_1.QUESTIONS.filter((q) => isAnswered(q, answers[q.id])).length;
exports.countAnswered = countAnswered;
const missingRequired = (answers, questions = questionnaire_1.QUESTIONS) => questions.filter((q) => (0, exports.isRequired)(q) && !isAnswered(q, answers[q.id]));
exports.missingRequired = missingRequired;
/** Editable survey workflow statuses on device. */
exports.EDITABLE_STATUSES = ['DRAFT', 'RETURNED', 'PENDING_SYNC'];
exports.STATUS_TEXT = {
    DRAFT: 'Draft on device',
    PENDING_SYNC: 'Waiting to upload',
    SUBMITTED: 'Uploaded — waiting review',
    APPROVED: 'Verified & approved',
    RETURNED: 'Returned for changes',
    REJECTED: 'Rejected',
};
const isOtherOption = (label) => /(?:^|\s|\b)(?:other|specify)/i.test(label.trim()) ||
    /^\s*\d+[\.\)]\s*(?:other|specify)/i.test(label.trim()) ||
    /अन्य|विवरण|लिखें/.test(label.trim());
exports.isOtherOption = isOtherOption;
const isPdfPage = (p) => p.mime === 'application/pdf' || /\.pdf$/i.test(p.fileName || '');
exports.isPdfPage = isPdfPage;
