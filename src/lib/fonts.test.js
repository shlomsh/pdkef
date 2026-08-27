/**
 * The coverage-first font resolution rule shared by the editor and the
 * exporter (docs/wysiwyg-text-architecture.md §3.2).
 *
 * The whole point of the rule is that both sides answer identically, so the
 * screen and the downloaded PDF agree. See fonts.js for why the browser's own
 * per-character fallback cannot be relied on here.
 *
 * Coverage of the resolver against the real font bytes lives in
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
  FONT_STYLE_TAGS,
  HANDWRITING_FONTS,
  HEBREW_CAPABLE_FONTS,
  TEXT_FONTS,
  covers,
  resolveFontFamily,
  resolveFontSubstitution,
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

describe('covers', () => {
  it('is true for plain Latin text in every bundled font', () => {
    for (const family of [...TEXT_FONTS, ...HANDWRITING_FONTS]) {
      expect(covers(family, 'normal', 'normal', 'Shlomi Shemesh 1975')).toBe(true);
    }
  });

  it('is true for empty or unset text regardless of family', () => {
    expect(covers('Caveat', 'normal', 'normal', '')).toBe(true);
    expect(covers('Caveat', 'normal', 'normal', undefined)).toBe(true);
  });

  it('is false when the family genuinely lacks a script', () => {
    expect(covers('Caveat', 'normal', 'normal', 'שלום')).toBe(false);
    expect(covers('Heebo', 'normal', 'normal', 'Привіт')).toBe(false);
  });

  it('is true for a script-specific family on its own script', () => {
    for (const family of HEBREW_CAPABLE_FONTS) {
      expect(covers(family, 'normal', 'normal', 'שלום')).toBe(true);
    }
  });

  // §3.4: coverage is judged against the file that will really be embedded.
  // Caveat, Dancing Script, Kalam and Mali picked up real Bold faces (and
  // Mali real Italic/BoldItalic faces too), but Great Vibes still has no
  // bold anywhere upstream, so "bold Great Vibes" must still be judged
  // against GreatVibes-Regular.ttf (loadCustomFont's own fallback) - which
  // covers Latin - not treated as uncovered just because
  // GreatVibes-Bold.ttf doesn't exist.
  it('falls back to the Regular file when the requested weight/style file does not exist, same as loadCustomFont', () => {
    expect(existsSync(join(process.cwd(), 'public', 'fonts', 'GreatVibes-Bold.ttf'))).toBe(false);
    expect(covers('Great Vibes', 'bold', 'normal', 'Shlomi')).toBe(true);
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
      expect(covers(resolveFontFamily(family, 'שלום'), 'normal', 'normal', 'שלום')).toBe(true);
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
 * The same guarantees every script now gets, because the rule is no longer
 * per-script: whatever the user picked, resolution has to land on a font
 * that can actually draw what they typed, and land there in one step.
 */
