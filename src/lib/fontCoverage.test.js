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
  HANDWRITING_FONTS,
  HEBREW_CAPABLE_FONTS,
  HEBREW_FALLBACK_HANDWRITING,
  HEBREW_FALLBACK_TEXT,
  SCRIPT_FALLBACKS,
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
const NON_HEBREW_SCRIPT_FONTS = ['PT Sans', 'Almarai'];

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

/**
 * SCRIPT_FALLBACKS is what stops a language hitting a wall at download time,
 * and every `capable` list in it is a claim about real font bytes. Checked here
 * against the shipped TTFs, both halves:
 *
 *  - every font a row calls capable really does cover that script, so a
 *    substitution can never land on a font that cannot draw the text; and
 *  - every font a row leaves *off* really cannot, which is the non-vacuity
 *    half. Without it a row listing nothing (or listing everything) would pass
 *    while proving nothing - the exact failure mode that let Thai ship bundled
 *    but unrouted, with Mali sitting in the catalogue unreachable by Thai text.
 */
describe('SCRIPT_FALLBACKS', () => {
  // One representative string per script, in the language we actually claim.
  //
  // `coversAll` judges a font by whether it covers EVERY character of its
  // probe, so "capable" is strictly a claim about the probe, not about the
  // whole Unicode block. That biases safely in one direction: a font missing
  // one probe character (Greek's precomposed ά, U+03AC, is the likely case) is
  // excluded from `capable` and substituted away even though it might have
  // rendered the user's actual text. The result is a font that definitely
  // works rather than one that might, which is the right way round - but it
  // does mean a probe change can silently widen or narrow a `capable` list, so
  // change these strings deliberately.
  const PROBES = {
    Hebrew: 'שלום',
    Devanagari: 'नमस्ते',
    Thai: 'สวัสดี',
    Cyrillic: 'Привіт',
    Greek: 'Ελλάδα',
    Arabic: 'مرحبا',
  };

  const BUNDLED = [...TEXT_FONTS, ...HANDWRITING_FONTS];

  function coversAll(family, probe) {
    const charset = characterSetOf(`${family.replace(/\s+/g, '')}-Regular.ttf`);
    return Array.from(probe).every((ch) => charset.has(ch.codePointAt(0)));
  }

  it('has a probe for every row, so no row goes unchecked', () => {
    expect(SCRIPT_FALLBACKS.map((row) => row.name).sort()).toEqual(Object.keys(PROBES).sort());
  });

  it.each(SCRIPT_FALLBACKS.map((row) => [row.name, row]))(
    '%s: every font listed capable really covers the script',
    (name, row) => {
      const liars = row.capable.filter((family) => !coversAll(family, PROBES[name]));
      expect(liars).toEqual([]);
    },
  );

  // The half that can actually fail when a font is added and the table is not
  // updated - which is how a bundled face ends up unreachable by the script it
  // was added for.
  it.each(SCRIPT_FALLBACKS.map((row) => [row.name, row]))(
    '%s: no bundled font left off the list can secretly draw it',
    (name, row) => {
      const missed = BUNDLED.filter((family) => !row.capable.includes(family) && coversAll(family, PROBES[name]));
      expect(missed).toEqual([]);
    },
  );

  it.each(SCRIPT_FALLBACKS.map((row) => [row.name, row]))(
    '%s: both fallback targets are themselves capable, which is what makes resolution idempotent',
    (name, row) => {
      expect(row.capable).toContain(row.handwriting);
      expect(row.capable).toContain(row.text);
    },
  );

  it.each(SCRIPT_FALLBACKS.map((row) => [row.name, row]))(
    '%s: both fallback targets are fonts we actually ship, with a file on disk',
    (name, row) => {
      for (const target of [row.handwriting, row.text]) {
        expect(BUNDLED).toContain(target);
        expect(existsSync(join(FONT_DIR, `${target.replace(/\s+/g, '')}-Regular.ttf`))).toBe(true);
      }
    },
  );
});

/**
 * Dari/Farsi rides the existing Arabic row with no new SCRIPT_FALLBACKS entry:
 * Persian's four extra letters (پ چ ژ گ) and the Extended Arabic-Indic
 * (Persian) digit block ۰-۹ both sit inside the *main* Arabic block
 * (U+0600-06FF) the Arabic pattern already matches, so Dari/Farsi text
 * already resolves to Almarai today via that one row - see TODO.md's "Almarai
 * may already cover Farsi and Urdu's extra letters" finding. This describe
 * checks that claim against the real font bytes rather than leaving it as an
 * unverified aside: the SCRIPT_FALLBACKS suite above only probes the plain
 * Arabic string 'مرحبا', which never exercises these codepoints, so nothing
 * upstream would fail if Almarai quietly lost one of them.
 *
 * Pashto is NOT covered here on purpose - a direct check found Almarai
 * missing 8 of 9 Pashto-specific letters (ټ ډ ړ ږ ښ ګ ڼ ې), so Pashto stays
 * unclaimed and unrouted until it gets its own font.
 */
describe('Dari/Farsi letters and digits (Almarai, via the existing Arabic fallback row)', () => {
  const PERSIAN_LETTERS = ['پ', 'چ', 'ژ', 'گ'];
  const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'.split('');

  it('Almarai has real glyphs for every Persian-specific letter', () => {
    const charset = characterSetOf('Almarai-Regular.ttf');
    const missing = PERSIAN_LETTERS.filter((letter) => !charset.has(letter.codePointAt(0)));
    expect(missing).toEqual([]);
  });

  it('Almarai has real glyphs for every Extended Arabic-Indic (Persian) digit', () => {
    const charset = characterSetOf('Almarai-Regular.ttf');
    const missing = PERSIAN_DIGITS.filter((digit) => !charset.has(digit.codePointAt(0)));
    expect(missing).toEqual([]);
  });
});
