/**
 * The Hebrew substitution rule shared by the editor and the exporter.
 *
 * The whole point of the rule is that both sides answer identically, so the
 * screen and the downloaded PDF agree. See fonts.js for why the browser's own
 * per-character fallback cannot be relied on here.
 */
import { describe, it, expect } from 'vitest';
import {
  HANDWRITING_FONTS,
  HEBREW_CAPABLE_FONTS,
  TEXT_FONTS,
  containsHebrew,
  resolveFontFamily,
  supportsHebrew,
} from './fonts.js';

describe('containsHebrew', () => {
  it.each([
    ['שלום', true],
    ['שלומי שמש 1975', true],
    ['רחוב 17', true],
    ['ﬡ', true], // presentation form
    ['hello', false],
    ['1975', false],
    ['', false],
    [undefined, false],
  ])('%s -> %s', (text, expected) => {
    expect(containsHebrew(text)).toBe(expected);
  });
});

describe('resolveFontFamily', () => {
  it('leaves Latin text in the font that was picked, even a Latin-only one', () => {
    expect(resolveFontFamily('Caveat', 'Shlomi Shemesh')).toBe('Caveat');
    expect(resolveFontFamily('Pacifico', '')).toBe('Pacifico');
  });

  it('leaves Hebrew text alone when the picked font can render it', () => {
    for (const family of HEBREW_CAPABLE_FONTS) {
      expect(resolveFontFamily(family, 'שלום')).toBe(family);
    }
  });

  // Caveat and friends were never drawn with Hebrew letters, so there is no
  // complete build to ship — Hebrew has to borrow a face of the same character.
  it('swaps a Latin-only handwriting font for Hebrew handwriting', () => {
    expect(resolveFontFamily('Caveat', 'שלומי')).toBe('Gveret Levin');
    expect(resolveFontFamily('Dancing Script', 'רחוב 17')).toBe('Gveret Levin');
    expect(resolveFontFamily('Sacramento', 'שמש')).toBe('Gveret Levin');
  });

  it('swaps an unknown upright font for an upright Hebrew face', () => {
    expect(resolveFontFamily('Comic Sans MS', 'שלום')).toBe('Arimo');
  });

  it('defaults an unset family to Arimo', () => {
    expect(resolveFontFamily(undefined, 'שלום')).toBe('Arimo');
    expect(resolveFontFamily('', 'hello')).toBe('Arimo');
  });

  it('always resolves to a font that can actually render the text', () => {
    for (const family of [...TEXT_FONTS, ...HANDWRITING_FONTS]) {
      expect(supportsHebrew(resolveFontFamily(family, 'שלום'))).toBe(true);
    }
  });

  it('is idempotent, so the exporter re-resolving the editor’s choice is a no-op', () => {
    for (const family of [...TEXT_FONTS, ...HANDWRITING_FONTS]) {
      const once = resolveFontFamily(family, 'שלום');
      expect(resolveFontFamily(once, 'שלום')).toBe(once);
    }
  });
});
