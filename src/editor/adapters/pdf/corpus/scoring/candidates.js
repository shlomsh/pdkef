/**
 * Detector regions as the scoring contract's `CandidateField` shape.
 *
 * `scripts/spike/mobi-10/CONTRACT.md` is the contract and predates this: every
 * source in the MOBI-10 spike emitted it, the two committed ground-truth files
 * are written against it, and `score.mjs` matches in it. This is the product
 * detector becoming one more source, so its output can be scored the same way.
 *
 * The only real work is the coordinate change, and it is small because both
 * sides already measure from the top left: the editor stores page percentages
 * (0..100) and the contract wants page fractions (0..1).
 *
 * Kinds are mapped, not invented. The detector's vocabulary (`comb`, `text`,
 * `date`, `table-cell`, `checkbox`, `signature`) is a subset of the
 * contract's, and anything it does not recognise stays `unknown` rather than
 * being guessed at - `unknown` matches any target kind, so guessing would
 * inflate the score.
 */

import { DETECTOR_FIELD_KINDS } from '../../fieldTypes.ts';

/**
 * Detector kind -> contract kind, identity by construction: every kind a
 * detector can produce (`fieldTypes.ts`'s `DETECTOR_FIELD_KINDS`, FORM-23) is
 * already a contract kind, so there is nothing to remap, only to recognise.
 * A kind absent from this (an entry `DETECTOR_FIELD_KINDS` does not carry,
 * which today is none) falls through to `fallbackKind` below and is reported
 * `unknown`.
 */
const KINDS = Object.fromEntries(DETECTOR_FIELD_KINDS.map((kind) => [kind, kind]));

/**
 * @param {{left: number, top: number, width: number, height: number}} region
 * @returns {{x: number, y: number, width: number, height: number}} page fractions
 */
const toBounds = ({ left, top, width, height }) => ({
  x: left / 100,
  y: top / 100,
  width: width / 100,
  height: height / 100,
});

/**
 * @param {{combs: Array, cells: Array, checkboxes: Array}} detected one page
 * @param {number} pageIndex
 * @returns {Array<object>} CandidateField[], in comb / cell / checkbox order
 */
export function toCandidates(detected, pageIndex = 0) {
  let serial = 0;
  const candidate = (region, fallbackKind) => ({
    id: `prod-${String((serial += 1)).padStart(4, '0')}`,
    pageIndex,
    bounds: toBounds(region),
    kind: KINDS[region.kind] ?? fallbackKind,
    required: 'unknown',
    // The comb detector's own 0.8 where the region carries nothing; a cell
    // brings `formCells.js`'s own honest value, which caps below it.
    confidence: region.confidence ?? 0.8,
    source: 'combined-heuristic',
    ...(region.cells ? { cells: region.cells } : {}),
  });
  return [
    ...detected.combs.map((region) => candidate(region, 'comb')),
    ...detected.cells.map((region) => candidate(region, 'text')),
    ...detected.checkboxes.map((region) => candidate(region, 'checkbox')),
  ];
}
