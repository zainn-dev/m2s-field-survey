"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultRuleRegistry = exports.SurveyRuleRegistry = exports.RULE_B4_DEMOGRAPHIC_TOTAL_MISMATCH = exports.RULE_IDS = exports.BUILTIN_VALIDATION_RULES = void 0;
exports.isAnsweredOrNa = isAnsweredOrNa;
exports.optKey = optKey;
exports.optKeys = optKeys;
exports.normOf = normOf;
const surveyModel_1 = require("../survey/surveyModel");
function optKey(ctx, qId) {
    return ctx.normalized[qId]?.option_key ?? null;
}
function optKeys(ctx, qId) {
    return ctx.normalized[qId]?.option_keys ?? [];
}
function normOf(ctx, qId) {
    return ctx.normalized[qId];
}
function isAnsweredOrNa(ctx, qId) {
    const n = normOf(ctx, qId);
    return Boolean(n && !n.is_missing);
}
/**
 * Authoritative extensible validation rule catalog for the Assam-Wide Socio-Economic Baseline Survey
 * (Informed Consent + Part I B1–B10 + Part II Q1a–Q25b + Part III Q26–Q28).
 */
exports.BUILTIN_VALIDATION_RULES = [
    {
        id: 'RULE_CONSENT_REQUIRED',
        code: 'CONSENT_MISSING',
        version: '2.0.0',
        category: 'missing_required',
        severity: 'error',
        title: 'Informed oral consent required',
        description: 'Oral consent must be explicitly granted by the respondent on Screen 1 before submission.',
        dependencies: ['consentGiven'],
        relevantQuestionIds: [],
        sectionKey: 'consent',
        requiresAcknowledgement: false,
        supervisorReviewRecommended: false,
        supportsVerifiedException: false,
        blocksSubmission: true,
        evaluate: ({ survey }) => {
            if (survey.consentGiven)
                return null;
            return {
                detail: 'Respondent oral consent must be confirmed on the Consent screen before submitting.',
                suggestedCorrection: 'Read the Assam Baseline Survey consent statement aloud and check "Yes, Oral Consent Given".',
                answeredSummary: 'Consent Given = No',
            };
        },
    },
    {
        id: 'RULE_PROFILE_REQUIRED_FIELDS',
        code: 'PROFILE_REQUIRED_FIELDS',
        version: '2.0.0',
        category: 'missing_required',
        severity: 'error',
        title: 'Required Household Profile (B1–B10) items incomplete',
        description: 'Core Part I identification fields (B1 District, B2 ID, B3 Head, B9 Income, B10 Land) must be filled.',
        dependencies: ['profile.*', 'profile.districtCode', 'profile.docVerifiedCode', 'profile.headName', 'profile.incomeNowCode', 'profile.landOwnedCode'],
        relevantQuestionIds: [],
        sectionKey: 'profile',
        requiresAcknowledgement: false,
        supervisorReviewRecommended: false,
        supportsVerifiedException: false,
        blocksSubmission: true,
        evaluate: ({ survey }) => {
            const p = survey.profile;
            const missing = [];
            if (!p.clusterId && !p.clusterName.trim())
                missing.push('Cluster / Relief Camp assignment');
            if (!(p.districtCode || '').trim())
                missing.push('B1 Assam District');
            if (!p.docVerifiedCode.trim())
                missing.push('B2 Identity Document verified');
            if (!p.headName.trim())
                missing.push('B3 Head of Household Name');
            if (!p.headStatusCode.trim())
                missing.push('B3 Head Gender / Marital Status');
            if (!p.incomeNowCode.trim())
                missing.push('B9 Current Monthly Income');
            if (!(p.landOwnedCode || '').trim())
                missing.push('B10 Land Ownership (Yes/No)');
            if (missing.length === 0)
                return null;
            return {
                detail: `Missing Part I fields: ${missing.join(', ')}.`,
                suggestedCorrection: 'Complete all mandatory Part I (B1–B10) profile blocks.',
                answeredSummary: `Missing: ${missing.join(', ')}`,
            };
        },
    },
    {
        id: 'RULE_PROFILE_AADHAAR_LAST4',
        code: 'AADHAAR_LAST4_INVALID',
        version: '2.0.0',
        category: 'invalid_value',
        severity: 'error',
        title: 'Aadhaar last-4 digits must be 4 numeric digits',
        description: 'If Aadhaar last-4 digits are recorded, exactly 4 trailing digits must be stored (never full 12-digit numbers).',
        dependencies: ['profile.docVerifiedCode', 'profile.idLast4'],
        relevantQuestionIds: [],
        sectionKey: 'profile',
        requiresAcknowledgement: false,
        supervisorReviewRecommended: false,
        supportsVerifiedException: false,
        blocksSubmission: true,
        evaluate: ({ survey }) => {
            const p = survey.profile;
            if (!(0, surveyModel_1.hasDocVerifiedCode)(p.docVerifiedCode, '1') || !p.idLast4)
                return null;
            if (/^\d{4}$/.test(p.idLast4))
                return null;
            return {
                detail: `B2 Aadhaar last-4 value ("${p.idLast4}") must be exactly 4 numeric digits.`,
                suggestedCorrection: 'Enter only the final 4 digits of Aadhaar (e.g. 4821) or clear the field if unavailable.',
                answeredSummary: `B2=Aadhaar, idLast4="${p.idLast4}"`,
            };
        },
    },
    {
        id: 'RULE_B4_DEMOGRAPHIC_TOTAL_MISMATCH',
        code: 'B4_DEMOGRAPHIC_TOTAL_MISMATCH',
        version: '2.0.0',
        category: 'demographic_sum',
        severity: 'error',
        title: 'B4 demographic totals do not reconcile',
        description: 'Total household members (B4) must equal Gender sum (Male+Female+Other) AND 6 Age-Bracket sum.',
        dependencies: [
            'profile.totalMembers',
            'profile.maleCount',
            'profile.femaleCount',
            'profile.otherGenderCount',
            'profile.ageUnder1',
            'profile.age1to5',
            'profile.age0to5',
            'profile.age6to14',
            'profile.age15to17',
            'profile.age18to59',
            'profile.age60Plus',
        ],
        relevantQuestionIds: [],
        sectionKey: 'profile',
        requiresAcknowledgement: false,
        supervisorReviewRecommended: false,
        supportsVerifiedException: true,
        blocksSubmission: true,
        evaluate: ({ survey }) => {
            const p = survey.profile;
            const issues = [];
            if (p.totalMembers < 1) {
                issues.push('Total members must be at least 1.');
            }
            const gSum = p.maleCount + p.femaleCount + p.otherGenderCount;
            if (gSum !== p.totalMembers) {
                issues.push(`Gender sum (${gSum}) != Total Members (${p.totalMembers}).`);
            }
            const under1 = p.ageUnder1 ?? 0;
            const age1to5 = p.age1to5 ?? Math.max(0, p.age0to5 - under1);
            const aSum = under1 + age1to5 + p.age6to14 + p.age15to17 + p.age18to59 + p.age60Plus;
            if (aSum !== p.totalMembers) {
                issues.push(`6 Age-Group sum (${aSum}) != Total Members (${p.totalMembers}).`);
            }
            if (issues.length === 0)
                return null;
            return {
                detail: issues.join(' '),
                suggestedCorrection: 'Update B4 member counts so Total = Gender sum = Age-group sum.',
                answeredSummary: `B4 total=${p.totalMembers}, genderSum=${gSum}, ageSum=${aSum}`,
            };
        },
    },
    {
        id: 'RULE_B4_HEAD_ELDERLY',
        code: 'B4_HEAD_ELDERLY_CHECK',
        version: '2.0.0',
        category: 'demographic_sum',
        severity: 'warning',
        title: 'Head of household age 60+ missing from 60+ age bracket',
        description: 'If the Head of Household is aged 60+, at least 1 member should be recorded in the B4 60+ bracket.',
        dependencies: ['profile.headAge', 'profile.age60Plus'],
        relevantQuestionIds: [],
        sectionKey: 'profile',
        requiresAcknowledgement: true,
        supervisorReviewRecommended: false,
        supportsVerifiedException: true,
        blocksSubmission: false,
        evaluate: ({ survey }) => {
            const age = Number(survey.profile.headAge || 0);
            if (age >= 60 && survey.profile.age60Plus === 0) {
                return {
                    detail: `B3 Head Age is ${age}, yet B4 60+ members count is 0.`,
                    suggestedCorrection: 'Increment the B4 60+ age bracket count by 1 (or verify head age).',
                    answeredSummary: `Head Age=${age}, B4 age60Plus=0`,
                };
            }
            return null;
        },
    },
    {
        id: 'RULE_Q7_DEMOGRAPHIC_CONSISTENCY',
        code: 'Q7_DEMOGRAPHIC_CONTRADICTION',
        version: '2.0.0',
        category: 'contradiction',
        severity: 'error',
        title: 'Q7 schooling response contradicts B4 age 6–14 count',
        description: 'Q7 asks whether children aged 6–14 attend school. Response must match whether B4 age6to14 > 0 or = 0.',
        dependencies: ['Q7', 'profile.age6to14'],
        relevantQuestionIds: ['Q7'],
        sectionKey: 'B',
        requiresAcknowledgement: false,
        supervisorReviewRecommended: false,
        supportsVerifiedException: false,
        blocksSubmission: true,
        evaluate: (ctx) => {
            const q7 = optKey(ctx, 'Q7');
            if (!q7)
                return null;
            const count6to14 = ctx.survey.profile.age6to14;
            if (count6to14 === 0 && q7 !== '5') {
                return {
                    detail: `B4 reports 0 children aged 6–14, but Q7 selected option "${q7}" instead of "5. No children aged 6 to 14".`,
                    suggestedCorrection: 'Select Q7 option 5 ("No children aged 6 to 14") OR update B4 age 6–14 count.',
                    answeredSummary: `B4 age6to14=0, Q7=${q7}`,
                };
            }
            if (count6to14 > 0 && q7 === '5') {
                return {
                    detail: `B4 reports ${count6to14} child(ren) aged 6–14, yet Q7 says "5. No children aged 6 to 14".`,
                    suggestedCorrection: 'Select the actual school attendance/dropout status (1–4) in Q7.',
                    answeredSummary: `B4 age6to14=${count6to14}, Q7=5`,
                };
            }
            return null;
        },
    },
    {
        id: 'RULE_Q8_ANGANWADI_CONSISTENCY',
        code: 'Q8_ANGANWADI_AGE_MISMATCH',
        version: '2.0.0',
        category: 'contradiction',
        severity: 'warning',
        title: 'Q8 Anganwadi response differs from B4 under-6 child count',
        description: 'Checks alignment between Q8 Anganwadi access and children under age 6 in B4.',
        dependencies: ['Q8', 'profile.age0to5', 'profile.ageUnder1', 'profile.age1to5'],
        relevantQuestionIds: ['Q8'],
        sectionKey: 'B',
        requiresAcknowledgement: true,
        supervisorReviewRecommended: false,
        supportsVerifiedException: true,
        blocksSubmission: false,
        evaluate: (ctx) => {
            const q8 = optKey(ctx, 'Q8');
            if (!q8)
                return null;
            const p = ctx.survey.profile;
            const under6 = (p.ageUnder1 ?? 0) + (p.age1to5 ?? p.age0to5);
            if (under6 === 0 && ['1', '2', '3'].includes(q8)) {
                return {
                    detail: `B4 reports 0 children under age 6, yet Q8 selected option "${q8}".`,
                    suggestedCorrection: 'Confirm B4 Under-1 / 1–5 counts or select Q8 option 4 ("No child under 6 years").',
                    answeredSummary: `Under-6=${under6}, Q8=${q8}`,
                };
            }
            if (under6 > 0 && q8 === '4') {
                return {
                    detail: `B4 reports ${under6} child(ren) under 6, yet Q8 says "4. No child under 6".`,
                    suggestedCorrection: 'Select whether under-6 children are receiving or stopped Anganwadi services.',
                    answeredSummary: `Under-6=${under6}, Q8=4`,
                };
            }
            return null;
        },
    },
    {
        id: 'RULE_Q16_MENSTRUAL_PRIVACY_CONSISTENCY',
        code: 'Q16_GENDER_CONTRADICTION',
        version: '2.0.0',
        category: 'contradiction',
        severity: 'error',
        title: 'Q16 women hygiene answer when B4 female count is 0',
        description: 'If B4 reports 0 female members, Q16 must be option 4 ("No menstruating women/girls").',
        dependencies: ['Q16', 'profile.femaleCount'],
        relevantQuestionIds: ['Q16'],
        sectionKey: 'D',
        requiresAcknowledgement: false,
        supervisorReviewRecommended: false,
        supportsVerifiedException: false,
        blocksSubmission: true,
        evaluate: (ctx) => {
            const q16 = optKey(ctx, 'Q16');
            if (!q16)
                return null;
            if (ctx.survey.profile.femaleCount === 0 && ['1', '2', '3'].includes(q16)) {
                return {
                    detail: `B4 reports 0 female members, yet Q16 selected "${q16}".`,
                    suggestedCorrection: 'Select Q16 option 4 ("No menstruating women/girls") or update B4 Female count.',
                    answeredSummary: `B4 femaleCount=0, Q16=${q16}`,
                };
            }
            return null;
        },
    },
    {
        id: 'RULE_Q5_Q13_SHELTER_CONSISTENCY',
        code: 'Q5_Q13_SHELTER_MISMATCH',
        version: '2.0.0',
        category: 'contradiction',
        severity: 'warning',
        title: 'Tarpaulin camp in Q5 paired with Pucca housing in Q13',
        description: 'Flags contradictory living arrangements between Q5 current stay and Q13 roof/wall structure.',
        dependencies: ['Q5', 'Q13'],
        relevantQuestionIds: ['Q5', 'Q13'],
        sectionKey: 'D',
        requiresAcknowledgement: true,
        supervisorReviewRecommended: true,
        supportsVerifiedException: true,
        blocksSubmission: false,
        evaluate: (ctx) => {
            if (optKey(ctx, 'Q5') === '1' && optKey(ctx, 'Q13') === '1') {
                return {
                    detail: 'Q5 states household lives in roadside/makeshift tarpaulin camp, while Q13 selects "Pucca / Semi-Pucca House".',
                    suggestedCorrection: 'Verify Q13 housing structure matches the camp reality.',
                    answeredSummary: 'Q5=1, Q13=1',
                };
            }
            return null;
        },
    },
    {
        id: 'RULE_Q12A_Q12B_ILLNESS_CONSISTENCY',
        code: 'Q12_ILLNESS_TREATMENT_MISMATCH',
        version: '2.0.0',
        category: 'contradiction',
        severity: 'warning',
        title: 'Illness reported (Q12a) vs Healthcare source (Q12b) mismatch',
        description: 'If Q12a reports "No illness", Q12b should be "Not Applicable"; conversely an illness should specify care.',
        dependencies: ['Q12a', 'Q12b'],
        relevantQuestionIds: ['Q12a', 'Q12b'],
        sectionKey: 'C',
        requiresAcknowledgement: true,
        supervisorReviewRecommended: false,
        supportsVerifiedException: true,
        blocksSubmission: false,
        evaluate: (ctx) => {
            const q12aKeys = optKeys(ctx, 'Q12a');
            const q12b = optKey(ctx, 'Q12b');
            if (q12aKeys.length === 0 || !q12b)
                return null;
            const hasNoIllness = q12aKeys.includes('5');
            const hasIllness = q12aKeys.some((k) => k !== '5');
            if (hasNoIllness && !hasIllness && q12b !== '5') {
                return {
                    detail: `Q12a reports "No illness since eviction", but Q12b recorded care "${q12b}".`,
                    suggestedCorrection: 'Confirm Q12b as 5 (Not Applicable) or select the illness in Q12a.',
                    answeredSummary: `Q12a=5, Q12b=${q12b}`,
                };
            }
            if (hasIllness && q12b === '5') {
                return {
                    detail: `Q12a reports post-eviction illness ("${q12aKeys.join(', ')}"), but Q12b says "5. Not Applicable (No illness)".`,
                    suggestedCorrection: 'Select where treatment was sought (or "4. Could not afford care") in Q12b.',
                    answeredSummary: `Q12a=${q12aKeys.join(',')}, Q12b=5`,
                };
            }
            return null;
        },
    },
    {
        id: 'RULE_OTHER_SPECIFY_TEXT',
        code: 'OTHER_SPECIFY_BLANK',
        version: '2.0.0',
        category: 'missing_required',
        severity: 'warning',
        title: 'Selected "Other / Specify Details" has blank explanation',
        description: 'When an Other or Specify option is tapped in Part I or Part II, type the exact explanation in the box below.',
        dependencies: ['profile.*', 'answers.*'],
        relevantQuestionIds: [],
        sectionKey: 'review',
        requiresAcknowledgement: true,
        supervisorReviewRecommended: false,
        supportsVerifiedException: true,
        blocksSubmission: false,
        evaluate: ({ survey, questions }) => {
            const blanks = [];
            const blankQuestionIds = [];
            const p = survey.profile;
            if (p.districtCode === '16' && !(p.districtOther || '').trim())
                blanks.push('B1 Other District');
            if ((0, surveyModel_1.hasDocVerifiedCode)(p.docVerifiedCode, '7') && !(p.docVerifiedOther || '').trim())
                blanks.push('B2 Other ID');
            if (p.headStatusCode === '5' && !(p.headStatusOther || '').trim())
                blanks.push('B3 Other Head Status');
            if (p.religionCode === '5' && !(p.religionOther || '').trim())
                blanks.push('B6 Other Religion');
            if (p.primaryLanguageCode === '5' && !(p.primaryLanguageOther || '').trim())
                blanks.push('B8 Other Language');
            if (p.landOwnedCode === '1' && p.landDocTypeCode === '5' && !(p.landDocOther || '').trim())
                blanks.push('B10c Other Land Doc');
            for (const q of questions) {
                if (!q.options?.length)
                    continue;
                const ans = survey.answers?.[q.id];
                if (!ans)
                    continue;
                const needsText = ans.optionKeys.some((k) => q.options?.find((o) => o.key === k)?.specifyText);
                if (needsText && !(ans.otherText || '').trim()) {
                    blanks.push(q.id);
                    blankQuestionIds.push(q.id);
                }
            }
            if (blanks.length === 0)
                return null;
            return {
                ...(blankQuestionIds.length > 0 ? { questionId: blankQuestionIds[0], relevantQuestionIds: blankQuestionIds } : {}),
                detail: `Please fill the blank specify box for: ${blanks.join(', ')}.`,
                suggestedCorrection: 'Open each highlighted item and type details in the blank text field under "Other".',
                answeredSummary: `Blank Other fields: ${blanks.join(', ')}`,
            };
        },
    },
    {
        id: 'RULE_MISSING_REQUIRED_QUESTIONS',
        code: 'REQUIRED_QUESTIONS_MISSING',
        version: '2.0.0',
        category: 'missing_required',
        severity: 'error',
        title: 'Unanswered mandatory Part II questions',
        description: 'All structured baseline items (Q1a–Q25b) must be answered before final submission.',
        dependencies: ['answers.*'],
        relevantQuestionIds: [],
        sectionKey: 'review',
        requiresAcknowledgement: false,
        supervisorReviewRecommended: false,
        supportsVerifiedException: false,
        blocksSubmission: true,
        evaluate: (ctx) => {
            const missing = ctx.questions.filter((q) => (0, surveyModel_1.isRequired)(q) && !(0, surveyModel_1.isAnswered)(q, ctx.survey.answers?.[q.id]));
            if (missing.length === 0)
                return null;
            const preview = missing.slice(0, 8).map((m) => m.id).join(', ');
            return {
                questionId: missing[0].id,
                relevantQuestionIds: missing.map((m) => m.id),
                detail: `${missing.length} mandatory item(s) unanswered: ${preview}${missing.length > 8 ? ` (+${missing.length - 8} more)` : ''}.`,
                suggestedCorrection: `Jump to ${missing[0].id} and complete all mandatory Part II items.`,
                answeredSummary: `${ctx.questions.filter((q) => (0, surveyModel_1.isRequired)(q)).length - missing.length}/${ctx.questions.filter((q) => (0, surveyModel_1.isRequired)(q)).length} answered`,
            };
        },
    },
    {
        id: 'RULE_DUPLICATE_HOUSEHOLD_CHECK',
        code: 'DUPLICATE_HOUSEHOLD_DETECTED',
        version: '2.0.0',
        category: 'duplicate_household',
        severity: 'warning',
        title: 'Potential duplicate household entry',
        description: 'Matches Head of Household name in the same cluster/district or Aadhaar last-4 digits.',
        dependencies: ['profile.headName', 'profile.clusterId', 'profile.idLast4', 'peerSurveys'],
        relevantQuestionIds: [],
        sectionKey: 'profile',
        requiresAcknowledgement: true,
        supervisorReviewRecommended: true,
        supportsVerifiedException: true,
        blocksSubmission: false,
        evaluate: ({ survey, peerSurveys }) => {
            const curName = survey.profile.headName.trim().toLowerCase();
            const curLast4 = survey.profile.idLast4.trim();
            for (const peer of peerSurveys) {
                if (peer.id === survey.id || peer.householdId === survey.householdId)
                    continue;
                const peerName = peer.profile.headName.trim().toLowerCase();
                if (curName && peerName === curName && peer.clusterId === survey.clusterId) {
                    return {
                        detail: `Matches "${peer.profile.headName}" (${peer.surveyCode}) in cluster ${peer.clusterName}.`,
                        suggestedCorrection: 'Verify this is not a duplicate interview of the same household.',
                        answeredSummary: `Matched ${peer.surveyCode}`,
                    };
                }
                if (curLast4 && curLast4.length === 4 && peer.profile.idLast4 === curLast4) {
                    return {
                        detail: `Shares Aadhaar last-4 XXXX-${curLast4} with ${peer.surveyCode} (${peer.profile.headName}).`,
                        suggestedCorrection: 'Confirm whether this household was already surveyed.',
                        answeredSummary: `Matched XXXX-${curLast4}`,
                    };
                }
            }
            return null;
        },
    },
    {
        id: 'RULE_MISSING_DOCUMENTS',
        code: 'NO_DOCUMENTS_ATTACHED',
        version: '2.0.0',
        category: 'missing_document',
        severity: 'warning',
        title: 'No supporting documents photographed',
        description: 'No document photos attached even though identity/eviction documents were verified.',
        dependencies: ['documents', 'profile.docVerifiedCode'],
        relevantQuestionIds: [],
        sectionKey: 'documents',
        requiresAcknowledgement: true,
        supervisorReviewRecommended: false,
        supportsVerifiedException: true,
        blocksSubmission: false,
        evaluate: ({ survey, documents }) => {
            const count = documents.filter((d) => d.householdId === survey.householdId).length;
            if (count > 0 || (0, surveyModel_1.hasDocVerifiedCode)(survey.profile.docVerifiedCode, '0'))
                return null;
            return {
                detail: 'Zero document photos uploaded for this household. Attach photo if respondent gave Document Photo consent.',
                suggestedCorrection: 'Upload ID or Eviction Notice photos in Document Photos, or acknowledge verbal verification.',
                answeredSummary: 'Documents=0',
            };
        },
    },
    {
        id: 'RULE_MISSING_REQUIRED_DOC_CATEGORIES',
        code: 'REQUIRED_DOC_CATEGORIES_MISSING',
        version: '2.0.0',
        category: 'missing_document',
        severity: 'error',
        title: 'Required document category missing',
        description: 'Admin configuration requires enabled mandatory document categories when those documents exist.',
        dependencies: ['documents', 'requiredDocCategoryIds'],
        relevantQuestionIds: [],
        sectionKey: 'documents',
        requiresAcknowledgement: false,
        supervisorReviewRecommended: false,
        supportsVerifiedException: true,
        blocksSubmission: true,
        evaluate: ({ survey, documents, requiredDocCategoryIds }) => {
            if (requiredDocCategoryIds.length === 0 || (0, surveyModel_1.hasDocVerifiedCode)(survey.profile.docVerifiedCode, '0'))
                return null;
            const uploadedCats = new Set(documents.filter((d) => d.householdId === survey.householdId).map((d) => d.categoryId));
            const b2Cats = new Set((0, surveyModel_1.parseDocVerifiedCodes)(survey.profile.docVerifiedCode)
                .map((c) => surveyModel_1.B2_CODE_TO_CATEGORY_ID[c])
                .filter(Boolean));
            const missingCats = requiredDocCategoryIds.filter((c) => b2Cats.has(c) && !uploadedCats.has(c));
            if (missingCats.length === 0)
                return null;
            return {
                detail: `Required document category photo missing for: ${missingCats.join(', ')}.`,
                suggestedCorrection: 'Capture and attach photos for the missing required document category.',
                answeredSummary: `Missing: ${missingCats.join(', ')}`,
            };
        },
    },
    {
        id: 'RULE_SHORT_DURATION',
        code: 'SHORT_INTERVIEW_DURATION',
        version: '2.0.0',
        category: 'duration',
        severity: 'warning',
        title: 'Interview completed unusually fast',
        description: 'Recorded duration is under minimum threshold; verify all probes were asked patiently.',
        dependencies: ['durationSec', 'elapsedSec'],
        relevantQuestionIds: [],
        sectionKey: 'review',
        requiresAcknowledgement: true,
        supervisorReviewRecommended: true,
        supportsVerifiedException: true,
        blocksSubmission: false,
        evaluate: ({ survey, elapsedSec, policy }) => {
            const secs = survey.durationSec ?? elapsedSec;
            if (typeof secs !== 'number' || secs <= 0 || secs >= policy.minDurationSec)
                return null;
            return {
                detail: `Duration is ${Math.floor(secs / 60)}m ${secs % 60}s (recommended minimum >= ${Math.floor(policy.minDurationSec / 60)}m).`,
                suggestedCorrection: 'Verify that Part I (B1–B10) and Part II (Q1a–Q28) were fully administered.',
                answeredSummary: `Duration=${secs}s`,
            };
        },
    },
    {
        id: 'RULE_GPS_CAPTURE_INFO',
        code: 'GPS_CAPTURE_AUDIT',
        version: '2.0.0',
        category: 'informational',
        severity: 'info',
        title: 'Optional GPS coordinate audit',
        description: 'Notes whether household GPS consent was given and captured.',
        dependencies: ['gpsConsent', 'gpsLat', 'gpsLng'],
        relevantQuestionIds: [],
        sectionKey: 'consent',
        requiresAcknowledgement: false,
        supervisorReviewRecommended: false,
        supportsVerifiedException: false,
        blocksSubmission: false,
        evaluate: ({ survey }) => {
            if (survey.gpsConsent && survey.gpsLat != null && survey.gpsLng != null)
                return null;
            return {
                detail: survey.gpsConsent
                    ? 'GPS consent given, awaiting coordinate lock.'
                    : 'GPS not recorded (household declined or offline). Survey can still be submitted.',
                suggestedCorrection: 'No action needed if household declined GPS.',
                answeredSummary: `gpsConsent=${survey.gpsConsent}`,
            };
        },
    },
];
exports.RULE_IDS = exports.BUILTIN_VALIDATION_RULES.map((r) => r.id);
exports.RULE_B4_DEMOGRAPHIC_TOTAL_MISMATCH = exports.BUILTIN_VALIDATION_RULES.find((r) => r.id === 'RULE_B4_DEMOGRAPHIC_TOTAL_MISMATCH');
class SurveyRuleRegistry {
    rules = new Map();
    constructor(initialRules = exports.BUILTIN_VALIDATION_RULES) {
        for (const r of initialRules)
            this.register(r);
    }
    register(rule) {
        this.rules.set(rule.id, rule);
    }
    listRules() {
        return [...this.rules.values()];
    }
    getRuleIdsForDependencies(changedKeys) {
        if (changedKeys.length === 0)
            return this.listRules().map((r) => r.id);
        const out = new Set();
        for (const r of this.rules.values()) {
            for (const dep of r.dependencies) {
                const prefix = dep.endsWith('.*') ? dep.slice(0, -1) : null;
                if (changedKeys.some((k) => k === dep || (prefix && k.startsWith(prefix)))) {
                    out.add(r.id);
                    break;
                }
            }
        }
        return [...out];
    }
    getRuleManifest() {
        return this.listRules().map((r) => ({
            id: r.id,
            code: r.code,
            version: r.version,
            category: r.category,
            severity: r.severity,
            title: r.title,
            description: r.description,
            dependencies: r.dependencies,
            relevantQuestionIds: r.relevantQuestionIds,
            sectionKey: r.sectionKey,
            requiresAcknowledgement: r.requiresAcknowledgement,
            supervisorReviewRecommended: r.supervisorReviewRecommended,
            supportsVerifiedException: r.supportsVerifiedException,
            blocksSubmission: r.blocksSubmission,
        }));
    }
}
exports.SurveyRuleRegistry = SurveyRuleRegistry;
exports.defaultRuleRegistry = new SurveyRuleRegistry();
