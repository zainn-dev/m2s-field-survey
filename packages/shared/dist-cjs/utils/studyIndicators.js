"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MPI_INDICATORS = void 0;
exports.evaluateHouseholdIndices = evaluateHouseholdIndices;
exports.aggregateStudyIndices = aggregateStudyIndices;
exports.getStructuredQuestions = getStructuredQuestions;
const questionnaire_1 = require("../data/questionnaire");
const normalizer_1 = require("../validation/normalizer");
function getOptKeys(survey, qId) {
    const norm = normalizer_1.defaultAnswerNormalizer.normalizeAnswer(qId, survey.answers?.[qId]);
    if (norm.option_keys.length > 0)
        return norm.option_keys;
    return survey.answers?.[qId]?.optionKeys ?? [];
}
function isMissingOrNa(survey, qId) {
    const norm = normalizer_1.defaultAnswerNormalizer.normalizeAnswer(qId, survey.answers?.[qId]);
    return norm.is_missing || norm.is_na;
}
/**
 * 12 NITI Aayog / Global Multidimensional Poverty Index (MPI) deprivation indicators
 * aligned to the Assam-Wide Socio-Economic Baseline Questionnaire (Q6–Q20).
 * Weights sum strictly to 1.000 (Health/Nutrition 1/3 + Education 1/3 + Living Standard 1/3).
 */
