// @ts-check
import { verticalEdges, horizontalRules, ruledCoverage } from './inkEdges.js';

/**
 * The ruled-grid half of the cell walk (split from `formCells.js`, ARCH-107): rebuilds the page grid
 * from ink and reports every closed cell, in PDF points (origin bottom-left, y up). Pure geometry, no
 * text: `formCells.js` decides what each cell is.
 *
 * Shapes shared with `formCells.js`:
 * @typedef {{x: number, y0: number, y1: number}} VerticalEdge
 * @typedef {{y: number, x0: number, x1: number}} HorizontalRule
 * @typedef {{left: number, right: number, bottom: number, top: number}} Bounds
 * @typedef {Bounds & {width: number, height: number}} CellBox
 * @typedef {CellBox & {closure: number, narrow: boolean, lone: boolean, square: boolean,
 *   floorTicked: boolean, nextRuleY: number | null, rowLeft?: number, rowRight?: number,
 *   tickDivided?: boolean, stackRise?: number}} ClosedCell
 */


/** Positions within this many points are the same wall (mirrors formGrid.js's PITCH_TOLERANCE). */
export const POS_TOLERANCE = 1.0;
/** How far a wall may sit from a row band and still count as bounding it. */
const BAND_TOLERANCE = 1.5;
/** How much of a side must be ruled/edged for that side to count as closed. */
const CLOSED_EDGE_COVERAGE = 0.7;
/** Row bands outside this height range are not a single writable line/box. */
const MIN_ROW_HEIGHT = 6;
const MAX_ROW_HEIGHT = 45;
/**
 * A band may span at most this many page-wide rule heights between its top and
 * bottom. The cap keeps a dense hatch (hundreds of rules at a 1pt pitch) from
 * pairing every height with every other.
 */
const MAX_HEIGHTS_BETWEEN = 12;
/** A column narrower than this is a rule gap, not a cell anyone could write in. */
const MIN_CELL_WIDTH = 15;

/**
 * A ruled cell narrower than `MIN_CELL_WIDTH` is a tick target, not a place to
 * write a word. What keeps this lower floor from admitting every incidental gap
 * is the column: a tick cell belongs to a printed column that repeats down the
 * table, while the gaps between a leader line's dashes never recur at one x.
 */
const MIN_TICK_CELL_WIDTH = 6;
/**
 * A vertical that does not span a band still counts as a column edge when it
 * starts at the band's floor rule and rises this fraction of the band's height:
 * a tick dividing the writing strip above an underline (FORM-26). 0.3 sits
 * between the real ticks and the tallest floor-anchored noise (docs/sign-form-fields.md).
 */
const MIN_FLOOR_RISE_FRACTION = 0.3;


// Ink normalization: `inkEdges.js` called with the two options this file needs.
/**
 * A fill with no stroke, larger than any row both ways, is a tinted background
 * panel: its sides are where the tint stops, not walls, and would split every
 * field they cross. Passed to `inkEdges.js` as `excludeRect`.
 */
function isBackgroundPanel(/** @type {object} */ panel) {
  // `inkEdges.js` hands over the ink walk's rect, typed there only as `object`.
  const rect = /** @type {{filled: boolean, stroked: boolean, width: number, height: number}} */ (panel);
  return rect.filled && !rect.stroked && rect.width > MAX_ROW_HEIGHT && rect.height > MAX_ROW_HEIGHT;
}

/**
 * @param {number[]} values
 * @param {number} tolerance
 */
function distinctPositions(values, tolerance) {
  const sorted = [...values].sort((a, b) => a - b);
  const out = [];
  for (const value of sorted) {
    if (out.length === 0 || value - out[out.length - 1] > tolerance) out.push(value);
  }
  return out;
}

/**
 * Share of `[bottom, top]` at position `x` that vertical ink actually covers.
 *
 * @param {VerticalEdge[]} edges
 * @param {number} x
 * @param {number} bottomY
 * @param {number} topY
 */
