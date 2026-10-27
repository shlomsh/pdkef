import { describe, expect, it } from 'vitest';
import { sanitizeOutputName } from './sanitizeOutputName.ts';

describe('sanitizeOutputName', () => {
  it('drops path separators and plus signs', () => {
    expect(sanitizeOutputName('a/b\\c+d')).toBe('abcd');
  });

  it('drops control characters, including tabs and newlines', () => {
    expect(sanitizeOutputName('a\tb\nc\u0000d')).toBe('abcd');
  });

  it('collapses runs of spaces and trims the ends', () => {
    expect(sanitizeOutputName('  my   report  ')).toBe('my report');
  });

  it('keeps Unicode as typed', () => {
    expect(sanitizeOutputName('דוח שנתי')).toBe('דוח שנתי');
  });

  it('returns an empty string when nothing is left', () => {
    expect(sanitizeOutputName('//+\\')).toBe('');
    expect(sanitizeOutputName('')).toBe('');
  });

  it('caps at 120 code points without splitting a surrogate pair', () => {
    expect(sanitizeOutputName('a'.repeat(200))).toBe('a'.repeat(120));
    const emoji = '😀'.repeat(130);
    const out = sanitizeOutputName(emoji);
    expect(Array.from(out)).toHaveLength(120);
    expect(out).toBe('😀'.repeat(120));
  });

  it('leaves a name of exactly 120 code points alone', () => {
    const name = 'b'.repeat(120);
    expect(sanitizeOutputName(name)).toBe(name);
  });
});
