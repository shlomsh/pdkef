import { MAX_COMB_CELLS } from '../constants/signGeometry.js';

/**
 * Comb layout: one character per cell, centred, across an explicit width.
 *
 * Pre-printed forms (an ID field, a date field) rule the paper into boxes whose
 * pitch was decided before anyone chose a font, so laying the characters out by
 * font advance can never line up - changing the font size scales the glyphs and
 * the gaps together. A comb ignores advance widths entirely and puts character
 * `i` at the centre of cell `i`.
 *
 * Cell *centres* are the target, not the outer edges. Spreading text to fill the
 * width instead pins the first and last glyph edges to the box edges, which is
 * off by half a cell minus half a glyph at each end: the middle looks right and
 * the ends drift out of their boxes.
 *
 * This module is the single owner of that math so the editor and the exporter
 * agree exactly, the same way `fonts.js` owns family resolution for both.
 */

/** True for a text element currently laid out as a comb. */
export function isComb(element) {
  return element?.type === 'text' && !!element.comb;
}

/**
 * The characters a comb lays out: newlines collapse away, because a comb is a
 * single row of boxes and a second line has nowhere to go.
 */
export function combCharacters(element) {
  return Array.from((element?.text || '').replace(/\r?\n/g, ''));
}

/**
 * How many cells the span is divided into. An explicit `combCells` wins; absent,
 * the count follows the text, which is what a field with exactly as many boxes
 * as characters wants and needs no input from the user.
 */
export function combCellCount(element) {
  const explicit = element?.combCells;
  if (explicit) return Math.max(1, Math.min(MAX_COMB_CELLS, Math.round(explicit)));
  return Math.max(1, combCharacters(element).length);
}

/**
 * Centre of cell `index` as a fraction of the comb's width. Characters past the
 * last cell have no box to sit in, so callers stop at `combCellCount`.
 */
export function combCellCenterFraction(index, cellCount) {
  return (index + 0.5) / cellCount;
}

/**
 * The laid-out cells: `char` is empty for a cell the text does not reach, which
 * is what a form with trailing blank boxes looks like.
 */
export function combLayout(element) {
  const characters = combCharacters(element);
  const cellCount = combCellCount(element);
  return Array.from({ length: cellCount }, (_, index) => ({
    index,
    char: characters[index] || '',
    centerFraction: combCellCenterFraction(index, cellCount),
  }));
}
