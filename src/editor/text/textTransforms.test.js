import { describe, expect, it } from 'vitest';
import { findMissingGlyphs, normalizeTabsForBidi, stripInvisibleFormatting } from './textTransforms.js';

describe('stripInvisibleFormatting', () => {
  it('maps TAB to one space and removes other C0/C1 controls', () => {
    expect(stripInvisibleFormatting('a\tb\u0000c\u0085d\u007fe')).toBe('a bcde');
  });

  it('removes line endings (callers split first)', () => {
    expect(stripInvisibleFormatting('a\r\nb')).toBe('ab');
  });

  it('keeps format controls such as ZWJ, ZWNJ, RLM and ZWSP', () => {
    const text = 'a‍b‌c‏d​e';
    expect(stripInvisibleFormatting(text)).toBe(text);
  });

  it('leaves ordinary and empty text alone', () => {
    expect(stripInvisibleFormatting('שלום world')).toBe('שלום world');
    expect(stripInvisibleFormatting('')).toBe('');
  });
});

describe('normalizeTabsForBidi', () => {
  it('turns every TAB into a space and touches nothing else', () => {
    expect(normalizeTabsForBidi('a\tb\t\tc')).toBe('a b  c');
    expect(normalizeTabsForBidi('x\u0000y‎z')).toBe('x\u0000y‎z');
  });
});

describe('findMissingGlyphs', () => {
  it('returns nothing when the font has every glyph', () => {
    expect(findMissingGlyphs('abc', () => true)).toEqual([]);
  });

  it('lists missing characters once each, in first-seen order', () => {
    const has = (cp) => cp !== 'b'.codePointAt(0) && cp !== 'z'.codePointAt(0);
    expect(findMissingGlyphs('abzbza', has)).toEqual(['b', 'z']);
  });

  it('exempts format controls from coverage', () => {
    expect(findMissingGlyphs('a‍b‏', (cp) => cp === 'a'.codePointAt(0))).toEqual(['b']);
  });

  it('checks every line, and TAB becomes a space that needs a glyph', () => {
    expect(findMissingGlyphs('a\nq\r\nq', (cp) => cp === 'a'.codePointAt(0))).toEqual(['q']);
    expect(findMissingGlyphs('a\tb', (cp) => cp !== 0x20)).toEqual([' ']);
  });

  it('judges the Hebrew composed form when the font has it, the parts otherwise', () => {
    const composed = 'בּ'; // bet with dagesh
    expect(findMissingGlyphs('בּ', (cp) => cp === composed.codePointAt(0))).toEqual([]);
    expect(findMissingGlyphs('בּ', () => false)).toEqual(['ב', 'ּ']);
  });
});
