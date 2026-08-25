/**
 * The script substitution rule shared by the editor and the exporter.
 *
 * The whole point of the rule is that both sides answer identically, so the
 * screen and the downloaded PDF agree. See fonts.js for why the browser's own
 * per-character fallback cannot be relied on here.
 *
 * Coverage of the SCRIPT_FALLBACKS table against the real font bytes lives in
 * fontCoverage.test.js; this file tests the resolution *rule* built on it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { DEFAULT_LINE_HEIGHT_EM, TEXT_BOX_PADDING_EM } from '../constants/signGeometry.js';
import {
  RETIRED_FONTS,
  FONT_VERTICAL_METRICS,
  HANDWRITING_FONTS,
  HEBREW_CAPABLE_FONTS,
  SCRIPT_FALLBACKS,
  TEXT_FONTS,
  containsHebrew,
  resolveFontFamily,
  resolveFontSubstitution,
  supportsHebrew,
  textBoxPaddingEm,
} from './fonts.js';

// One representative string per script, matching fontCoverage.test.js's probes.
const SCRIPT_PROBES = {
  Hebrew: 'שלום',
  Devanagari: 'नमस्ते',
  Thai: 'สวัสดี',
  Cyrillic: 'Привіт',
  Greek: 'Ελλάδα',
  Arabic: 'مرحبا',
};

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
 * The same two guarantees Hebrew has always had, now owed to every script in
 * the table. These are what turn "the download refused" into "the box quietly
 * used a font that works": whatever the user picked, resolution has to land on
 * a font that can actually draw what they typed, and land there in one step.
 */
describe('resolveFontFamily across every script in SCRIPT_FALLBACKS', () => {
  const rows = SCRIPT_FALLBACKS.map((row) => [row.name, row]);

  it.each(rows)('%s: resolves every bundled font to one that can draw the script', (name, row) => {
    const stranded = [...TEXT_FONTS, ...HANDWRITING_FONTS]
      .filter((family) => !row.capable.includes(resolveFontFamily(family, SCRIPT_PROBES[name])));
    expect(stranded).toEqual([]);
  });

  it.each(rows)('%s: is idempotent, so the exporter re-resolving the editor’s choice is a no-op', (name) => {
    for (const family of [...TEXT_FONTS, ...HANDWRITING_FONTS]) {
      const once = resolveFontFamily(family, SCRIPT_PROBES[name]);
      expect(resolveFontFamily(once, SCRIPT_PROBES[name])).toBe(once);
    }
  });

  it.each(rows)('%s: leaves a font that already covers the script alone', (name, row) => {
    for (const family of row.capable) {
      expect(resolveFontFamily(family, SCRIPT_PROBES[name])).toBe(family);
    }
  });

  // The cases that used to hit a wall at download time. Each is a real user
  // path: the default font is Arimo, and a handwriting font is what someone
  // picks for a signature-ish field.
  it('rescues the scripts that had no font of their own before', () => {
    expect(resolveFontFamily('Arimo', 'नमस्ते भारत')).toBe('Kalam');
    expect(resolveFontFamily('Arimo', 'สวัสดี')).toBe('Mali');
    expect(resolveFontFamily('Caveat', 'नमस्ते')).toBe('Kalam');
    expect(resolveFontFamily('Caveat', 'สวัสดี')).toBe('Mali');
    // Cyrillic and Greek only need rescuing from a font without them; Arimo
    // has both, so it must be left alone rather than swapped for no reason.
    expect(resolveFontFamily('Caveat', 'Привіт')).toBe('PT Sans');
    expect(resolveFontFamily('Assistant', 'Привіт')).toBe('PT Sans');
    expect(resolveFontFamily('Arimo', 'Привіт')).toBe('Arimo');
    expect(resolveFontFamily('Pacifico', 'Ελλάδα')).toBe('Arimo');
    expect(resolveFontFamily('Arimo', 'Ελλάδα')).toBe('Arimo');
  });

  // One element embeds exactly one font, so a line mixing two scripts that both
  // need substituting has no answer that satisfies both. Resolving by table
  // order at least makes it deterministic and identical on both sides; the
  // leftover characters are then caught by the live coverage check while typing
  // and refused by signPdf, rather than silently exported as empty boxes.
  it('resolves mixed scripts deterministically, by table order', () => {
    const mixed = 'שלום नमस्ते';
    expect(resolveFontFamily('Arimo', mixed)).toBe(resolveFontFamily('Arimo', mixed));
    const first = SCRIPT_FALLBACKS.find((row) => row.pattern.test(mixed));
    expect(first.name).toBe('Hebrew');
    expect(resolveFontFamily('Arimo', mixed)).toBe('Arimo');
  });
});