function verticalCoverage(edges, x, bottomY, topY) {
  const span = topY - bottomY;
  if (!(span > 0)) return 0;
  const parts = edges
    .filter((edge) => Math.abs(edge.x - x) <= BAND_TOLERANCE)
    .map((edge) => /** @type {[number, number]} */ ([Math.max(edge.y0, bottomY), Math.min(edge.y1, topY)]))
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let cursor = bottomY;
  for (const [from, to] of parts) {
    if (to <= cursor) continue;
    covered += to - Math.max(from, cursor);
    cursor = to;
  }
  return covered / span;
}

/**
 * The x-stretch a column shares with its band's top and bottom rules: each
 * height's rules are chained outward from the column while they touch, and the
 * two reaches are intersected. A lone square has a span the width of the
 * square; a table's page-wide rules give a page-wide span.
 *
 * @param {HorizontalRule[]} topRules
 * @param {HorizontalRule[]} bottomRules
 * @param {number} left
 * @param {number} right
 * @returns {[number, number]}
 */
function bandSpan(topRules, bottomRules, left, right) {
  /**
   * @param {HorizontalRule[]} rules
   * @returns {[number, number]}
   */
  const reach = (rules) => {
    let from = left;
    let to = right;
    for (let grew = true; grew;) {
      grew = false;
      for (const rule of rules) {
        if (rule.x0 < from && rule.x1 >= from - POS_TOLERANCE) { from = rule.x0; grew = true; }
        if (rule.x1 > to && rule.x0 <= to + POS_TOLERANCE) { to = rule.x1; grew = true; }
      }
    }
    return [from, to];
  };
  const [topFrom, topTo] = reach(topRules);
  const [bottomFrom, bottomTo] = reach(bottomRules);
  return [Math.max(topFrom, bottomFrom), Math.min(topTo, bottomTo)];
}

/**
 * A closed square: small, and as wide as it is tall. A tick box is its own
 * evidence, so it is admitted without the lone-box caption test (FORM-10).
 */
const MAX_SQUARE_SIDE = 20;
const SQUARE_ASPECT = 0.75;
/**
 * @param {number} width
 * @param {number} height
 */
function isSquare(width, height) {
  const side = Math.max(width, height);
  return side <= MAX_SQUARE_SIDE && Math.min(width, height) / side >= SQUARE_ASPECT;
}

/**
 * One row band: a top and a bottom height, the rules at and near them, the rules
 * that veto a column inside it, and the vertical edges that reach it.
 * @typedef {{top: number, bottom: number, height: number,
 *   topRules: HorizontalRule[], bottomRules: HorizontalRule[],
 *   topNear: HorizontalRule[], bottomNear: HorizontalRule[],
 *   inside: HorizontalRule[], outside: HorizontalRule[], edges: VerticalEdge[]}} Band
 */

/**
 * Rules that veto a column of the band between heights `i` and `k`: those in
 * between for any column they reach, those just outside for one they cross
 * (index neighbours, `ys` is sorted). A band with no height between has none.
 * @param {number[]} ys
 * @param {HorizontalRule[][]} rulesAt
 * @param {number} i
 * @param {number} k
 * @returns {{inside: HorizontalRule[], outside: HorizontalRule[]}}
 */
export function vetoRules(ys, rulesAt, i, k) {
  const top = ys[i];
  const bottom = ys[k];
  /** @type {HorizontalRule[]} */
  const inside = [];
  /** @type {HorizontalRule[]} */
  const outside = [];
  if (k - i > 1) {
    const ownEdge = (/** @type {HorizontalRule} */ rule) => Math.abs(rule.y - top) <= POS_TOLERANCE
      || Math.abs(rule.y - bottom) <= POS_TOLERANCE;
    const collect = (/** @type {HorizontalRule[]} */ list, /** @type {number} */ m) => { for (const rule of rulesAt[m]) if (!ownEdge(rule)) list.push(rule); };
    for (let m = i + 1; m < k; m += 1) collect(inside, m);
    for (let m = i - 1; m >= 0 && ys[m] - top <= BAND_TOLERANCE; m -= 1) collect(outside, m);
    for (let m = k + 1; m < ys.length && bottom - ys[m] <= BAND_TOLERANCE; m += 1) collect(outside, m);
  }
  return { inside, outside };
}

