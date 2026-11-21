import { describe, it, expect } from 'vitest';
import { resolveAnswer, passwordProblem, sniffMime, missingDocumentsError } from '../src/common/validation';
import { sanitizeProfile } from '../src/common/profile';

const q40 = {
  id: 'Q40',
  type: 'multi' as const,
  options: [
    { key: 'land', code: '1', label: 'Land' },
    { key: 'house', code: '2', label: 'House' },
    { key: 'job', code: '3', label: 'Job' },
    // two options may share a code; they are addressed by key
    { key: 'other', code: '3', label: 'Other' },
  ],
};
const single = { id: 'Q7', type: 'single' as const, options: [{ key: 'y', code: '1', label: 'Yes' }, { key: 'n', code: '0', label: 'No' }] };

describe('resolveAnswer (key-based, codes derived on server)', () => {
  it('maps keys to codes, including shared codes', () => {
    expect(resolveAnswer(q40, ['job', 'other'], false)).toEqual({ codes: ['3', '3'], error: null });
  });
  it('lets drafts hold 0-2 Q40 picks but submit requires exactly two', () => {
    expect(resolveAnswer(q40, [], true).error).toBeNull();
    expect(resolveAnswer(q40, ['land'], true).error).toBeNull();
    expect(resolveAnswer(q40, ['land'], false).error).toMatch(/exactly two/);
    expect(resolveAnswer(q40, ['land', 'house', 'job'], true).error).toMatch(/at most two/);
  });
  it('rejects unknown and duplicate keys', () => {
    expect(resolveAnswer(q40, ['nope'], true).error).toMatch(/unknown/);
    expect(resolveAnswer(q40, ['land', 'land'], true).error).toMatch(/duplicate/);
  });
  it('enforces single-select', () => {
    expect(resolveAnswer(single, ['y', 'n'], true).error).toMatch(/one option/);
    expect(resolveAnswer(single, ['n'], false)).toEqual({ codes: ['0'], error: null });
  });
});

describe('passwordProblem', () => {
  it('requires 10+ chars with letters and digits', () => {
    expect(passwordProblem('short1')).toMatch(/10/);
    expect(passwordProblem('onlyletterspassword')).toMatch(/letters and numbers/);
    expect(passwordProblem('fieldwork2026')).toBeNull();
  });
});

describe('sniffMime', () => {
  it('recognises PNG and PDF and rejects SVG/HTML', () => {
    expect(sniffMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffMime(new TextEncoder().encode('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffMime(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
  });
});

describe('sanitizeProfile', () => {
  it('drops unknown fields and normalises counts', () => {
    const p = sanitizeProfile({ headName: '  Rahim  ', evil: '<script>', headAge: '45' });
    expect(p.headName).toBe('Rahim');
    expect(p).not.toHaveProperty('evil');
    expect(p.headAge).toBe(45);
  });
  it('never accepts a full Aadhaar number', () => {
    expect(() => sanitizeProfile({ idLast4: '123412341234' })).toThrow(/last 4/);
    expect(sanitizeProfile({ idLast4: '1234' }).idLast4).toBe('1234');
    // Drafts drop half-typed / unsafe values instead of blocking the sync queue.
    expect(sanitizeProfile({ idLast4: '12' }, { draft: true }).idLast4).toBe('');
    expect(sanitizeProfile({ idLast4: '123412341234' }, { draft: true }).idLast4).toBe('');
    expect(sanitizeProfile({ headAge: 4 }, { draft: true }).headAge).toBe('');
  });
  it('rejects out-of-range ages and non-numeric income', () => {
    expect(() => sanitizeProfile({ headAge: 7 })).toThrow(/age/i);
    expect(() => sanitizeProfile({ incomeBeforeApprox: '5k' })).toThrow(/income/i);
  });
  it('rejects non-object payloads', () => {
    expect(() => sanitizeProfile(null)).toThrow();
    expect(() => sanitizeProfile([])).toThrow();
  });
});

describe('missingDocumentsError', () => {
  const cats = [
    { id: 'aadhaar', label: 'Aadhaar Card', enabled: true, requiredForSubmission: true },
    { id: 'ration', label: 'Ration Card', enabled: true, requiredForSubmission: false },
    { id: 'legacy', label: 'Disabled ID', enabled: false, requiredForSubmission: true },
  ];

  it('requires at least one document when none uploaded', () => {
    expect(missingDocumentsError(cats, [])).toMatch(/at least one/i);
  });

  it('checks enabled categories marked requiredForSubmission', () => {
    expect(missingDocumentsError(cats, ['ration'])).toMatch(/Aadhaar Card/);
    expect(missingDocumentsError(cats, ['aadhaar'])).toBeNull();
  });
});
