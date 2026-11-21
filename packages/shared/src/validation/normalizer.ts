import { QUESTIONS } from '../data/questionnaire';
import type {
  AnswerStateKind,
  NormalizedOptionValue,
  NormalizedSurveyAnswer,
  QuestionAnswer,
  QuestionDef,
  SurveyRecord,
} from '../types/survey';

/**
 * Semantic lookup table for Assam Socio-Economic Baseline Survey (Part II: Q1a–Q28).
 * Ensures missing/not-applicable responses are never conflated with zero-coded deprived/none values.
 */
const SEMANTIC_CATEGORY_MAP: Record<string, { category: string; isNa?: boolean; isUnknown?: boolean }> = {
  // Settlement History & Due Process (Section A)
  'Q1a:1': { category: 'pre_1966_assam_accord_citizen' },
  'Q1a:2': { category: 'assam_accord_1966_1971' },
  'Q1a:3': { category: 'settled_1972_1996' },
  'Q1a:4': { category: 'settled_1997_2014' },
  'Q1a:5': { category: 'settled_post_2014' },

  'Q4:1': { category: 'no_individual_notice' },
  'Q4:2': { category: 'notice_under_3_days' },
  'Q4:3': { category: 'notice_4_to_7_days' },
  'Q4:4': { category: 'notice_7_to_15_days' },
  'Q4:5': { category: 'notice_over_15_days' },

  'Q5:1': { category: 'open_roadside_tarpaulin_camp' },
  'Q5:2': { category: 'temporary_shed_rented_land' },
  'Q5:4': { category: 'rented_room' },

  // Education & Anganwadi (Section B)
  'Q6:1': { category: 'adult_illiterate_deprived' },
  'Q6:2': { category: 'literate_no_schooling' },
  'Q6:3': { category: 'primary_1_to_5' },
  'Q6:4': { category: 'upper_primary_6_to_8' },
  'Q6:5': { category: 'high_school_or_above' },

  'Q7:1': { category: 'attending_school_regularly' },
  'Q7:2': { category: 'dropout_supplies_lost_deprived' },
  'Q7:3': { category: 'dropout_school_demolished_far_deprived' },
  'Q7:4': { category: 'dropout_child_labour_deprived' },
  'Q7:5': { category: 'not_applicable_no_child_6_14', isNa: true },

  'Q8:1': { category: 'anganwadi_regular' },
  'Q8:2': { category: 'anganwadi_stopped_post_eviction' },
  'Q8:3': { category: 'anganwadi_never_received' },
  'Q8:4': { category: 'not_applicable_no_child_under_6', isNa: true },

  // Health, Maternal Care & Hunger (Section C)
  'Q9:1': { category: 'no_malnutrition_reported' },
  'Q9:2': { category: 'underweight_malnourished_deprived' },

  'Q10:1': { category: 'anc_and_institutional_birth' },
  'Q10:2': { category: 'anc_only_home_birth_deprived' },
  'Q10:3': { category: 'institutional_birth_low_anc_deprived' },
  'Q10:4': { category: 'no_anc_home_birth_deprived' },
  'Q10:5': { category: 'not_applicable_no_birth_5yr', isNa: true },

  'Q11:1': { category: 'food_adequate' },
  'Q11:2': { category: 'food_moderate_scarcity' },
  'Q11:3': { category: 'food_severe_hunger' },
  'Q11:4': { category: 'food_extreme_starvation' },

  'Q12a:5': { category: 'no_illness_since_eviction' },
  'Q12b:4': { category: 'no_healthcare_access_affordability' },
  'Q12b:5': { category: 'not_applicable_no_illness', isNa: true },

  // Living Standard, WASH & Financial (Section D)
  'Q13:1': { category: 'pucca_or_semipucca_housing' },
  'Q13:2': { category: 'makeshift_tent_open_sky_deprived' },

  'Q14:1': { category: 'safe_water_available' },
  'Q14:2': { category: 'safe_water_over_30min_deprived' },
  'Q14:3': { category: 'unsafe_water_deprived' },

  'Q15:1': { category: 'private_toilet_improved' },
  'Q15:2': { category: 'shared_camp_latrine_deprived' },
  'Q15:3': { category: 'open_defecation_pit_deprived' },

  'Q16:1': { category: 'women_wash_safe_private' },
  'Q16:2': { category: 'women_wash_no_privacy_deprived' },
  'Q16:3': { category: 'women_wash_acute_deficit_deprived' },
  'Q16:4': { category: 'not_applicable_no_menstruating_member', isNa: true },

  'Q17:1': { category: 'clean_cooking_fuel' },
  'Q17:2': { category: 'solid_biomass_fuel_deprived' },
  'Q17:3': { category: 'community_kitchen_charity_food' },

  'Q18:1': { category: 'electricity_available' },
  'Q18:2': { category: 'no_electricity_deprived' },

  'Q19:10': { category: 'zero_working_assets_deprived' },

  'Q20:1': { category: 'active_bank_no_new_debt' },
  'Q20:2': { category: 'informal_debt_trap' },
  'Q20:3': { category: 'no_bank_account_deprived' },

  // Livelihoods & Welfare (Section E)
  'Q22:4': { category: 'unemployed_zero_income' },
  'Q24:1': { category: 'documents_safe_rescued' },
  'Q24:2': { category: 'documents_partially_lost' },
  'Q24:3': { category: 'documents_all_destroyed' },

  'Q25a:1': { category: 'receiving_pds_ration' },
  'Q25a:7': { category: 'none_receiving_welfare' },
  'Q25b:1': { category: 'welfare_no_barrier' },
  'Q25b:2': { category: 'welfare_blocked_distance_refusal' },
  'Q25b:3': { category: 'welfare_blocked_lost_card_biometric' },
  'Q25b:4': { category: 'welfare_never_enrolled' },
};

