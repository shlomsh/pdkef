import { describe, expect, it } from 'vitest';
import { splitOutputName, fullNameOffset } from './outputNameCut.ts';

describe('splitOutputName', () => {
  it('leaves a short name whole', () => {
    expect(splitOutputName('merged_a')).toEqual({ head: 'merged_a', tail: '' });
  });

  it('keeps the end of a long name as the tail, so what tells files apart stays visible', () => {
    const name = 'merged_redacted_signed_Service_Pages_Income_tax_annual-report-2024_itc1040 (final) (3)';
    const { head, tail } = splitOutputName(name);
    expect(head + tail).toBe(name);
    expect(tail.endsWith('itc1040 (final) (3)')).toBe(true);
    expect(head.startsWith('merged_redacted')).toBe(true);
  });
});

describe('fullNameOffset', () => {
  it('maps an offset in the head to itself and one in the tail past the head', () => {
    expect(fullNameOffset('abcdef', 'head', 2)).toBe(2);
    expect(fullNameOffset('abcdef', 'tail', 2)).toBe(8);
  });
});