/**
 * Every plausible row band, top-down: each pair of heights that is tall enough,
 * not too tall, and not separated by too many other heights.
 * @param {number[]} ys heights, sorted descending
 * @param {HorizontalRule[][]} nearRules per height: rules close enough to bound a band there
 * @param {HorizontalRule[][]} rulesAt per height: the rules actually at it
 * @param {VerticalEdge[]} edges
 * @returns {Band[]}
 */
export function findBands(ys, nearRules, rulesAt, edges) {
  /** @type {Band[]} */
  const bands = [];
  for (let i = 0; i < ys.length - 1; i += 1) {
    const top = ys[i];
    for (let k = i + 1; k < ys.length; k += 1) {
      const bottom = ys[k];
      const height = top - bottom;
      if (height > MAX_ROW_HEIGHT || k - i - 1 > MAX_HEIGHTS_BETWEEN) break;
      if (height < MIN_ROW_HEIGHT) continue;
      const { inside, outside } = vetoRules(ys, rulesAt, i, k);
      bands.push({
        top, bottom, height,
        topRules: rulesAt[i], bottomRules: rulesAt[k], topNear: nearRules[i], bottomNear: nearRules[k],
        inside, outside,
        edges: edges.filter((edge) => edge.y1 > bottom - BAND_TOLERANCE && edge.y0 < top + BAND_TOLERANCE),
      });
    }
  }
  return bands;
}

/**
 * A column edge spans the whole band.
 * @param {VerticalEdge} edge
 * @param {Band} band
 */
export function spansBand(edge, band) {
  return edge.y1 >= band.top - BAND_TOLERANCE && edge.y0 <= band.bottom + BAND_TOLERANCE;
}

/**
 * Or it is a floor tick: it stands on the band's floor and rises far enough (MIN_FLOOR_RISE_FRACTION).
 * @param {VerticalEdge} edge
 * @param {Band} band
 */
export function risesFromFloor(edge, band) {
  return edge.y0 <= band.bottom + BAND_TOLERANCE
    && Math.min(edge.y1, band.top) - band.bottom >= MIN_FLOOR_RISE_FRACTION * band.height;
}

/**
 * The x positions of the band's edges that pass `keep`, merged within POS_TOLERANCE, left to right.
 * @param {Band} band
 * @param {(edge: VerticalEdge) => boolean} keep
 * @returns {number[]}
 */
function edgeXs(band, keep) {
  return distinctPositions(band.edges.filter(keep).map((edge) => edge.x), POS_TOLERANCE)
    .sort((a, b) => a - b);
}

// A box with no interior wall is either a panel or a lone labelled field;
// geometry cannot tell them apart, so it is kept, tagged `lone`, and
// `detectCellCandidates` decides by its own text. "Own" walls are those
// inside the band's own x-span (`bandSpan`), not elsewhere on the page (FORM-10).
/**
 * @param {Band} band
 * @param {number[]} walls
 * @param {number} left
 * @param {number} right
 */
function isLone(band, walls, left, right) {
  const [spanLeft, spanRight] = bandSpan(band.topRules, band.bottomRules, left, right);
  return walls.filter((x) => x >= spanLeft - POS_TOLERANCE && x <= spanRight + POS_TOLERANCE).length === 2;
}

// The next rule below the floor that crosses the column bounds a
// floor-ticked column's caption (`captionBelowFloor`); scoped to the
// column so an unrelated box's rule lower down cannot close the strip.
/**
 * @param {HorizontalRule[]} rules every rule on the page
 * @param {number} bottom
 * @param {number} left
 * @param {number} right
 * @returns {number | null}
 */
