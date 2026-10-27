/**
 * The edge/rule builders `formGrid.js` and `formCells.js` each used to carry a private copy of
 * (FORM-24). Both fold the same `pageInk.js` output - `verticals`/`horizontals` segments plus
 * `rects` - into the same two normalized shapes: a vertical edge `{x, y0, y1}` and a horizontal
 * rule `{y, x0, x1}`. A thin rect (a producer with no stroke draws a rule as a very short filled
 * rect) always folds in as one edge/rule down its middle; that part never differed. Two things did,
 * and they are now named options rather than two copies that could silently drift apart:
 *
 * - **`excludeRect`**: `formCells.js` skips a large unstroked fill before folding it in at all
 *   (`isBackgroundPanel` - a page-tinting panel, not a box wall; see its own doc comment there for
 *   why). `formGrid.js`'s comb/checkbox detector never had a background-panel case in its evidence
 *   forms, so it passes no predicate and every rect is a candidate, exactly as before.
 * - **`includeRectSides`** (horizontal rules only): a rect with real area (not just thin) draws two
 *   *vertical* side walls either way - both builders always fold those in. Only `formCells.js` also
 *   folds such a rect's top and bottom in as *horizontal* rules, because a closed table cell is
 *   often one filled box rather than four separate strokes, and `buildClosedCells` needs that box's
 *   top/bottom to close a row the same way a ruled one does. `formGrid.js`'s comb reader never took
 *   a full rect's top/bottom as a rule (a comb's "boxed" test reads only what `ruledCoverage` is
 *   given), so it passes `includeRectSides: false` and keeps that narrower reading.
 *
 * `THIN_INK` and the coverage tolerance are each declared once here; a caller passes its own
 * tolerance to `ruledCoverage` explicitly (both existing call sites already had one, both `1.5`) so
 * a change to one file's tolerance is a visible decision at its call site, not a silent edit to a
 * shared default.
 */

/** A rect narrower (or shorter) than this on one axis is a drawn rule, not a box wall (PDF points). */
export const THIN_INK = 1.5;

/** `ruledCoverage`'s default y-tolerance when a caller does not pass its own (PDF points). */
export const DEFAULT_COVERAGE_TOLERANCE = 1.5;

/**
 * Every vertical edge the page draws, normalized to `{x, y0, y1}`.
 *
 * A thin rect is one edge down its middle - that is how a producer with no stroke draws a rule. A
 * rect with real area contributes its two side walls.
 *
 * @param {{verticals: Array<{x: number, y0: number, y1: number}>, rects: Array}} ink
 * @param {{thinInk?: number, excludeRect?: (rect: object) => boolean}} [options]
 */
export function verticalEdges({ verticals, rects }, { thinInk = THIN_INK, excludeRect } = {}) {
  const edges = verticals.map((edge) => ({ ...edge }));
  for (const rect of rects) {
    if (excludeRect?.(rect)) continue;
    if (rect.width <= thinInk && rect.height > thinInk) {
      edges.push({ x: rect.x + rect.width / 2, y0: rect.y, y1: rect.y + rect.height });
    } else if (rect.width > thinInk && rect.height > thinInk) {
      edges.push({ x: rect.x, y0: rect.y, y1: rect.y + rect.height });
      edges.push({ x: rect.x + rect.width, y0: rect.y, y1: rect.y + rect.height });
    }
  }
  return edges;
}

/**
 * Every horizontal rule the page draws, normalized to `{y, x0, x1}`.
 *
 * A producer with no stroke draws a rule as a very short filled rect, exactly as it draws a
 * vertical one, so both sources are folded together here. `includeRectSides` additionally folds a
 * full rect's own top and bottom in as rules - see the module doc comment for who wants that and why.
 *
 * @param {{horizontals: Array<{y: number, x0: number, x1: number}>, rects: Array}} ink
 * @param {{thinInk?: number, excludeRect?: (rect: object) => boolean, includeRectSides?: boolean}} [options]
 */
export function horizontalRules(
  { horizontals, rects },
  { thinInk = THIN_INK, excludeRect, includeRectSides = false } = {},
) {
  const rules = horizontals.map((rule) => ({ ...rule }));
  for (const rect of rects) {
    if (excludeRect?.(rect)) continue;
    if (rect.height <= thinInk && rect.width > thinInk) {
      rules.push({ y: rect.y + rect.height / 2, x0: rect.x, x1: rect.x + rect.width });
    } else if (includeRectSides && rect.width > thinInk && rect.height > thinInk) {
      rules.push({ y: rect.y, x0: rect.x, x1: rect.x + rect.width });
      rules.push({ y: rect.y + rect.height, x0: rect.x, x1: rect.x + rect.width });
    }
  }
  return rules;
}

/**
 * The share of `[left, right]` that horizontal ink covers at height `y`.
 *
 * Measured as coverage rather than as one spanning rule because a table drawn cell by cell rules
 * each cell separately.
 *
 * @param {Array<{y: number, x0: number, x1: number}>} rules
 * @param {number} y
 * @param {number} left
 * @param {number} right
 * @param {number} [tolerance] how far a rule's `y` may sit from `y` and still count (PDF points).
 */
export function ruledCoverage(rules, y, left, right, tolerance = DEFAULT_COVERAGE_TOLERANCE) {
  const span = right - left;
  if (!(span > 0)) return 0;
  const parts = rules
    .filter((rule) => Math.abs(rule.y - y) <= tolerance)
    .map((rule) => [Math.max(rule.x0, left), Math.min(rule.x1, right)])
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let cursor = left;
  for (const [from, to] of parts) {
    if (to <= cursor) continue;
    covered += to - Math.max(from, cursor);
    cursor = to;
  }
  return covered / span;
}