describe('resolveFontFamily across every script the catalogue covers', () => {
  const rows = Object.entries(SCRIPT_PROBES);

  it.each(rows)('%s: resolves every bundled font to one that covers the probe', (_name, probe) => {
    for (const family of [...TEXT_FONTS, ...HANDWRITING_FONTS]) {
      const resolved = resolveFontFamily(family, probe);
      expect(covers(resolved, 'normal', 'normal', probe)).toBe(true);
    }
  });

  it.each(rows)('%s: is idempotent, so the exporter re-resolving the editor’s choice is a no-op', (_name, probe) => {
    for (const family of [...TEXT_FONTS, ...HANDWRITING_FONTS]) {
      const once = resolveFontFamily(family, probe);
      expect(resolveFontFamily(once, probe)).toBe(once);
    }
  });

  it.each(rows)('%s: leaves a font that already covers the probe alone', (_name, probe) => {
    for (const family of [...TEXT_FONTS, ...HANDWRITING_FONTS]) {
      if (covers(family, 'normal', 'normal', probe)) {
        expect(resolveFontFamily(family, probe)).toBe(family);
      }
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
    // Under the coverage rule (unlike the old per-script table, which special-
    // cased PT Sans as Cyrillic's designated fallback) any Cyrillic-capable
    // catalogue family is a valid candidate and Arimo, first in catalogue
    // order among sans-tagged candidates and already the default family,
    // wins the tiebreak - see §3.2/§3.3.
    expect(resolveFontFamily('Caveat', 'Привіт')).toBe('Arimo');
    expect(resolveFontFamily('Assistant', 'Привіт')).toBe('Arimo');
    expect(resolveFontFamily('Arimo', 'Привіт')).toBe('Arimo');
    expect(resolveFontFamily('Pacifico', 'Ελλάδα')).toBe('Arimo');
    expect(resolveFontFamily('Arimo', 'Ελλάδα')).toBe('Arimo');
  });

  it('resolves mixed scripts deterministically', () => {
    const mixed = 'שלום नमस्ते';
    expect(resolveFontFamily('Arimo', mixed)).toBe(resolveFontFamily('Arimo', mixed));
  });
});

describe('resolveFontSubstitution', () => {
  it('reports no substitution when the picked font can draw the text', () => {
    expect(resolveFontSubstitution('Arimo', 'Hello')).toEqual({ family: 'Arimo', requested: 'Arimo', missing: [] });
    expect(resolveFontSubstitution('Arimo', 'שלום')).toEqual({ family: 'Arimo', requested: 'Arimo', missing: [] });
    expect(resolveFontSubstitution('Kalam', 'नमस्ते')).toEqual({ family: 'Kalam', requested: 'Kalam', missing: [] });
  });

  it('names the characters that forced a change, so the editor can explain it', () => {
    const devanagari = resolveFontSubstitution('Arimo', 'नमस्ते');
    expect(devanagari.family).toBe('Kalam');
    expect(devanagari.requested).toBe('Arimo');
    expect(devanagari.missing.length).toBeGreaterThan(0);
    for (const ch of devanagari.missing) expect('नमस्ते').toContain(ch);

    const thai = resolveFontSubstitution('Caveat', 'สวัสดี');
    expect(thai.family).toBe('Mali');
    expect(thai.missing.length).toBeGreaterThan(0);

    const hebrew = resolveFontSubstitution('Caveat', 'שלום');
    expect(hebrew.family).toBe('Gveret Levin');
    expect(hebrew.missing.length).toBeGreaterThan(0);
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

  // §3.4: covers() is judged against the file that will really be embedded,
  // and a missing weight/style face is never substituted away to a different
  // family (that would trade the handwriting character for a checkbox).
  it('never substitutes families just because a bold/italic face is missing', () => {
    const bold = resolveFontSubstitution('Caveat', 'Signed', 'bold', 'normal');
    expect(bold.family).toBe('Caveat');
    expect(bold.missing).toEqual([]);
  });

  // §3.6 C2: when no single catalogue family covers the whole string, `missing`
  // must name what the KEPT family (`family`, which equals `requested` here)
  // actually can't draw - not "characters no family anywhere can draw", which
  // goes empty exactly when the user most needs a warning (a family exists per
  // script, just not one family for both).
  describe('when no catalogue family covers the whole string', () => {
    it('reports the characters the kept family cannot draw, for mixed scripts with no shared font', () => {
      const mixed = resolveFontSubstitution('Arimo', 'שלום Hello مرحبا');
      expect(mixed.family).toBe('Arimo');
      expect(mixed.requested).toBe('Arimo');
      // Arimo can draw the Hebrew and Latin; only the Arabic is missing.
      expect(mixed.missing.length).toBeGreaterThan(0);
      for (const ch of mixed.missing) expect('مرحبا').toContain(ch);
      expect(mixed.missing).not.toEqual(expect.arrayContaining(['ש', 'ל', 'ו', 'ם']));
    });

    it('is unchanged for a script no bundled font can draw at all (CJK)', () => {
      const cjk = resolveFontSubstitution('Arimo', '你好');
      expect(cjk.family).toBe('Arimo');
      expect(cjk.requested).toBe('Arimo');
      expect(cjk.missing).toEqual(['你', '好']);
    });
  });
});

/**
 * §3.3: the style tag exists so substitution prefers a same-character
 * replacement (handwriting for handwriting, sans for sans) over an arbitrary
 * catalogue-order pick.
 */
describe('FONT_STYLE_TAGS', () => {
  it('tags every catalogue family', () => {
    for (const family of [...HANDWRITING_FONTS, ...TEXT_FONTS]) {
      expect(FONT_STYLE_TAGS[family]).toBeDefined();
    }
  });

  it('tags every handwriting font as handwriting', () => {
    for (const family of HANDWRITING_FONTS) {
      expect(FONT_STYLE_TAGS[family]).toBe('handwriting');
    }
  });

  it('Tinos is the lone serif and Cousine the lone mono - changes nothing today, on purpose (§3.3)', () => {
    expect(FONT_STYLE_TAGS.Tinos).toBe('serif');
    expect(FONT_STYLE_TAGS.Cousine).toBe('mono');
    expect(Object.values(FONT_STYLE_TAGS).filter((tag) => tag === 'serif')).toEqual(['serif']);
    expect(Object.values(FONT_STYLE_TAGS).filter((tag) => tag === 'mono')).toEqual(['mono']);
  });
});

/**
 * FONT_VERTICAL_METRICS is a hardcoded snapshot of each bundled TTF's hhea
 * ascent/descent — checked against the real asset bytes the same way
 * fontCoverage.test.js checks glyph coverage, so a swapped font file can't
 * silently drift the table stale and let a clipped ascender back in.
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
