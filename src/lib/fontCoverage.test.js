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
 * W3 (docs/wysiwyg-text-architecture.md §3) replaced the old per-script
 * SCRIPT_FALLBACKS table - a hand-maintained claim about which fonts could
 * draw which script - with a coverage-first resolver that reads the real font
 * bytes at resolution time. There is no longer a claims table to check
 * against the bytes; the thing that must be checked against the bytes is the
 * resolver itself. This file does two things:
 *
 *  - `covers` is not vacuous: it is cross-checked, per bundled family and per
 *    script probe, against an independent charset read straight from the
 *    real TTFs (not against anything fonts.js computes) - in both
 *    directions, so a `covers()` that always said yes, or always said no,
 *    would fail here immediately.
 *  - `resolveFontSubstitution` always lands on a family that genuinely covers
 *    the text, or genuinely reports what nothing can draw - never a third,
 *    silent outcome - pinned against the exact cases §3.6 predicted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import {
  HANDWRITING_FONTS,
  HEBREW_CAPABLE_FONTS,
  TEXT_FONTS,
  covers,
  hasRealFace,
  resolveFontSubstitution,
} from './fonts.js';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');
const CATALOGUE = [...HANDWRITING_FONTS, ...TEXT_FONTS];

// Every letter including the five final forms.
const HEBREW_ALPHABET = 'אבגדהוזחטיכלמנסעפצקרשתםןץףך'.split('');
// Nikud (sheva), geresh, and the shekel sign — common in filled Hebrew forms.
const HEBREW_EXTRAS = [0x05b0, 0x05f3, 0x20aa];

const STYLES = ['Regular', 'Bold', 'Italic', 'BoldItalic'];

/** Mirrors loadCustomFont's naming scheme in sign.js. */
function variantFiles(family) {
  const base = family.replace(/\s+/g, '');
  return STYLES
    .map((style) => `${base}-${style}.ttf`)
    .filter((file) => existsSync(join(FONT_DIR, file)));
}

const charsetCache = new Map();
function characterSetOf(file) {
  if (!charsetCache.has(file)) {
    charsetCache.set(file, new Set(fontkit.create(readFileSync(join(FONT_DIR, file))).characterSet));
  }
  return charsetCache.get(file);
}

/** Independent oracle: does family's Regular file, read straight off disk,
 * have a glyph for every character of `text`? Deliberately reimplemented
 * here rather than calling into fonts.js, so this can actually catch a
 * `covers()` that lies. */
function reallyCovers(family, text) {
  const charset = characterSetOf(`${family.replace(/\s+/g, '')}-Regular.ttf`);
  return Array.from(text).every((ch) => charset.has(ch.codePointAt(0)));
}

