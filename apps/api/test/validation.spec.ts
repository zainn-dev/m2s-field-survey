import { describe, it, expect } from 'vitest';
import { validateAnswer, sniffMime, isLast4 } from '../src/common/validation';
const q40 = { id: 'Q40', type: 'multi' as const, options: [{ code: '1', label: 'a' }, { code: '2', label: 'b' }, { code: '3', label: 'c' }] };
describe('validation', () => {
  it('Q40 needs exactly two', () => {
    expect(validateAnswer(q40, ['1'])).toMatch(/exactly two/);
    expect(validateAnswer(q40, ['1', '2', '3'])).toMatch(/exactly two/);
    expect(validateAnswer(q40, ['1', '2'])).toBeNull();
  });
  it('rejects unknown codes', () => expect(validateAnswer(q40, ['9', '1'])).toMatch(/unknown/));
  it('sniffs real signatures', () => {
    expect(sniffMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(Uint8Array.from([0x4d, 0x5a, 0, 0]))).toBeNull();
  });
  it('accepts only last 4 digits', () => { expect(isLast4('1234')).toBe(true); expect(isLast4('123456789012')).toBe(false); });
});