describe('resolveFontSubstitution', () => {
  it('reports no substitution when the picked font can draw the text', () => {
    expect(resolveFontSubstitution('Arimo', 'Hello')).toEqual({ family: 'Arimo', requested: 'Arimo', script: null });
    expect(resolveFontSubstitution('Arimo', 'שלום')).toEqual({ family: 'Arimo', requested: 'Arimo', script: null });
    expect(resolveFontSubstitution('Kalam', 'नमस्ते')).toEqual({ family: 'Kalam', requested: 'Kalam', script: null });
  });

  it('names the script that forced a change, so the editor can explain it', () => {
    expect(resolveFontSubstitution('Arimo', 'नमस्ते')).toEqual({ family: 'Kalam', requested: 'Arimo', script: 'Devanagari' });
    expect(resolveFontSubstitution('Caveat', 'สวัสดี')).toEqual({ family: 'Mali', requested: 'Caveat', script: 'Thai' });
    expect(resolveFontSubstitution('Caveat', 'שלום')).toEqual({ family: 'Gveret Levin', requested: 'Caveat', script: 'Hebrew' });
  });

  it('reports the replacement, not the retired name, as what was requested', () => {
    expect(resolveFontSubstitution('Playpen Sans Hebrew', 'שלום').requested).toBe('Gveret Levin');
  });

  it('agrees with resolveFontFamily on every bundled font and script', () => {
    for (const family of [...TEXT_FONTS, ...HANDWRITING_FONTS]) {
      for (const probe of Object.values(SCRIPT_PROBES)) {
        expect(resolveFontSubstitution(family, probe).family).toBe(resolveFontFamily(family, probe));
      }
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

/**
 * Dropping a font is not the same as deleting its name: drafts persist for 14
 * days and keep arriving with the family the user picked. An unmapped retired
 * name reopens the exact editor/export divergence this module exists to close.
 */
describe('retired fonts', () => {
  const FONT_DIR = join(process.cwd(), 'public', 'fonts');

  it('maps a retired family to a replacement we still ship, for Latin as well as Hebrew', () => {
    for (const [retired, replacement] of Object.entries(RETIRED_FONTS)) {
      // Non-vacuity: the retired name must genuinely be gone, or this passes
      // while proving nothing.
      expect(HANDWRITING_FONTS).not.toContain(retired);
      expect(TEXT_FONTS).not.toContain(retired);
      expect(HEBREW_CAPABLE_FONTS).not.toContain(retired);

      // Both sides land on the replacement whatever the script, so a restored
      // draft cannot render one way on screen and another in the download.
      expect(resolveFontFamily(retired, 'Shlomi Shahar')).toBe(replacement);
      expect(resolveFontFamily(retired, 'שלום')).toBe(replacement);

      // And the replacement is a font we actually ship, with a file on disk.
      expect([...HANDWRITING_FONTS, ...TEXT_FONTS]).toContain(replacement);
      expect(existsSync(join(FONT_DIR, `${replacement.replace(/\s+/g, '')}-Regular.ttf`))).toBe(true);
    }
  });

  it('has no stale asset or @font-face left for a retired family', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'styles', 'global.css'), 'utf8');
    for (const retired of Object.keys(RETIRED_FONTS)) {
      const base = retired.replace(/\s+/g, '');
      expect(css).not.toContain(retired);
      expect(existsSync(join(FONT_DIR, `${base}-Regular.ttf`))).toBe(false);
    }
  });
});