function nextRuleBelow(rules, bottom, left, right) {
  return rules.reduce(
    (/** @type {number | null} */ best, rule) => (rule.y < bottom - POS_TOLERANCE && rule.x0 < right && rule.x1 > left
      && (best === null || rule.y > best) ? rule.y : best),
    null,
  );
}

/**
 * The closed cell between two walls of a band, or null when it fails any gate.
 * @param {number} left
 * @param {number} right
 * @param {Band} band
 * @param {number[]} loneWalls the walls `lone` is judged against
 * @param {HorizontalRule[]} rules every rule on the page
 * @returns {ClosedCell | null}
 */
export function closedColumn(left, right, band, loneWalls, rules) {
  const { top, bottom, height, edges } = band;
  const width = right - left;
  if (width < MIN_TICK_CELL_WIDTH) return null;
  const crosses = (/** @type {HorizontalRule} */ rule) => rule.x0 < right && rule.x1 > left;
  const reaches = (/** @type {HorizontalRule} */ rule) => rule.x0 < right + POS_TOLERANCE && rule.x1 > left - POS_TOLERANCE;
  if (!band.topRules.some(crosses) || !band.bottomRules.some(crosses)) return null;
  if (band.inside.some(reaches) || band.outside.some(crosses)) return null;

  const topCoverage = ruledCoverage(band.topNear, top, left, right, BAND_TOLERANCE);
  const bottomCoverage = ruledCoverage(band.bottomNear, bottom, left, right, BAND_TOLERANCE);
  if (topCoverage < CLOSED_EDGE_COVERAGE || bottomCoverage < CLOSED_EDGE_COVERAGE) return null;

  const leftCoverage = verticalCoverage(edges, left, bottom, top);
  const rightCoverage = verticalCoverage(edges, right, bottom, top);
  // A floor tick is only ever partial-height, so it is exempt from the
  // full-height coverage a wall needs; `closure` still carries its real,
  // lower number.
  const isFloorTick = (/** @type {number} */ x) => edges.some(
    (edge) => Math.abs(edge.x - x) <= POS_TOLERANCE && risesFromFloor(edge, band),
  );
  if ((leftCoverage < CLOSED_EDGE_COVERAGE && !isFloorTick(left))
    || (rightCoverage < CLOSED_EDGE_COVERAGE && !isFloorTick(right))) return null;

  const closure = Math.min(topCoverage, bottomCoverage, leftCoverage, rightCoverage);
  // Tied to the same coverage gate as the exemption above: a real wall
  // that falls a point short of the band's top still rises past
  // `MIN_FLOOR_RISE_FRACTION`, and must stay a wall (FORM-26 part A).
  const floorTicked = (leftCoverage < CLOSED_EDGE_COVERAGE && isFloorTick(left))
    || (rightCoverage < CLOSED_EDGE_COVERAGE && isFloorTick(right));
  return {
    left, right, bottom, top, width, height, closure, narrow: width < MIN_CELL_WIDTH,
    lone: isLone(band, loneWalls, left, right), square: isSquare(width, height),
    floorTicked, nextRuleY: floorTicked ? nextRuleBelow(rules, bottom, left, right) : null,
  };
}

/**
 * The closed cells between each neighbouring pair of `walls`, left to right.
 * Collected before any is emitted so a floor-ticked group's span can be
 * measured across only the columns it contains, not the band's full width.
 * @param {number[]} walls
 * @param {Band} band
 * @param {number[]} loneWalls the walls `lone` is judged against
 * @param {HorizontalRule[]} rules every rule on the page
 * @returns {ClosedCell[]}
 */
export function columnsBetween(walls, band, loneWalls, rules) {
  /** @type {ClosedCell[]} */
  const columns = [];
  for (let j = 0; j < walls.length - 1; j += 1) {
    const column = closedColumn(walls[j], walls[j + 1], band, loneWalls, rules);
    if (column !== null) columns.push(column);
  }
  return columns;
}