function inferSemanticCategory(q: QuestionDef, optionKey: string, code: string, tag?: string, en?: string): {
  category: string;
  isNa: boolean;
  isUnknown: boolean;
} {
  const mapped = SEMANTIC_CATEGORY_MAP[`${q.id}:${optionKey}`];
  if (mapped) {
    return { category: mapped.category, isNa: Boolean(mapped.isNa), isUnknown: Boolean(mapped.isUnknown) };
  }
  const tagLower = (tag ?? '').toLowerCase();
  const labelLower = (en ?? '').toLowerCase();
  if (tagLower.includes('na') || labelLower.startsWith('not applicable') || labelLower.startsWith('no child') || labelLower.startsWith('no menstruating')) {
    return { category: `na_${optionKey}`, isNa: true, isUnknown: false };
  }
  if (labelLower.includes("don't know") || labelLower.includes('cannot remember')) {
    return { category: `unknown_${optionKey}`, isNa: false, isUnknown: true };
  }
  return { category: `opt_${code}_${optionKey}`, isNa: false, isUnknown: false };
}

export class SurveyAnswerNormalizer {
  private readonly questionById: Map<string, QuestionDef>;

  constructor(private readonly questions: QuestionDef[] = QUESTIONS) {
    this.questionById = new Map(questions.map((q) => [q.id, q]));
  }

  /** Returns true when a question assigns the same numeric code to two or more distinct option keys. */
  hasDuplicateNumericCodes(questionId: string, numericCode?: string): boolean {
    const q = this.questionById.get(questionId);
    if (!q?.options?.length) return false;
    if (numericCode !== undefined) {
      return q.options.filter((o) => o.code === numericCode).length > 1;
    }
    const seen = new Map<string, number>();
    for (const o of q.options) {
      seen.set(o.code, (seen.get(o.code) ?? 0) + 1);
    }
    return [...seen.values()].some((c) => c > 1);
  }

