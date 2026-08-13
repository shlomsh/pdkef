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

import { DEFAULT_LINE_HEIGHT_EM, TEXT_BOX_PADDING_EM } from '../constants/signGeometry.js';

export const HANDWRITING_FONTS = ['Caveat', 'Dancing Script', 'Great Vibes', 'Gveret Levin', 'Pacifico', 'Playpen Sans Hebrew', 'Sacramento'];
export const TEXT_FONTS = ['Arimo', 'Tinos', 'Cousine', 'Assistant', 'Heebo'];

/**
 * Real ascent/descent for every bundled family, as a fraction of the em —
 * read from each TTF's hhea table (weights within a family share vertical
 * metrics, so this is keyed by family only). Verified against the real asset
 * bytes by src/lib/fontCoverage.test.js, the same way it checks Hebrew glyph
 * coverage — update both together if a font file is ever swapped.
 *
 * CSS `line-height` sets a fixed-height line box, but a browser positions
 * glyphs inside it by the font's own ascent+descent (half-leading, split
 * evenly top and bottom), not by the line-height number itself. Most bundled
 * faces have an ascent+descent bigger than DEFAULT_LINE_HEIGHT_EM, so they
 * paint outside that line box by (ascent+descent - DEFAULT_LINE_HEIGHT_EM)/2
 * on each side — worst for the loopy script faces (Pacifico's loops need
 * roughly 3x what Arimo does), but Heebo, a plain text font, needs real room
 * too. A `<textarea>` clips its own content to its box regardless of
 * `overflow`, so an under-padded box reads as a clipped ascender/descender.
 * textBoxPaddingEm() below is what turns this into the padding each font
 * actually needs, without inflating every other font's box to match the
 * worst case.
 */
export const FONT_VERTICAL_METRICS = {
  Arimo: { ascent: 0.905, descent: 0.212 },
  Tinos: { ascent: 0.891, descent: 0.216 },
  Cousine: { ascent: 0.833, descent: 0.300 },
  Assistant: { ascent: 1.021, descent: 0.287 },
  Heebo: { ascent: 1.048, descent: 0.421 },
  Caveat: { ascent: 0.960, descent: 0.300 },
  'Dancing Script': { ascent: 0.920, descent: 0.280 },
  'Great Vibes': { ascent: 0.851, descent: 0.401 },
  'Gveret Levin': { ascent: 0.990, descent: 0.310 },
  Pacifico: { ascent: 1.303, descent: 0.453 },
  'Playpen Sans Hebrew': { ascent: 1.070, descent: 0.460 },
  Sacramento: { ascent: 0.930, descent: 0.529 },
};

// Slack on top of the computed overhang: the metrics are exact, but hinting
// and antialiasing can paint a hair past them. Costs nothing on fonts that
// don't need it — they're floored at TEXT_BOX_PADDING_EM below regardless.
const VERTICAL_METRICS_SLACK_EM = 0.02;

/**
 * Vertical padding (em, each side) a text box needs so `fontFamily`'s real
 * ascent+descent never spills past its line box. Never goes below
 * TEXT_BOX_PADDING_EM, the box's padding for the common case — this only
 * ever adds room on top of it, never removes it.
 */
export function textBoxPaddingEm(fontFamily) {
  const metrics = FONT_VERTICAL_METRICS[fontFamily];
  if (!metrics) return TEXT_BOX_PADDING_EM;
  const overhang = Math.max(0, (metrics.ascent + metrics.descent - DEFAULT_LINE_HEIGHT_EM) / 2);
  return Math.max(TEXT_BOX_PADDING_EM, overhang + VERTICAL_METRICS_SLACK_EM);
}

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
 * @param {string} [fontFamily] - the family the user chose; falls back to the
 *   Hebrew-capable default below when unset, so callers may pass undefined
 * @param {string} text       - the element's current content
 * @returns {string} the family to render and embed
 */
export function resolveFontFamily(fontFamily, text) {
  const family = fontFamily || HEBREW_FALLBACK_TEXT;
  if (!containsHebrew(text) || supportsHebrew(family)) return family;
  return HANDWRITING_FONTS.includes(family) ? HEBREW_FALLBACK_HANDWRITING : HEBREW_FALLBACK_TEXT;
}
