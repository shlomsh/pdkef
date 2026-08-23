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

export const HANDWRITING_FONTS = ['Caveat', 'Dancing Script', 'Great Vibes', 'Gveret Levin', 'Pacifico', 'Sacramento'];
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
  Sacramento: { ascent: 0.930, descent: 0.529 },
};

// Slack on top of the computed overhang: the metrics are the font's design
// box, but a real string can still paint past it - a flourish like Gveret
// Levin's ץ tail clipped at the previous, thinner slack (0.02em). Costs
// nothing on fonts that don't need it - they're floored at
// TEXT_BOX_PADDING_EM below regardless.
const VERTICAL_METRICS_SLACK_EM = 0.06;

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
export const HEBREW_CAPABLE_FONTS = ['Arimo', 'Tinos', 'Cousine', 'Assistant', 'Heebo', 'Gveret Levin'];

/**
 * Families we used to ship, mapped to what replaces them.
 *
 * **Dropping a font is not the same as deleting its name.** Drafts persist for
 * 14 days and carry the family the user picked, so a retired name keeps
 * arriving after the files are gone. Left unmapped it produces exactly the bug
 * this whole area exists to close: the editor falls back per character to some
 * system font while the export, unable to fetch the missing TTF, falls back to
 * Arimo, so the screen and the download disagree again.
 *
 * Mapping is applied first thing in `resolveFontFamily`, so both sides land on
 * the same face without either of them needing to know the font ever existed.
 *
 * **Playpen Sans Hebrew, dropped 2026-08-23.** A handwriting face carrying
 * `calt`, which fontkit and HarfBuzz resolve differently, so the export drew
 * different letterforms than the editor showed - 22 of 25 realistic strings
 * disagreed, and 2.304px on two words with unhinted metrics. No pipeline stage
 * fixes a divergence inside the shaper, and the alternative was bundling a
 * second shaper for one decorative font. Replaced by Gveret Levin, the other
 * bundled handwriting face with Hebrew coverage, so a restored draft keeps its
 * handwritten character. Full reasoning in
 * docs/hebrew-text-shaping-export.md.
 */
export const RETIRED_FONTS = {
  'Playpen Sans Hebrew': 'Gveret Levin',
};

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
 * A family we have since retired (see RETIRED_FONTS) is mapped to its
 * replacement before anything else happens, so a draft saved against a font
 * that no longer ships still renders identically on both sides.
 *
 * @param {string} [fontFamily] - the family the user chose; falls back to the
 *   Hebrew-capable default below when unset, so callers may pass undefined
 * @param {string} text       - the element's current content
 * @returns {string} the family to render and embed
 */
export function resolveFontFamily(fontFamily, text) {
  // Retired families first, so everything below sees only a family we ship.
  const requested = RETIRED_FONTS[fontFamily] || fontFamily;
  const family = requested || HEBREW_FALLBACK_TEXT;
  if (!containsHebrew(text) || supportsHebrew(family)) return family;
  return HANDWRITING_FONTS.includes(family) ? HEBREW_FALLBACK_HANDWRITING : HEBREW_FALLBACK_TEXT;
}
