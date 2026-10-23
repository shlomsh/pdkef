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

  it('never splits an emoji across head and tail', () => {
    const name = 'a'.repeat(19) + '😀' + 'b'.repeat(19);
    const { head, tail } = splitOutputName(name);
    expect(head + tail).toBe(name);
    expect(tail.length).toBeGreaterThanOrEqual(20);
    expect(head).not.toMatch(/[\uD800-\uDBFF]$/);
    expect(tail).not.toMatch(/^[\uDC00-\uDFFF]/);
  });

  it('keeps a Hebrew letter and its niqqud together', () => {
    const name = 'a'.repeat(18) + '\u05D1\u05B0' + 'b'.repeat(19);
    const { head, tail } = splitOutputName(name);
    expect(head + tail).toBe(name);
    expect(tail).not.toMatch(/^\p{M}/u);
    expect(head.endsWith('\u05D1')).toBe(false);
  });

  it('starts the tail on a word, not on the space before it', () => {
    const name = 'a'.repeat(20) + ' ' + 'b'.repeat(19);
    const { head, tail } = splitOutputName(name);
    expect(head + tail).toBe(name);
    expect(tail).not.toMatch(/^\s/);
    expect(tail.endsWith('b'.repeat(19))).toBe(true);
  });

  it('cuts ASCII exactly TAIL_LENGTH from the end', () => {
    const { tail } = splitOutputName('x'.repeat(40));
    expect(tail).toHaveLength(20);
  });
});

describe('fullNameOffset', () => {
  it('maps an offset in the head to itself and one in the tail past the head', () => {
    expect(fullNameOffset('abcdef', 'head', 2)).toBe(2);
    expect(fullNameOffset('abcdef', 'tail', 2)).toBe(8);
  });

  it('uses the real head length after a moved cut', () => {
    const name = 'a'.repeat(19) + '😀' + 'b'.repeat(19);
    const { head, tail } = splitOutputName(name);
    const i = 3;
    expect(name[fullNameOffset(head, 'tail', i)]).toBe(tail[i]);
  });
});
