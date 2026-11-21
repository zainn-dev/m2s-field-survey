import { BadRequestException } from '@nestjs/common';
import { isLast4 } from './validation';

/**
 * Household profile (Part I, B1–B10) is stored as JSON, but only whitelisted, type-checked fields are kept.
 * Anything unexpected is dropped so the JSON column can never become a dumping ground for PII.
 */
const STRING_FIELDS = [
  'surveyDate', 'interviewer', 'translator', 'clusterId', 'clusterName', 'clusterOther',
  'districtCode', 'districtOther', 'revenueCircleVillage',
  'docVerifiedCode', 'docVerifiedLabel', 'docVerifiedOther', 'idLast4', 'headName', 'headStatusCode', 'headStatusOther', 'religionCode', 'religionOther',
  'casteName', 'casteCategoryCode', 'primaryLanguageCode', 'primaryLanguageOther', 'incomeBeforeCode', 'incomeBeforeApprox', 'incomeNowCode',
  'landOwnedCode', 'landBighas', 'landSizeCode', 'landDocTypeCode', 'landDocOther',
] as const;
const COUNT_FIELDS = [
  'totalMembers', 'maleCount', 'femaleCount', 'otherGenderCount',
  'ageUnder1', 'age1to5', 'age0to5', 'age6to14', 'age15to17', 'age18to59', 'age60Plus',
] as const;
const BOOL_FIELDS = ['docPhotoConsent', 'kitTarpaulin', 'kitFood'] as const;

export type Profile = Record<string, string | number | boolean | string[]>;

/**
 * `draft: true` (autosave / offline queue) drops half-typed values instead of rejecting the whole save — a 400 on
 * an autosave would block the device's sync queue. The submit path stays strict.
 */
export function sanitizeProfile(raw: unknown, opts: { draft?: boolean } = {}): Profile {
  const draft = !!opts.draft;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException({ code: 'INVALID_PROFILE', message: 'Household profile is required.' });
  }
  const p = raw as Record<string, unknown>;
  const out: Profile = {};
  for (const k of STRING_FIELDS) {
    const v = p[k];
    out[k] = typeof v === 'string' ? v.trim().slice(0, k === 'clusterOther' || k === 'casteName' ? 120 : 200) : v == null ? '' : String(v).slice(0, 200);
  }
  for (const k of COUNT_FIELDS) {
    const n = Number(p[k] ?? 0);
    if (!Number.isFinite(n) || n < 0 || n > 99) {
      if (draft) {
        out[k] = 0;
        continue;
      }
      throw new BadRequestException({ code: 'INVALID_PROFILE', message: `${k} must be between 0 and 99.` });
    }
    out[k] = Math.round(n);
  }
  for (const k of BOOL_FIELDS) out[k] = Boolean(p[k]);

  const age = p.headAge;
  if (age === '' || age == null) out.headAge = '';
  else {
    const n = Number(age);
    if (!Number.isFinite(n) || n < 10 || n > 120) {
      if (!draft) throw new BadRequestException({ code: 'INVALID_PROFILE', message: 'Head age must be between 10 and 120.' });
      out.headAge = '';
    } else out.headAge = Math.round(n);
  }
  out.vulnerableCodes = Array.isArray(p.vulnerableCodes)
    ? [...new Set(p.vulnerableCodes.filter((c): c is string => typeof c === 'string' && /^\d{1,2}$/.test(c)))]
    : [];
  if (out.idLast4 && !isLast4(String(out.idLast4))) {
    // Never keep a malformed (possibly full) ID number, even in a draft.
    if (draft) out.idLast4 = '';
    else throw new BadRequestException({ code: 'AADHAAR_LAST4_ONLY', message: 'Record only the last 4 digits of the ID (never the full number).' });
  }
  if (out.incomeBeforeApprox && !/^\d{0,7}$/.test(String(out.incomeBeforeApprox))) {
    if (draft) out.incomeBeforeApprox = '';
    else throw new BadRequestException({ code: 'INVALID_PROFILE', message: 'Approximate income must be a whole number in rupees.' });
  }
  return out;
}
