/**
 * @file textTransforms.js
 * @description Pure text-normalization helpers shared by the exporter
 * (src/editor/registry/text.ts) and the font resolver (src/lib/fonts.js).
 *
 * Dependency-free, like hebrewComposition.js — fonts.js needs
 * stripInvisibleFormatting and normalizeTabsForBidi, and text.ts already
 * imports fonts.js, so those two functions cannot live in text.ts without
 * creating an import cycle. Moved here verbatim; text.ts re-exports them so
 * no existing call site or test had to change.
 */
import { composeHebrewClusters } from './hebrewComposition.js';

/**
 * Strips Unicode control (`\p{Cc}`) and format (`\p{Cf}`) characters from
 * `text`, mapping TAB to a single space (the editor's own textarea gives it
 * visible width, so dropping it outright would close up a gap the user
 * actually typed) and removing everything else in those categories outright.
 *
 * These are exactly the characters this catalogue's coverage is shakiest on
 * - TAB is missing from every bundled font, and Gveret Levin and Heebo are
 * also missing soft hyphen, ZWSP, LRM/RLM, word joiner, BOM and the
 * embedding-direction controls (measured with
 * `hasGlyphForCodePoint`, the same way `fontCoverage.test.js` judges Hebrew
 * coverage). LRM/RLM specifically ride along invisibly in Hebrew text copied
 * from the web, Word or WhatsApp - exactly how this app's users get their
 * text - so without this, `unrepresentableCharacters` below would refuse a
 * whole document over a character the user cannot see, find, or delete.
 * Verified separately: fontkit's `layout()` substitutes a harmless
 * zero-width space glyph for most of these (they are Unicode
 * "default-ignorable" format characters), but not for TAB, which is a
 * control character rather than a format one and does draw a literal
 * `.notdef` glyph if it reaches `layout()` unstripped.
 *
 * Applied on both the coverage check and wherever shaped text is actually
 * measured/drawn (`serialize`, in text.ts) via this one function, so the two
 * can never disagree - stripping only in the coverage check would let a
 * document pass and still draw whatever this was meant to keep off the page.
 *
 * Callers that care about real line breaks must split on `\r?\n` *before*
 * calling this, not after: `\n`/`\r` are themselves `\p{Cc}` and would
 * otherwise be stripped before there is anything left to split on.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripInvisibleFormatting(text) {
  return text.replace(/[\p{Cc}\p{Cf}]/gu, (ch) => (ch === '\t' ? ' ' : ''));
}

/**
 * The half of the strip that is safe to run BEFORE bidi resolution: TAB
 * becomes a space and nothing else changes.
 *
 * **`stripInvisibleFormatting` must never run before `resolveBidiRuns`.**
 * LRM/RLM (U+200E/200F) and the embedding controls (U+202A-202E, U+2066-2069)
 * are `\p{Cf}`, and they are the characters that *steer* UAX#9 - removing them
 * first deletes the input the algorithm is supposed to read. Measured on
 * `"הקובץ ‎(v2)‎ מוכן"`, which is ordinary text pasted from Word or WhatsApp:
 * with the marks it resolves the way the editor shows it, and stripped first
 * it resolves to `") מוכןv2הקובץ ("` - the parentheses torn off `v2` and
 * thrown to opposite ends of the line.
 *
 * So the order is: normalize TAB, resolve bidi with the marks intact, then
 * strip each resolved run (UAX#9 rule X9 removes the controls from display
 * once they have done their job). `serialize` in text.ts does exactly that.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeTabsForBidi(text) {
  return text.replace(/\t/g, ' ');
}

/**
 * Characters in `text` a font has no glyph for, given that font's own
 * `hasGlyph` predicate - deduplicated and in first-seen order, judged
 * against the exact string that would reach `layout()`, not the string the
 * caller passed in.
 *
 * This is the one implementation of the five-step "what will actually be
 * shaped" chain (docs/wysiwyg-text-architecture.md §3.1): split on real line
 * breaks first (a caller must not have already glued lines together -
 * `\n`/`\r` are themselves `\p{Cc}` and stripping first would erase the seam
 * a composition could otherwise cross), strip invisible formatting per line,
 * then run `composeHebrewClusters` per line gated on THIS font's own
 * `hasGlyph` - composition is font-dependent, so the composed string differs
 * per font and must be computed per font, never once and reused.
 *
 * Shared by two callers that judge coverage against two different kinds of
 * font handle: `unrepresentableCharacters` in src/editor/registry/text.ts
 * (wraps a pdf-lib/fontkit font already loaded into memory) and `covers` in
 * src/lib/fonts.js (wraps a synchronous lookup into the generated
 * fontCoverageTable.js, with no font ever loaded). Both need the identical
 * chain - a fork here is exactly the kind of drift that let the editor and
 * the exporter disagree about Hebrew before.
 *
 * @param {string} text
 * @param {(codePoint: number) => boolean} hasGlyph
 * @returns {string[]}
 */
export function findMissingGlyphs(text, hasGlyph) {
  const seen = new Set();
  const missing = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const composedLine = composeHebrewClusters(stripInvisibleFormatting(rawLine), hasGlyph);
    for (const ch of Array.from(composedLine)) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      if (!hasGlyph(ch.codePointAt(0))) missing.push(ch);
    }
  }
  return missing;
}
