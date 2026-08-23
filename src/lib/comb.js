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

/**
 * True for a text element currently laid out as a comb. Derived from `width`
 * rather than a separate flag: dragging a side handle is the only way `width`
 * ever gets set on text, and clearing it (a font-size change - see
 * useElementResize.js/ElementToolbar.tsx) is the only way it's ever unset, so
 * the two are always in lockstep. A standalone boolean would just be a second
 * place for that same fact to go stale.
 */
export function isComb(element) {
  return element?.type === 'text' && !!element.width;
}

/**
 * The characters a comb lays out: newlines collapse away, because a comb is a
 * single row of boxes and a second line has nowhere to go.
 *
 * Split on grapheme clusters (a base character plus any combining marks that
 * follow it), not code points - splitting on code points strands nikud in a
 * cell of its own instead of the letter it points, which is wrong even before
 * the glyph is positioned. A plain regex rather than `Intl.Segmenter`: it
 * needs no availability check, and `\p{M}` is exactly the category in
 * question. See docs/hebrew-text-shaping-export.md.
 *
 * The `\p{M}+` alternative comes first so a combining mark with no preceding
 * base character (e.g. a comb field typed starting with a nikud mark) still
 * becomes its own cluster instead of being dropped: `\P{M}\p{M}*` alone
 * requires a base before any mark, so at the very start of the string it
 * matches nothing at position 0 and the regex engine skips straight past the
 * orphan mark to the next real base character, silently losing it. That is
 * character *loss*, not just misplacement - worse, and this is the fix for it.
 */
export function combCharacters(element) {
  const text = (element?.text || '').replace(/\r?\n/g, '');
  return Array.from(text.matchAll(/\p{M}+|\P{M}\p{M}*/gu), (m) => m[0]);
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
 *
 * `isRtl` mirrors the fraction: character 0 sits in the *last* (rightmost)
 * cell instead of the first. Plain RTL text in this editor already anchors
 * its fixed edge on the right and grows leftward as more is typed (see the
 * usesRtlAnchoring view flag), so the first character typed stays at that
 * fixed right edge; a comb has no growing edge to anchor to (the span is
 * fixed), but the reading order still has to match - the first character
 * belongs at the right, not wherever cell 0 happens to be physically.
 */
export function combCellCenterFraction(index, cellCount, isRtl = false) {
  const fraction = (index + 0.5) / cellCount;
  return isRtl ? 1 - fraction : fraction;
}

/**
 * The laid-out cells: `char` is empty for a cell the text does not reach, which
 * is what a form with trailing blank boxes looks like.
 */
export function combLayout(element, isRtl = false) {
  const characters = combCharacters(element);
  const cellCount = combCellCount(element);
  return Array.from({ length: cellCount }, (_, index) => ({
    index,
    char: characters[index] || '',
    centerFraction: combCellCenterFraction(index, cellCount, isRtl),
  }));
}
