/**
 * The Hebrew substitution rule shared by the editor and the exporter.
 *
 * The whole point of the rule is that both sides answer identically, so the
 * screen and the downloaded PDF agree. See fonts.js for why the browser's own
 * per-character fallback cannot be relied on here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { DEFAULT_LINE_HEIGHT_EM, TEXT_BOX_PADDING_EM } from '../constants/signGeometry.js';
import {
  FONT_VERTICAL_METRICS,
  HANDWRITING_FONTS,
  HEBREW_CAPABLE_FONTS,
  TEXT_FONTS,
  containsHebrew,
  resolveFontFamily,
  supportsHebrew,
  textBoxPaddingEm,
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

/**
 * FONT_VERTICAL_METRICS is a hardcoded snapshot of each bundled TTF's hhea
 * ascent/descent — checked against the real asset bytes the same way
 * fontCoverage.test.js checks Hebrew glyph coverage, so a swapped font file
 * can't silently drift the table stale and let a clipped ascender back in.
 */
describe('FONT_VERTICAL_METRICS', () => {
  const FONT_DIR = join(process.cwd(), 'public', 'fonts');

  function regularFileFor(family) {
    return `${family.replace(/\s+/g, '')}-Regular.ttf`;
  }

  it('covers every font the picker offers', () => {
    for (const family of [...TEXT_FONTS, ...HANDWRITING_FONTS]) {
      expect(FONT_VERTICAL_METRICS[family]).toBeDefined();
    }
  });

  it('matches the real hhea ascent/descent of the bundled Regular TTF', () => {
    for (const [family, metrics] of Object.entries(FONT_VERTICAL_METRICS)) {
      const file = join(FONT_DIR, regularFileFor(family));
      expect(existsSync(file), `${file} should exist`).toBe(true);
      const font = fontkit.create(readFileSync(file));
      const ascent = font.ascent / font.unitsPerEm;
      const descent = Math.abs(font.descent) / font.unitsPerEm;
      // Table values are rounded to 3dp; allow the same rounding tolerance.
      expect(metrics.ascent).toBeCloseTo(ascent, 3);
      expect(metrics.descent).toBeCloseTo(descent, 3);
    }
  });
});

describe('textBoxPaddingEm', () => {
  it('never goes below the box’s baseline padding', () => {
    for (const family of [...TEXT_FONTS, ...HANDWRITING_FONTS]) {
      expect(textBoxPaddingEm(family)).toBeGreaterThanOrEqual(TEXT_BOX_PADDING_EM);
    }
  });

  it('falls back to the baseline padding for an unknown family', () => {
    expect(textBoxPaddingEm('Comic Sans MS')).toBe(TEXT_BOX_PADDING_EM);
    expect(textBoxPaddingEm(undefined)).toBe(TEXT_BOX_PADDING_EM);
  });

  // Real regression: Heebo (a plain text font, not even a script face) has an
  // ascent+descent well past DEFAULT_LINE_HEIGHT_EM, so the flat 0.12em
  // padding this replaces was clipping ordinary Hebrew text at the box's top
  // edge — not just the decorative handwriting fonts.
  it('gives every font enough room for its own ascent+descent, not just the default', () => {
    for (const [family, metrics] of Object.entries(FONT_VERTICAL_METRICS)) {
      const halfOverhang = Math.max(0, (metrics.ascent + metrics.descent - DEFAULT_LINE_HEIGHT_EM) / 2);
      expect(textBoxPaddingEm(family)).toBeGreaterThan(halfOverhang);
    }
  });

  it('scales with how far a font\'s metrics overshoot the line box', () => {
    expect(textBoxPaddingEm('Pacifico')).toBeGreaterThan(textBoxPaddingEm('Heebo'));
    expect(textBoxPaddingEm('Heebo')).toBeGreaterThan(textBoxPaddingEm('Arimo'));
  });
});
