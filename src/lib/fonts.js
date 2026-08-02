/**
 * @file fonts.js
 * @description The bundled font catalogue and the one rule that decides which
 * font actually renders a piece of text.
 *
 * Kept free of pdf-lib/pdfjs imports on purpose: both the editor (Preact island)
 * and the exporter import this, and they must agree character for character.
 * The editor shows a font via @font-face, where the browser silently falls back
 * per character to some system font for glyphs the file lacks — but a PDF
 * embeds exactly one font per run and has no fallback, so a missing glyph is an
 * empty rectangle in the download. Letting the browser pick the fallback means
 * the screen and the export disagree, and you only find out after downloading.
 * So the substitution is decided here, explicitly, and applied on both sides.
 */

export const HANDWRITING_FONTS = ['Caveat', 'Dancing Script', 'Great Vibes', 'Gveret Levin', 'Pacifico', 'Playpen Sans Hebrew', 'Sacramento'];
export const TEXT_FONTS = ['Arimo', 'Tinos', 'Cousine', 'Assistant', 'Heebo'];

/**
 * Bundled families whose TTFs carry Hebrew glyphs. Verified against the real
 * asset bytes by src/lib/fontCoverage.test.js — update both together.
 */
export const HEBREW_CAPABLE_FONTS = ['Arimo', 'Tinos', 'Cousine', 'Assistant', 'Heebo', 'Gveret Levin', 'Playpen Sans Hebrew'];

/** Hebrew block plus the presentation forms (ligatures like ﬠ, vowelled variants). */
const HEBREW_PATTERN = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

/**
 * Stand-ins for the families that have no Hebrew glyphs at all. Caveat and the
 * other Latin handwriting faces were never drawn with an aleph — there is no
 * "complete" build to ship — so Hebrew borrows a bundled face of the same
 * character instead: handwriting for handwriting, upright for upright.
 */
export const HEBREW_FALLBACK_HANDWRITING = 'Gveret Levin';
export const HEBREW_FALLBACK_TEXT = 'Arimo';

export function containsHebrew(text) {
  return HEBREW_PATTERN.test(text || '');
}

export function supportsHebrew(fontFamily) {
  return HEBREW_CAPABLE_FONTS.includes(fontFamily);
}

/**
 * The family that should actually render `text`, given the family the user
 * picked. Substitutes a whole element at a time rather than a character at a
 * time: a run-by-run split would render "רחוב 17" in two different faces, and
 * the editor and the PDF would have to agree on where every run starts. One
 * family per box is what both sides can guarantee identically.
 *
 * @param {string} fontFamily - the family the user chose
 * @param {string} text       - the element's current content
 * @returns {string} the family to render and embed
 */
export function resolveFontFamily(fontFamily, text) {
  const family = fontFamily || HEBREW_FALLBACK_TEXT;
  if (!containsHebrew(text) || supportsHebrew(family)) return family;
  return HANDWRITING_FONTS.includes(family) ? HEBREW_FALLBACK_HANDWRITING : HEBREW_FALLBACK_TEXT;
}
