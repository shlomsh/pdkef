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
 * Removes only unsafe C0/C1 controls from `text`, mapping TAB to one space.
 * Unicode format characters (`\p{Cf}`) are deliberately retained. In
 * particular ZWJ (U+200D) and ZWNJ (U+200C) participate in Arabic/Indic
 * shaping; removing either changes the authored word even though it has no
 * visible glyph. Directional controls, ZWSP and word joiner are also retained
 * in `/ActualText`, so copied/searchable PDF text remains authored text.
 *
 * This is a bounded control policy: line endings are split by callers before
 * this function; TAB becomes one ordinary layout space because bundled fonts
 * do not contain a tab glyph; all other C0/C1 controls are removed because
 * PDF text layout has no safe meaning for them. Format controls are excluded
 * from glyph-coverage checks below, since shaping controls do not require a
 * visible font glyph.
 *
 * Callers that care about real line breaks must split on `\r?\n` *before*
 * calling this, not after: `\n`/`\r` are themselves `\p{Cc}` and would
 * otherwise be stripped before there is anything left to split on.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripInvisibleFormatting(text) {
  return text.replace(/[\p{Cc}]/gu, (ch) => (ch === '\t' ? ' ' : ''));
}

/**
 * The half of the strip that is safe to run BEFORE bidi resolution: TAB
 * becomes a space and nothing else changes.
 *
 * **`stripInvisibleFormatting` must never run before `resolveBidiRuns`.**
 * It currently preserves format controls, but that ordering remains a hard
 * contract: LRM/RLM (U+200E/200F) and embedding controls (U+202A-202E,
 * U+2066-2069) steer UAX#9. Measured on
 * `"הקובץ ‎(v2)‎ מוכן"`, which is ordinary text pasted from Word or WhatsApp:
 * with the marks it resolves the way the editor shows it, and stripped first
 * it resolves to `") מוכןv2הקובץ ("` - the parentheses torn off `v2` and
 * thrown to opposite ends of the line.
 *
 * So the order is: normalize TAB, resolve bidi with the marks intact, then
 * remove only unsafe controls from each resolved run. The retained formatting
 * controls reach both the shaper and `/ActualText`.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeTabsForBidi(text) {
  return text.replace(/\t/g, ' ');
}

/**
 * Characters in `text` a font has no glyph for, given that font's own
 * `hasGlyph` predicate - deduplicated and in first-seen order. Format
 * controls are intentionally exempt: they reach `layout()` for their shaping
 * effect, but never require a visible glyph.
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
      // Cf covers ZWJ/ZWNJ and bidi controls. They remain in the export text
      // path, but font coverage answers whether ink can be drawn, so a font
      // correctly lacking a default-ignorable glyph must not block saving.
      if (/\p{Cf}/u.test(ch)) continue;
      if (seen.has(ch)) continue;
      seen.add(ch);
      if (!hasGlyph(ch.codePointAt(0))) missing.push(ch);
    }
  }
  return missing;
}