  /** Safely normalizes one QuestionAnswer into semantic option representation without mutating source data. */
  normalizeAnswer(questionId: string, raw?: QuestionAnswer | null): NormalizedSurveyAnswer {
    const q = this.questionById.get(questionId);
    const rawOtherText = (raw?.otherText ?? '').trim();
    const rawKeys = raw?.optionKeys ?? [];
    const rawCodes = raw?.optionCodes ?? [];

    if (!raw || (rawKeys.length === 0 && rawCodes.length === 0 && !rawOtherText)) {
      return {
        question_id: questionId,
        state: 'missing',
        options: [],
        option_key: null,
        option_keys: [],
        numeric_code: null,
        option_codes: [],
        display_label: 'Unanswered',
        semantic_category: 'unanswered',
        semantic_categories: [],
        other_text: '',
        is_missing: true,
        is_na: false,
        is_unknown: false,
        is_ambiguous_legacy: false,
      };
    }

    if (!q || q.type === 'text' || q.type === 'date' || !q.options?.length) {
      return {
        question_id: questionId,
        state: 'answered',
        options: [],
        option_key: null,
        option_keys: rawKeys,
        numeric_code: null,
        option_codes: rawCodes,
        display_label: rawOtherText || rawKeys.join(', ') || rawCodes.join(', ') || (q?.type === 'date' ? 'Date response' : 'Text response'),
        semantic_category: q?.type === 'date' ? 'date_response' : 'free_text',
        semantic_categories: [q?.type === 'date' ? 'date_response' : 'free_text'],
        other_text: rawOtherText,
        is_missing: !rawOtherText && rawKeys.length === 0,
        is_na: false,
        is_unknown: false,
        is_ambiguous_legacy: false,
      };
    }

    const optByKey = new Map(q.options.map((o) => [o.key, o]));
    const resolved: NormalizedOptionValue[] = [];
    let isAmbiguousLegacy = false;

    if (rawKeys.length > 0) {
      for (const k of rawKeys) {
        const direct = optByKey.get(k);
        if (direct) {
          const sem = inferSemanticCategory(q, direct.key, direct.code, direct.tag, direct.en);
          resolved.push({
            question_id: questionId,
            option_key: direct.key,
            numeric_code: direct.code,
            display_label: direct.en,
            display_label_hi: direct.hi,
            semantic_category: sem.category,
            is_na: sem.isNa,
            is_unknown: sem.isUnknown,
          });
        } else {
          const byCode = q.options.filter((o) => o.code === k);
          if (byCode.length === 1) {
            const o = byCode[0];
            const sem = inferSemanticCategory(q, o.key, o.code, o.tag, o.en);
            resolved.push({
              question_id: questionId,
              option_key: o.key,
              numeric_code: o.code,
              display_label: o.en,
              display_label_hi: o.hi,
              semantic_category: sem.category,
              is_na: sem.isNa,
              is_unknown: sem.isUnknown,
            });
          } else if (byCode.length > 1) {
            isAmbiguousLegacy = true;
            resolved.push({
              question_id: questionId,
              option_key: `legacy_ambiguous_${k}`,
              numeric_code: k,
              display_label: `Legacy code ${k} (unqualified: ${byCode.map((b) => b.key).join(' or ')})`,
              semantic_category: `ambiguous_legacy_code_${k}`,
              is_na: false,
              is_unknown: true,
            });
          }
        }
      }
    } else if (rawCodes.length > 0) {
      for (const code of rawCodes) {
        const matches = q.options.filter((o) => o.code === code);
        if (matches.length === 1) {
          const o = matches[0];
          const sem = inferSemanticCategory(q, o.key, o.code, o.tag, o.en);
          resolved.push({
            question_id: questionId,
            option_key: o.key,
            numeric_code: o.code,
            display_label: o.en,
            display_label_hi: o.hi,
            semantic_category: sem.category,
            is_na: sem.isNa,
            is_unknown: sem.isUnknown,
          });
        } else if (matches.length > 1) {
          isAmbiguousLegacy = true;
          resolved.push({
            question_id: questionId,
            option_key: `legacy_ambiguous_${code}`,
            numeric_code: code,
            display_label: `Legacy code ${code} (ambiguous between ${matches.map((m) => m.key).join(' / ')})`,
            semantic_category: `ambiguous_legacy_code_${code}`,
            is_na: false,
            is_unknown: true,
          });
        }
      }
    }

    if (resolved.length === 0) {
      if (rawOtherText) {
        return {
          question_id: questionId,
          state: 'answered',
          options: [],
          option_key: null,
          option_keys: rawKeys,
          numeric_code: null,
          option_codes: rawCodes,
          display_label: rawOtherText,
          semantic_category: 'other_text_only',
          semantic_categories: ['other_text_only'],
          other_text: rawOtherText,
          is_missing: false,
          is_na: false,
          is_unknown: false,
          is_ambiguous_legacy: false,
        };
      }
      return {
        question_id: questionId,
        state: 'unknown',
        options: [],
        option_key: rawKeys[0] ?? null,
        option_keys: rawKeys,
        numeric_code: rawCodes[0] ?? null,
        option_codes: rawCodes,
        display_label: `Unknown (${rawKeys.join(', ') || rawCodes.join(', ')})`,
        semantic_category: 'unknown_option',
        semantic_categories: ['unknown_option'],
        other_text: rawOtherText,
        is_missing: false,
        is_na: false,
        is_unknown: true,
        is_ambiguous_legacy: false,
      };
    }

    const allNa = resolved.every((o) => o.is_na);
    const allUnknown = resolved.every((o) => o.is_unknown);
    let state: AnswerStateKind = 'answered';
    if (isAmbiguousLegacy) state = 'ambiguous_legacy';
    else if (allNa) state = 'na';
    else if (allUnknown) state = 'unknown';

    return {
      question_id: questionId,
      state,
      options: resolved,
      option_key: resolved[0]?.option_key ?? null,
      option_keys: resolved.map((o) => o.option_key),
      numeric_code: resolved[0]?.numeric_code ?? null,
      option_codes: resolved.map((o) => o.numeric_code),
      display_label: resolved.map((o) => o.display_label).join('; '),
      semantic_category: resolved[0]?.semantic_category ?? 'unknown',
      semantic_categories: resolved.map((o) => o.semantic_category),
      other_text: rawOtherText,
      is_missing: false,
      is_na: allNa && !isAmbiguousLegacy,
      is_unknown: allUnknown && !isAmbiguousLegacy,
      is_ambiguous_legacy: isAmbiguousLegacy,
    };
  }

  /** Normalizes every question present on a survey and in the schema. */
  normalizeSurveyAnswers(survey: Pick<SurveyRecord, 'answers'>): Record<string, NormalizedSurveyAnswer> {
    const out: Record<string, NormalizedSurveyAnswer> = {};
    const ids = new Set<string>([...this.questions.map((q) => q.id), ...Object.keys(survey.answers ?? {})]);
    for (const id of ids) {
      out[id] = this.normalizeAnswer(id, survey.answers?.[id]);
    }
    return out;
  }
}

export const defaultAnswerNormalizer = new SurveyAnswerNormalizer(QUESTIONS);
