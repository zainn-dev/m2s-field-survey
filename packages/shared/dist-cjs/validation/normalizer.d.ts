import type { NormalizedSurveyAnswer, QuestionAnswer, QuestionDef, SurveyRecord } from '../types/survey';
export declare class SurveyAnswerNormalizer {
    private readonly questions;
    private readonly questionById;
    constructor(questions?: QuestionDef[]);
    /** Returns true when a question assigns the same numeric code to two or more distinct option keys. */
    hasDuplicateNumericCodes(questionId: string, numericCode?: string): boolean;
    /** Safely normalizes one QuestionAnswer into semantic option representation without mutating source data. */
    normalizeAnswer(questionId: string, raw?: QuestionAnswer | null): NormalizedSurveyAnswer;
    /** Normalizes every question present on a survey and in the schema. */
    normalizeSurveyAnswers(survey: Pick<SurveyRecord, 'answers'>): Record<string, NormalizedSurveyAnswer>;
}
export declare const defaultAnswerNormalizer: SurveyAnswerNormalizer;