/**
 * Floor-ticked columns learn their group's own span (read once in
 * `detectCellCandidates`: a row's caption sits over one column of the group,
 * not centred over it, FORM-26 part A), and the band's wall columns that hold
 * one are added, tagged `tickDivided`. Ticks divide a column only into
 * captioned fields (FORM-27). An open comb's teeth stand on the same floor and
 * rise as far, and would chop the column into captionless slivers that get
 * dropped, taking the printed cell with them; so the wall column is built too
 * and kept unless a captioned floor-ticked column inside it survives.
 * Sets `rowLeft`/`rowRight` on the floor-ticked cells it is given.
 * @param {ClosedCell[]} bandCells the band's columns, as `columnsBetween` built them
 * @param {Band} band
 * @param {number[]} xs the walls the band's cells were built between
 * @param {HorizontalRule[]} rules every rule on the page
 * @returns {ClosedCell[]} `bandCells` followed by the wall columns that hold a tick
 */
export function applyFloorTicks(bandCells, band, xs, rules) {
  const ticked = bandCells.filter((c) => c.floorTicked);
  if (ticked.length === 0) return bandCells;
  const rowLeft = Math.min(...ticked.map((c) => c.left));
  const rowRight = Math.max(...ticked.map((c) => c.right));
  for (const c of ticked) { c.rowLeft = rowLeft; c.rowRight = rowRight; }
  const holdsTicked = (/** @type {ClosedCell} */ column) => ticked.some(
    (c) => c.left >= column.left - POS_TOLERANCE && c.right <= column.right + POS_TOLERANCE,
  );
  const walls = edgeXs(band, (edge) => spansBand(edge, band));
  const tickDivided = columnsBetween(walls, band, xs, rules)
    .filter(holdsTicked)
    .map((column) => ({ ...column, lone: isLone(band, walls, column.left, column.right), tickDivided: true }));
  return [...bandCells, ...tickDivided];
}

/**
 * The walls a band's cells are built between: edges that span it or are floor ticks.
 * @param {Band} band
 * @returns {number[]}
 */
function bandXs(band) {
  return edgeXs(band, (edge) => spansBand(edge, band) || risesFromFloor(edge, band));
}

/**
 * Closed cells on one page, in PDF points (origin bottom-left, y up).
 *
 * Rows are scoped per column: a cell's top and bottom are the nearest rules
 * that cross its own column, so a stray rule from a box beside it cannot split
 * a row it never touches. Every test looks at the rules *at* a height (within
 * POS_TOLERANCE), not at the wider BAND_TOLERANCE window of `ruledCoverage`:
 * - The band's own top and bottom must each be crossed by a rule at that
 *   height, or a height just inside the row closes other columns short.
 * - A rule in between vetoes a column it crosses or ends against (an ending
 *   marks a junction with a smaller box beside the column).
 * - A rule at a height just outside the band vetoes a column it crosses, not
 *   one it merely ends against (an ordinary misaligned row).
 * - A rule within POS_TOLERANCE of the band's own top or bottom is that edge.
 *
 * @param {{verticals: VerticalEdge[], horizontals: HorizontalRule[], rects: Array<object>}} ink
 * @returns {ClosedCell[]}
 */
export function buildClosedCells(ink) {
  const edges = verticalEdges(ink, { excludeRect: isBackgroundPanel });
  const rules = horizontalRules(ink, { excludeRect: isBackgroundPanel, includeRectSides: true });
  const ys = distinctPositions(rules.map((r) => r.y), POS_TOLERANCE).sort((a, b) => b - a);
  // Per height: the rules close enough to bound a band there, and the rules actually at it.
  const nearRules = ys.map((y) => rules.filter((rule) => Math.abs(rule.y - y) <= BAND_TOLERANCE));
  const rulesAt = nearRules.map((near, m) => near.filter((rule) => Math.abs(rule.y - ys[m]) <= POS_TOLERANCE));

  return findBands(ys, nearRules, rulesAt, edges).flatMap((band) => {
    const xs = bandXs(band);
    if (xs.length < 2) return [];
    return applyFloorTicks(columnsBetween(xs, band, xs, rules), band, xs, rules);
  });
}
