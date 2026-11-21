import type { QuestionDef, SurveyRecord } from '../types/survey';
export interface MpiIndicatorSpec {
    qId: string;
    dimension: 'Health & Nutrition' | 'Education' | 'Standard of Living';
    label: string;
    weight: number;
    weightLabel: string;
    sourceRef: string;
    isDeprived: (survey: SurveyRecord) => boolean;
}
/**
 * 12 NITI Aayog / Global Multidimensional Poverty Index (MPI) deprivation indicators
 * aligned to the Assam-Wide Socio-Economic Baseline Questionnaire (Q6–Q20).
 * Weights sum strictly to 1.000 (Health/Nutrition 1/3 + Education 1/3 + Living Standard 1/3).
 */
export declare const MPI_INDICATORS: readonly MpiIndicatorSpec[];
export interface HouseholdIndices {
    mpiScoreRatio: number;
    mpiScorePct: number;
    mpiDeprivedCount: number;
    mpiAnsweredCount: number;
    mpiDeprivedItems: {
        qId: string;
        label: string;
        weightLabel: string;
    }[];
    isMpiPoor: boolean;
    isSeverelyMpiPoor: boolean;
    mpiBandLabel: 'Severely MPI Poor (>=50%)' | 'MPI Poor (>=33.3%)' | 'Vulnerable (20–33.2%)' | 'Not MPI Poor (<20%)';
    hhsScore: number;
    hhsAnsweredCount: number;
    hhsCategory: 'Little / No Hunger' | 'Moderate Hunger' | 'Severe Hunger';
    zeroCashIncome: boolean;
    tookInformalDebt: boolean;
    dueProcessBreach: boolean;
    pre1971Settlement: boolean;
    hasTouziOrPatta: boolean;
    idLostOrBuried: boolean;
    pdsBlocked: boolean;
    genderedWashAcute: boolean;
    priority1Key: string;
    priority2Key: string;
    priority1Label: string;
    priority2Label: string;
}
export declare function evaluateHouseholdIndices(survey: SurveyRecord): HouseholdIndices;
export interface MpiIndicatorAggregate extends MpiIndicatorSpec {
    deprived: number;
    nonDeprived: number;
    zeroNa: number;
    ambiguousLegacy: number;
    answered: number;
    missing: number;
    deprivedPct: number;
}
export interface Q40PriorityAggregate {
    code: string;
    en: string;
    priority1Count: number;
    priority2Count: number;
    totalMentions: number;
    priority1Pct: number;
    totalPct: number;
}
export interface StudyIndicesAggregate {
    total: number;
    mpiEvaluatedCount: number;
    mpiPoorCount: number;
    mpiSevereCount: number;
    mpiHeadcountPct: number;
    mpiSeverePct: number;
    mpiIntensityPct: number;
    adjustedMpi: number;
    mpiIndicators: MpiIndicatorAggregate[];
    hhsEvaluatedCount: number;
    hhsLittleOrNo: number;
    hhsModerate: number;
    hhsSevere: number;
    hhsModerateOrSeverePct: number;
    meanHhsScore: number;
    q40Priorities: Q40PriorityAggregate[];
    q14SemanticCounts: {
        safeWater: number;
        over30MinOrUnsafe: number;
        other: number;
        missing: number;
    };
    q20SemanticCounts: {
        activeBankNoDebt: number;
        informalDebtTrap: number;
        noBankAccount: number;
        other: number;
        missing: number;
    };
    /** Kept for dashboard compatibility */
    q22SemanticCounts: {
        safeWater: number;
        notApplicable: number;
        unimproved: number;
        ambiguousLegacy: number;
        missing: number;
    };
    q28SemanticCounts: {
        noBankAccount: number;
        informalDebtTrap: number;
        noDebt: number;
        notApplicable: number;
        ambiguousLegacy: number;
        missing: number;
    };
}
export declare function aggregateStudyIndices(surveys: SurveyRecord[]): StudyIndicesAggregate;
/** Check whether a survey answers all structured (non-open-ended) questions cleanly. */
export declare function getStructuredQuestions(questions?: QuestionDef[]): QuestionDef[];