exports.MPI_INDICATORS = [
    {
        qId: 'Q9',
        dimension: 'Health & Nutrition',
        label: 'Underweight / Malnutrition (Q9)',
        weight: 1 / 12,
        weightLabel: '1/12 (8.3%)',
        sourceRef: 'NITI Aayog MPI Nutrition',
        isDeprived: (s) => getOptKeys(s, 'Q9').includes('2'),
    },
    {
        qId: 'Q11',
        dimension: 'Health & Nutrition',
        label: 'Household Food Scarcity / Hunger (Q11)',
        weight: 1 / 12,
        weightLabel: '1/12 (8.3%)',
        sourceRef: 'UN FAO FIES / Severe Food Insecurity',
        isDeprived: (s) => getOptKeys(s, 'Q11').some((k) => k === '2' || k === '3' || k === '4'),
    },
    {
        qId: 'Q10',
        dimension: 'Health & Nutrition',
        label: 'Maternal ANC / Institutional Birth Gap (Q10)',
        weight: 1 / 6,
        weightLabel: '1/6 (16.7%)',
        sourceRef: 'NFHS-5 / NITI Aayog Maternal Health',
        isDeprived: (s) => getOptKeys(s, 'Q10').some((k) => k === '2' || k === '3' || k === '4'),
    },
    {
        qId: 'Q6',
        dimension: 'Education',
        label: 'No Literate Adult / Functional Schooling (Q6)',
        weight: 1 / 6,
        weightLabel: '1/6 (16.7%)',
        sourceRef: 'NITI Aayog Years of Schooling',
        isDeprived: (s) => getOptKeys(s, 'Q6').includes('1'),
    },
    {
        qId: 'Q7',
        dimension: 'Education',
        label: 'School-Age Child Out of School (Q7)',
        weight: 1 / 6,
        weightLabel: '1/6 (16.7%)',
        sourceRef: 'NITI Aayog / RTE Attendance',
        isDeprived: (s) => getOptKeys(s, 'Q7').some((k) => k === '2' || k === '3' || k === '4'),
    },
    {
        qId: 'Q17',
        dimension: 'Standard of Living',
        label: 'Solid Biomass Cooking Fuel (Q17)',
        weight: 1 / 21,
        weightLabel: '1/21 (4.8%)',
        sourceRef: 'NFHS-5 Cooking Fuel',
        isDeprived: (s) => getOptKeys(s, 'Q17').includes('2'),
    },
    {
        qId: 'Q15',
        dimension: 'Standard of Living',
        label: 'Unimproved / Shared Sanitation (Q15)',
        weight: 1 / 21,
        weightLabel: '1/21 (4.8%)',
        sourceRef: 'JMP / NITI Sanitation',
        isDeprived: (s) => getOptKeys(s, 'Q15').some((k) => k === '2' || k === '3'),
    },
    {
        qId: 'Q14',
        dimension: 'Standard of Living',
        label: 'Unsafe / >30m Drinking Water (Q14)',
        weight: 1 / 21,
        weightLabel: '1/21 (4.8%)',
        sourceRef: 'WHO/UNICEF JMP Water',
        isDeprived: (s) => getOptKeys(s, 'Q14').some((k) => k === '2' || k === '3'),
    },
    {
        qId: 'Q18',
        dimension: 'Standard of Living',
        label: 'No Electricity Access (Q18)',
        weight: 1 / 21,
        weightLabel: '1/21 (4.8%)',
        sourceRef: 'NITI Aayog Electricity',
        isDeprived: (s) => getOptKeys(s, 'Q18').includes('2'),
    },
    {
        qId: 'Q13',
        dimension: 'Standard of Living',
        label: 'Kaccha / Makeshift Tent Shelter (Q13)',
        weight: 1 / 21,
        weightLabel: '1/21 (4.8%)',
        sourceRef: 'NITI Aayog Housing',
        isDeprived: (s) => getOptKeys(s, 'Q13').includes('2'),
    },
    {
        qId: 'Q19',
        dimension: 'Standard of Living',
        label: 'Asset Deprivation (<=1 asset, Q19)',
        weight: 1 / 21,
        weightLabel: '1/21 (4.8%)',
        sourceRef: 'NITI Aayog Household Assets',
        isDeprived: (s) => {
            const keys = getOptKeys(s, 'Q19');
            if (keys.length === 0)
                return false;
            if (keys.includes('10'))
                return true;
            if (keys.includes('9'))
                return false;
            return keys.length <= 1;
        },
    },
    {
        qId: 'Q20',
        dimension: 'Standard of Living',
        label: 'No Bank Account or Post-Eviction Debt (Q20)',
        weight: 1 / 21,
        weightLabel: '1/21 (4.8%)',
        sourceRef: 'NITI Aayog Financial Inclusion',
        isDeprived: (s) => getOptKeys(s, 'Q20').some((k) => k === '2' || k === '3'),
    },
];
function evaluateHouseholdIndices(survey) {
    const deprivedItems = [];
    let mpiScoreRatio = 0;
    let mpiAnsweredCount = 0;
    for (const ind of exports.MPI_INDICATORS) {
        const norm = normalizer_1.defaultAnswerNormalizer.normalizeAnswer(ind.qId, survey.answers?.[ind.qId]);
        if (norm.is_missing)
            continue;
        mpiAnsweredCount += 1;
        if (!norm.is_na && ind.isDeprived(survey)) {
            mpiScoreRatio += ind.weight;
            deprivedItems.push({ qId: ind.qId, label: ind.label, weightLabel: ind.weightLabel });
        }
    }
    mpiScoreRatio = Math.min(1, mpiScoreRatio);
    const mpiScorePct = Math.round(mpiScoreRatio * 1000) / 10;
    const isSeverelyMpiPoor = mpiScoreRatio >= 0.5;
    const isMpiPoor = mpiScoreRatio >= 1 / 3;
    const mpiBandLabel = isSeverelyMpiPoor
        ? 'Severely MPI Poor (>=50%)'
        : isMpiPoor
            ? 'MPI Poor (>=33.3%)'
            : mpiScoreRatio >= 0.2
                ? 'Vulnerable (20–33.2%)'
                : 'Not MPI Poor (<20%)';
    // Hunger score derived on 0..6 scale from Q11 (1=Adequate -> 0, 2=Moderate -> 2, 3=Severe -> 4, 4=Extreme -> 6)
    const q11Keys = getOptKeys(survey, 'Q11');
    const hhsAnsweredCount = isMissingOrNa(survey, 'Q11') ? 0 : 1;
    const hhsScore = q11Keys.includes('4')
        ? 6
        : q11Keys.includes('3')
            ? 4
            : q11Keys.includes('2')
                ? 2
                : 0;
    const hhsCategory = hhsScore >= 4 ? 'Severe Hunger' : hhsScore >= 2 ? 'Moderate Hunger' : 'Little / No Hunger';
    const q1aKeys = getOptKeys(survey, 'Q1a');
    const q4Keys = getOptKeys(survey, 'Q4');
    const q16Keys = getOptKeys(survey, 'Q16');
    const q20Keys = getOptKeys(survey, 'Q20');
    const q22Keys = getOptKeys(survey, 'Q22');
    const q24Keys = getOptKeys(survey, 'Q24');
    const q25bKeys = getOptKeys(survey, 'Q25b');
    const zeroCashIncome = survey.profile?.incomeNowCode === '1' || q22Keys.includes('4');
    const tookInformalDebt = q20Keys.includes('2');
    const dueProcessBreach = q4Keys.some((k) => k === '1' || k === '2' || k === '3');
    const pre1971Settlement = q1aKeys.some((k) => k === '1' || k === '2');
    const hasTouziOrPatta = survey.profile?.landOwnedCode === '1' &&
        ['1', '2', '3', '4'].includes(survey.profile?.landDocTypeCode ?? '');
    const idLostOrBuried = q24Keys.some((k) => k === '2' || k === '3');
    const pdsBlocked = q25bKeys.some((k) => k === '2' || k === '3');
    const genderedWashAcute = q16Keys.some((k) => k === '2' || k === '3');
    return {
        mpiScoreRatio,
        mpiScorePct,
        mpiDeprivedCount: deprivedItems.length,
        mpiAnsweredCount,
        mpiDeprivedItems: deprivedItems,
        isMpiPoor,
        isSeverelyMpiPoor,
        mpiBandLabel,
        hhsScore,
        hhsAnsweredCount,
        hhsCategory,
        zeroCashIncome,
        tookInformalDebt,
        dueProcessBreach,
        pre1971Settlement,
        hasTouziOrPatta,
        idLostOrBuried,
        pdsBlocked,
        genderedWashAcute,
        priority1Key: '',
        priority2Key: '',
        priority1Label: '',
        priority2Label: '',
    };
}
function aggregateStudyIndices(surveys) {
    const evals = surveys.map((s) => ({ s, idx: evaluateHouseholdIndices(s) }));
    const total = surveys.length;
    const mpiEval = evals.filter((x) => x.idx.mpiAnsweredCount > 0);
    const mpiPoor = mpiEval.filter((x) => x.idx.isMpiPoor);
    const mpiSevere = mpiEval.filter((x) => x.idx.isSeverelyMpiPoor);
    const mpiHeadcountPct = mpiEval.length > 0 ? Math.round((mpiPoor.length / mpiEval.length) * 1000) / 10 : 0;
    const mpiSeverePct = mpiEval.length > 0 ? Math.round((mpiSevere.length / mpiEval.length) * 1000) / 10 : 0;
    const mpiIntensityPct = mpiPoor.length > 0
        ? Math.round((mpiPoor.reduce((sum, x) => sum + x.idx.mpiScoreRatio, 0) / mpiPoor.length) * 1000) / 10
        : 0;
    const adjustedMpi = Math.round((mpiHeadcountPct / 100) * (mpiIntensityPct / 100) * 1000) / 1000;
    const mpiIndicators = exports.MPI_INDICATORS.map((spec) => {
        let deprived = 0;
        let nonDeprived = 0;
        let zeroNa = 0;
        let ambiguousLegacy = 0;
        let missing = 0;
        for (const s of surveys) {
            const norm = normalizer_1.defaultAnswerNormalizer.normalizeAnswer(spec.qId, s.answers?.[spec.qId]);
            if (norm.is_missing) {
                missing += 1;
                continue;
            }
            if (norm.is_na) {
                zeroNa += 1;
            }
            else if (norm.is_ambiguous_legacy) {
                ambiguousLegacy += 1;
            }
            else if (spec.isDeprived(s)) {
                deprived += 1;
            }
            else {
                nonDeprived += 1;
            }
        }
        const answered = total - missing;
        return {
            ...spec,
            deprived,
            nonDeprived,
            zeroNa,
            ambiguousLegacy,
            answered,
            missing,
            deprivedPct: answered > 0 ? Math.round((deprived / answered) * 100) : 0,
        };
    });
    const hhsEval = evals.filter((x) => x.idx.hhsAnsweredCount > 0);
    const hhsLittleOrNo = hhsEval.filter((x) => x.idx.hhsCategory === 'Little / No Hunger').length;
    const hhsModerate = hhsEval.filter((x) => x.idx.hhsCategory === 'Moderate Hunger').length;
    const hhsSevere = hhsEval.filter((x) => x.idx.hhsCategory === 'Severe Hunger').length;
    const hhsModerateOrSeverePct = hhsEval.length > 0 ? Math.round(((hhsModerate + hhsSevere) / hhsEval.length) * 100) : 0;
    const meanHhsScore = hhsEval.length > 0
        ? Math.round((hhsEval.reduce((sum, x) => sum + x.idx.hhsScore, 0) / hhsEval.length) * 100) / 100
        : 0;
    const q14SemanticCounts = { safeWater: 0, over30MinOrUnsafe: 0, other: 0, missing: 0 };
    const q20SemanticCounts = { activeBankNoDebt: 0, informalDebtTrap: 0, noBankAccount: 0, other: 0, missing: 0 };
    for (const s of surveys) {
        const n14 = normalizer_1.defaultAnswerNormalizer.normalizeAnswer('Q14', s.answers?.Q14);
        if (n14.is_missing)
            q14SemanticCounts.missing += 1;
        else if (n14.option_keys.includes('1'))
            q14SemanticCounts.safeWater += 1;
        else if (n14.option_keys.some((k) => k === '2' || k === '3'))
            q14SemanticCounts.over30MinOrUnsafe += 1;
        else
            q14SemanticCounts.other += 1;
        const n20 = normalizer_1.defaultAnswerNormalizer.normalizeAnswer('Q20', s.answers?.Q20);
        if (n20.is_missing)
            q20SemanticCounts.missing += 1;
        else if (n20.option_keys.includes('1'))
            q20SemanticCounts.activeBankNoDebt += 1;
        else if (n20.option_keys.includes('2'))
            q20SemanticCounts.informalDebtTrap += 1;
        else if (n20.option_keys.includes('3'))
            q20SemanticCounts.noBankAccount += 1;
        else
            q20SemanticCounts.other += 1;
    }
    return {
        total,
        mpiEvaluatedCount: mpiEval.length,
        mpiPoorCount: mpiPoor.length,
        mpiSevereCount: mpiSevere.length,
        mpiHeadcountPct,
        mpiSeverePct,
        mpiIntensityPct,
        adjustedMpi,
        mpiIndicators,
        hhsEvaluatedCount: hhsEval.length,
        hhsLittleOrNo,
        hhsModerate,
        hhsSevere,
        hhsModerateOrSeverePct,
        meanHhsScore,
        q40Priorities: [],
        q14SemanticCounts,
        q20SemanticCounts,
        q22SemanticCounts: {
            safeWater: q14SemanticCounts.safeWater,
            notApplicable: 0,
            unimproved: q14SemanticCounts.over30MinOrUnsafe,
            ambiguousLegacy: 0,
            missing: q14SemanticCounts.missing,
        },
        q28SemanticCounts: {
            noBankAccount: q20SemanticCounts.noBankAccount,
            informalDebtTrap: q20SemanticCounts.informalDebtTrap,
            noDebt: q20SemanticCounts.activeBankNoDebt,
            notApplicable: 0,
            ambiguousLegacy: 0,
            missing: q20SemanticCounts.missing,
        },
    };
}
/** Check whether a survey answers all structured (non-open-ended) questions cleanly. */
function getStructuredQuestions(questions = questionnaire_1.QUESTIONS) {
    return questions.filter((q) => q.type !== 'text');
}
