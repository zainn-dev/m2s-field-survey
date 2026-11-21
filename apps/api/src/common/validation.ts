export interface QuestionOptionDef {
  key?: string;
  code: string;
  label?: string;
  en?: string;
}
export interface QuestionDef {
  id: string;
  type: 'single' | 'multi' | 'text' | 'date' | 'q40';
  options?: QuestionOptionDef[];
}

const exactlyTwo = (q: QuestionDef) => q.id === 'Q40' || q.type === 'q40';

/**
 * Validates a final (submitted) answer by option CODES. Q40 requires exactly two priorities.
 * Kept for code-only clients; the app itself sends option keys (see resolveAnswer).
 */
export function validateAnswer(q: QuestionDef, codes: string[]): string | null {
  if (q.type === 'text' || q.type === 'date') return null;
  const valid = new Set((q.options ?? []).map((o) => o.code));
  if (codes.some((c) => !valid.has(c))) return `${q.id}: unknown option code`;
  if (new Set(codes).size !== codes.length) return `${q.id}: duplicate codes`;
  if (q.type === 'single' && codes.length > 1) return `${q.id}: single-select allows one code`;
  if (exactlyTwo(q) && codes.length !== 2) return 'Q40: exactly two priorities required';
  return null;
}

/**
 * Resolves UI option keys to authoritative codes (the server never trusts client-sent codes).
 * Distinct options may share a code (e.g. two "0" options), which is why keys are the unit of selection.
 * With `partial` (draft autosave) Q40 may hold 0–2 picks; on submit it must be exactly two.
 */
export function resolveAnswer(
  q: QuestionDef,
  keys: string[],
  partial: boolean
): { codes: string[]; error: string | null } {
  if (q.type === 'text' || q.type === 'date') return { codes: [], error: null };
  const byKey = new Map((q.options ?? []).map((o) => [o.key ?? o.code, o.code]));
  if (keys.some((k) => !byKey.has(k))) return { codes: [], error: `${q.id}: unknown option` };
  if (new Set(keys).size !== keys.length) return { codes: [], error: `${q.id}: duplicate options` };
  if (q.type === 'single' && keys.length > 1) return { codes: [], error: `${q.id}: single-select allows one option` };
  if (exactlyTwo(q)) {
    if (keys.length > 2) return { codes: [], error: 'Q40: select at most two priorities' };
    if (!partial && keys.length !== 2) return { codes: [], error: 'Q40: exactly two priorities required' };
  }
  return { codes: keys.map((k) => byKey.get(k)!), error: null };
}

/** File-signature (magic byte) check for JPG / PNG / PDF. Returns detected MIME or null. */
export function sniffMime(b: Uint8Array): 'image/jpeg' | 'image/png' | 'application/pdf' | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  return null;
}

export const isLast4 = (s: string) => /^\d{4}$/.test(s); // full Aadhaar is never accepted

/** Verifies document requirements for survey submission when enabled in study settings. */
export function missingDocumentsError(
  categories: { id: string; label: string; enabled: boolean; requiredForSubmission?: boolean }[],
  presentCategoryIds: string[]
): string | null {
  if (presentCategoryIds.length === 0) return 'Attach at least one household document before submitting.';
  const have = new Set(presentCategoryIds);
  const missing = categories.filter((c) => c.enabled && c.requiredForSubmission && !have.has(c.id));
  if (missing.length > 0) return `Still required before submission: ${missing.map((c) => c.label).join(', ')}.`;
  return null;
}

/** Minimum password policy for accounts created in the admin console. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Password must be at least 10 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain letters and numbers.';
  return null;
}
