/**
 * Bundled font coverage — guards the "exported PDF shows rectangles" bug class.
 *
 * The editor renders text with the same TTF via @font-face, but the browser
 * silently falls back per character to a system font when a glyph is missing,
 * so Hebrew looks fine on screen. `signPdf` embeds only the chosen TTF, and a
 * missing glyph there is a literal empty box in the exported PDF. That is how
 * Latin-only builds of Heebo and Assistant shipped unnoticed: nothing in the
 * app can see the gap, only the downloaded file shows it.
 *
 * So assert it against the real asset bytes: every general-purpose text font
 * the picker offers must actually carry Hebrew glyphs. The one deliberate
 * exception is a font added purely to signal support for a different script
 * (e.g. PT Sans for Cyrillic) — see NON_HEBREW_SCRIPT_FONTS below, which
 * relies on resolveFontFamily's generic fallback instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import {
  HEBREW_CAPABLE_FONTS,
  HEBREW_FALLBACK_HANDWRITING,
  HEBREW_FALLBACK_TEXT,
  TEXT_FONTS,
} from './fonts.js';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');

// Every letter including the five final forms.
const HEBREW_ALPHABET = 'אבגדהוזחטיכלמנסעפצקרשתםןץףך'.split('');
// Nikud (sheva), geresh, and the shekel sign — common in filled Hebrew forms.
const HEBREW_EXTRAS = [0x05b0, 0x05f3, 0x20aa];

/**
 * Every family fonts.js claims can render Hebrew — including the two stand-ins
 * resolveFontFamily substitutes in, which are the last line of defence and so
 * must hold up. The claim is a hardcoded list there; this checks it against the
 * actual bytes on disk.
 */
const HEBREW_CAPABLE_FAMILIES = HEBREW_CAPABLE_FONTS;

/**
 * TEXT_FONTS members added for a script other than Hebrew, which
 * intentionally carry no Hebrew glyphs of their own. resolveFontFamily's
 * generic fallback substitutes HEBREW_FALLBACK_TEXT for these when Hebrew
 * text is typed into them — checked in fonts.test.js's "always resolves to a
 * font that can actually render the text" — so they don't need to appear in
 * HEBREW_CAPABLE_FONTS the way the general-purpose text fonts do.
 */
const NON_HEBREW_SCRIPT_FONTS = ['PT Sans'];

const STYLES = ['Regular', 'Bold', 'Italic', 'BoldItalic'];

/** Mirrors loadCustomFont's naming scheme in sign.js. */
function variantFiles(family) {
  const base = family.replace(/\s+/g, '');
  return STYLES
    .map((style) => `${base}-${style}.ttf`)
    .filter((file) => existsSync(join(FONT_DIR, file)));
}

function characterSetOf(file) {
  return new Set(fontkit.create(readFileSync(join(FONT_DIR, file))).characterSet);
}

describe('bundled fonts offered for Hebrew', () => {
  it('claims Hebrew support for every general-purpose text font the picker offers', () => {
    const generalTextFonts = TEXT_FONTS.filter((family) => !NON_HEBREW_SCRIPT_FONTS.includes(family));
    expect(generalTextFonts.filter((family) => !HEBREW_CAPABLE_FONTS.includes(family))).toEqual([]);
  });

  it('substitutes in fonts that are themselves Hebrew-capable', () => {
    expect(HEBREW_CAPABLE_FONTS).toContain(HEBREW_FALLBACK_TEXT);
    expect(HEBREW_CAPABLE_FONTS).toContain(HEBREW_FALLBACK_HANDWRITING);
  });

  it.each(HEBREW_CAPABLE_FAMILIES)('%s ships at least a Regular file', (family) => {
    expect(variantFiles(family)).toContain(`${family.replace(/\s+/g, '')}-Regular.ttf`);
  });

  it.each(HEBREW_CAPABLE_FAMILIES.flatMap(variantFiles))(
    '%s covers the Hebrew alphabet, nikud, geresh, and the shekel sign',
    (file) => {
      const charset = characterSetOf(file);
      const missing = [
        ...HEBREW_ALPHABET.filter((letter) => !charset.has(letter.codePointAt(0))),
        ...HEBREW_EXTRAS.filter((code) => !charset.has(code)).map((code) => String.fromCodePoint(code)),
      ];
      expect(missing).toEqual([]);
    },
  );

  // Latin has to survive in the same file: Hebrew forms are full of digits,
  // and a mixed line is embedded as one font.
  it.each(HEBREW_CAPABLE_FAMILIES.flatMap(variantFiles))('%s also covers Latin letters and digits', (file) => {
    const charset = characterSetOf(file);
    expect(charset.has('A'.codePointAt(0))).toBe(true);
    expect(charset.has('0'.codePointAt(0))).toBe(true);
  });
});