describe('bundled fonts offered for Hebrew', () => {
  it.each(HEBREW_CAPABLE_FONTS)('%s ships at least a Regular file', (family) => {
    expect(variantFiles(family)).toContain(`${family.replace(/\s+/g, '')}-Regular.ttf`);
  });

  it.each(HEBREW_CAPABLE_FONTS.flatMap(variantFiles))(
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
  it.each(HEBREW_CAPABLE_FONTS.flatMap(variantFiles))('%s also covers Latin letters and digits', (file) => {
    const charset = characterSetOf(file);
    expect(charset.has('A'.codePointAt(0))).toBe(true);
    expect(charset.has('0'.codePointAt(0))).toBe(true);
  });

  // The reverse half. Everything above only checks that HEBREW_CAPABLE_FONTS
  // is not lying upward (every listed family really does cover Hebrew) - it
  // says nothing about a family left OFF the list that actually can draw
  // Hebrew too. That is exactly CLAUDE.md's "every font left off cannot draw
  // the script" half, the one that catches a bundled-but-unrouted face (the
  // Thai-shipped-unrouted failure mode, applied here to Hebrew instead). This
  // list is hand-written on purpose (see fonts.js's comment above the
  // export) - checking it against the real bytes both ways is what keeps a
  // hand-written claim honest without turning it into a derived, tautological
  // list.
  it('every catalogue family left off HEBREW_CAPABLE_FONTS genuinely lacks the Hebrew alphabet', () => {
    const unlisted = CATALOGUE.filter((family) => !HEBREW_CAPABLE_FONTS.includes(family));
    // Non-vacuity for the split itself: if HEBREW_CAPABLE_FONTS were the
    // whole catalogue (or empty), this loop would check nothing (or the
    // "every listed family covers Hebrew" tests above would check nothing) -
    // either way, one direction would be vacuous.
    expect(unlisted.length).toBeGreaterThan(0);
    expect(HEBREW_CAPABLE_FONTS.length).toBeGreaterThan(0);

    for (const family of unlisted) {
      const charset = characterSetOf(`${family.replace(/\s+/g, '')}-Regular.ttf`);
      const hasFullHebrewSet =
        HEBREW_ALPHABET.every((letter) => charset.has(letter.codePointAt(0))) &&
        HEBREW_EXTRAS.every((code) => charset.has(code));
      expect(hasFullHebrewSet, `${family} is not in HEBREW_CAPABLE_FONTS but its Regular file covers the full Hebrew alphabet`).toBe(false);
    }
  });
});

/**
 * `covers()` is the whole substitution mechanism now - every claim
 * `resolveFontSubstitution` makes is only as good as this predicate. Checked
 * here against the shipped TTFs, both halves, the same non-vacuity discipline
 * the old SCRIPT_FALLBACKS check used:
 *
 *  - every family `covers()` says yes to really does have every glyph, so a
 *    substitution can never land on a font that cannot draw the text; and
 *  - every family `covers()` says no to really is missing at least one glyph
 *    - the non-vacuity half. Without it, a `covers()` that always returned
 *    true (or always false) would pass every one-directional assertion here
 *    while proving nothing - the exact failure mode that let Thai ship
 *    bundled but unrouted under the old table.
 */
describe('covers is not vacuous', () => {
  // One representative string per script, in the language we actually claim.
  //
  // The four scripts below (Japanese, Bengali, Vietnamese, Urdu) were added
  // when the Sign page's language claims grew to twelve but this probe set
  // stayed at six - the exact gap "Thai shipped bundled but unrouted" warns
  // about, just not yet triggered a second time. Each string is chosen to
  // exercise what actually distinguishes the claim, not just "some script
  // character":
  //  - Japanese: 山田太郎, a stock example name (the Japanese equivalent of
  //    "John Doe") - all three characters are jōyō kanji, so this probes the
  //    kanji claim in src/data/tools.js's Japanese note, not just kana.
  //  - Bengali: নমস্কার ("namaskar", a common greeting) - a real word, not a
  //    synthetic pangram.
  //  - Vietnamese: Cảm ơn ("thank you") - carries both a stacked-diacritic
  //    vowel (ả, Latin Extended Additional) and the bare ơ (Latin Extended-A),
  //    the two codepoint groups scripts/font-languages.mjs defines Vietnamese
  //    coverage from, so a font with only plain Latin accents cannot fake a
  //    pass on this probe.
  //  - Urdu: نہیں ("no") - a common word built from ہ (heh goal) and ں (noon
  //    ghunna), two of the seven letters Urdu needs that Arabic itself has no
  //    glyph for at all (see URDU_EXTRA_LETTERS in font-languages.mjs). Using
  //    plain Arabic-only text here would only re-probe the Arabic row above,
  //    not the thing that makes the Urdu claim a separate, checkable fact.
  const PROBES = {
    Hebrew: 'שלום',
    Devanagari: 'नमस्ते',
    Thai: 'สวัสดี',
    Cyrillic: 'Привіт',
    Greek: 'Ελλάδα',
    Arabic: 'مرحبا',
    Japanese: '山田太郎',
    Bengali: 'নমস্কার',
    Vietnamese: 'Cảm ơn',
    Urdu: 'نہیں',
  };

  it.each(Object.entries(PROBES))('%s: covers() agrees with the real font bytes for every bundled family', (_name, probe) => {
    for (const family of CATALOGUE) {
      expect(covers(family, 'normal', 'normal', probe)).toBe(reallyCovers(family, probe));
    }
  });

  it.each(Object.entries(PROBES))('%s: at least one bundled family covers it, and at least one genuinely does not', (_name, probe) => {
    const covering = CATALOGUE.filter((family) => reallyCovers(family, probe));
    const notCovering = CATALOGUE.filter((family) => !reallyCovers(family, probe));
    // Non-vacuity for the probe set itself: if every family covered or none
    // did, the "both halves" check above wouldn't be exercising both halves.
    expect(covering.length).toBeGreaterThan(0);
    expect(notCovering.length).toBeGreaterThan(0);
  });
});

/**
 * W5 (docs/wysiwyg-text-architecture.md §3.4): the guard that would have
 * caught synthetic bold on the day it shipped. `ElementToolbar.tsx` uses
 * `hasRealFace` to decide whether to offer Bold/Italic at all - if that ever
 * said yes for a `(family, weight, style)` with no real file, the picker
 * would let the user request a face `loadCustomFont` can't deliver, right
 * back to bold-on-screen-upright-in-the-download. `hasRealFace` is driven by
 * the generated `FONT_COVERAGE_FILES`, so this is really asking whether the
 * generator and `existsSync` still agree - but that agreement is exactly the
 * thing that must never silently drift.
 */
describe('W5: every (family, weight, style) the picker could offer has a real file', () => {
  const STYLE_COMBOS = [['normal', 'normal'], ['bold', 'normal'], ['normal', 'italic'], ['bold', 'italic']];
  it.each(CATALOGUE.flatMap((family) => STYLE_COMBOS.map(([weight, style]) => [family, weight, style])))(
    '%s bold=%s italic=%s',
    (family, weight, style) => {
      if (!hasRealFace(family, weight, style)) return; // the picker disables it - nothing offered, nothing to check
      const suffix = weight === 'bold' ? (style === 'italic' ? 'BoldItalic' : 'Bold') : (style === 'italic' ? 'Italic' : 'Regular');
      const file = `${family.replace(/\s+/g, '')}-${suffix}.ttf`;
      expect(existsSync(join(FONT_DIR, file))).toBe(true);
    }
  );
});

/**
 * The rule from docs/wysiwyg-text-architecture.md §3.2, pinned against the
 * exact cases §3.6 measured and predicted. Each row states what the resolver
 * must do, checked two ways: does its pick genuinely cover the (composed)
 * text, per the same independent oracle above, and is the outcome one of
 * exactly the two the rule allows (a genuinely-covering family, or an honest
 * "nothing covers this")?
 */
describe('resolveFontSubstitution: every outcome is either a real cover or an honest refusal, never a third thing', () => {
  const CASES = [
    ['plain Latin', 'Arimo', 'Hello world'],
    ['plain Hebrew', 'Heebo', 'שלום עולם'],
    ['plain Devanagari', 'Kalam', 'नमस्ते'],
    ['Hebrew in a Latin handwriting font', 'Caveat', 'שלום'],
    ['Devanagari in the default font', 'Arimo', 'नमस्ते भारत'],
    ['Thai in the default font', 'Arimo', 'สวัสดี'],
    ['Cyrillic in a Hebrew-only font', 'Heebo', 'Привіт'],
    ['Greek in a handwriting font', 'Pacifico', 'Ελλάδα'],
  ];

  it.each(CASES)('%s', (_label, family, text) => {
    const { family: resolved } = resolveFontSubstitution(family, text);
    if (reallyCovers(resolved, text)) {
      // Case 2 (left alone) or case 3 (substituted): either way, a real pick.
      return;
    }
    // Case 4: nothing the resolver could offer covers the whole string, so it
    // kept the requested family. Verify that honestly - every catalogue
    // family must genuinely fail to cover the text too, or this would be a
    // silent third outcome instead of the honest refusal the rule promises.
    expect(resolved).toBe(family);
    for (const badFamily of CATALOGUE) {
      expect(reallyCovers(badFamily, text)).toBe(false);
    }
  });
});

/**
 * §3.6's table, verbatim: the exact behaviour change the coverage rule makes
 * over the retired per-script table. Each of these was a refusal before W3;
 * measuring what the resolver now returns is the point of this suite, so
 * these values are pinned rather than guessed at.
 */
describe('§3.6: what the rule changes, case by case', () => {
  it('שלום Привіт in Heebo: today refused, now drawn in a family that covers both, substitution explained', () => {
    const result = resolveFontSubstitution('Heebo', 'שלום Привіт');
    expect(result.family).not.toBe('Heebo');
    expect(reallyCovers(result.family, 'שלום Привіт')).toBe(true);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('שלום Привіт in Gveret Levin: same rescue, and missing must name the Cyrillic the handwriting face could not draw', () => {
    const result = resolveFontSubstitution('Gveret Levin', 'שלום Привіт');
    expect(reallyCovers(result.family, 'שלום Привіт')).toBe(true);
    // The handwriting face has Hebrew but not Cyrillic, so what it could not
    // draw is exactly the Cyrillic letters, not the Hebrew ones.
    for (const ch of result.missing) expect('Привіт').toContain(ch);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('שלום ά (decomposed alpha + combining acute) in Heebo: silently lost before W2, refused after W2, now resolved', () => {
    const decomposed = `שלום ${String.fromCodePoint(0x03b1, 0x0301)}`;
    const result = resolveFontSubstitution('Heebo', decomposed);
    // NFC composes alpha+acute to U+03AC before coverage is judged (§3.1
    // step 5) - Heebo lacks it, so a family that has it must be picked.
    expect(reallyCovers(result.family, decomposed)).toBe(true);
    expect(result.family).not.toBe('Heebo');
  });

  it('שלום Hello مرحبا: still uncovered, because genuinely no bundled family covers Hebrew and Arabic together', () => {
    const text = 'שלום Hello مرحبا';
    expect(CATALOGUE.some((family) => reallyCovers(family, text))).toBe(false);
    const result = resolveFontSubstitution('Arimo', text);
    // No candidate covers the whole string, so the rule keeps the requested
    // family rather than picking an arbitrary one - signPdf's own refusal
    // (judged against this same family) is what actually stops the download.
    expect(result.family).toBe('Arimo');
  });

  it('שלום + Thai: still uncovered, no bundled family covers both', () => {
    const text = 'שלום สวัสดี';
    expect(CATALOGUE.some((family) => reallyCovers(family, text))).toBe(false);
    const result = resolveFontSubstitution('Arimo', text);
    expect(result.family).toBe('Arimo');
  });

  it('Ω in an otherwise-Latin box requested as Heebo: substitutes, because Heebo\'s Greek coverage is genuinely partial', () => {
    const text = `Hello ${String.fromCodePoint(0x03a9)}`; // Ω, U+03A9
    expect(reallyCovers('Heebo', text)).toBe(false);
    const result = resolveFontSubstitution('Heebo', text);
    expect(result.family).not.toBe('Heebo');
    expect(reallyCovers(result.family, text)).toBe(true);
  });

  it('bold Signed in Great Vibes: exports upright before W3 (silent); now the weight is simply not honoured, no family swap - W5 disables the checkbox', () => {
    // §3.4: covers() judges the file that will really be embedded
    // (GreatVibes-Regular.ttf, since Great Vibes has no bold face anywhere
    // upstream), and that file covers plain Latin - so no substitution
    // happens. Whether the picker stops offering Bold on this family at all
    // is W5, not this resolver. (Caveat, Dancing Script, Kalam and Mali used
    // to illustrate this same case, but they now ship real Bold faces, so
    // this case moved to a family that genuinely still has none.)
    expect(existsSync(join(FONT_DIR, 'GreatVibes-Bold.ttf'))).toBe(false);
    const result = resolveFontSubstitution('Great Vibes', 'Signed', 'bold', 'normal');
    expect(result.family).toBe('Great Vibes');
    expect(result.missing).toEqual([]);
  });
});

/**
 * Dari/Farsi rides the existing Arabic coverage with no extra machinery:
 * Persian's four extra letters (پ چ ژ گ) and the Extended Arabic-Indic
 * (Persian) digit block ۰-۹ both sit inside the *main* Arabic block
 * (U+0600-06FF), which Almarai's real bytes cover - see TODO.md's "Almarai
 * may already cover Farsi and Urdu's extra letters" finding. This describe
 * checks that claim against the real font bytes directly, since neither
 * suite above probes these specific codepoints.
 *
 * Pashto is NOT covered here on purpose - a direct check found Almarai
 * missing 8 of 9 Pashto-specific letters (ټ ډ ړ ږ ښ ګ ڼ ې), so Pashto stays
 * unclaimed and unrouted until it gets its own font.
 */
describe('Dari/Farsi letters and digits (Almarai)', () => {
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
