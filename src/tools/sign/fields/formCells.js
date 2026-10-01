// @ts-check
import { createPageGeometry, pagePercentToPdfPoint, toPagePercentBox } from '../../../editor/geometry/coords.ts';
import { collectPageInk, pageCropBox } from './pageInk.js';
import { verticalEdges, horizontalRules, ruledCoverage } from './inkEdges.js';

/**
 * Shapes shared by the cell walk below, all in PDF points (origin bottom-left, y up).
 * @typedef {{x: number, y0: number, y1: number}} VerticalEdge
 * @typedef {{y: number, x0: number, x1: number}} HorizontalRule
 * @typedef {{str: string, x0: number, x1: number, y0: number, y1: number}} TextPoints
 * @typedef {{left: number, right: number, bottom: number, top: number}} Bounds
 * @typedef {Bounds & {width: number, height: number}} CellBox
 * @typedef {CellBox & {closure: number, narrow: boolean, lone: boolean, square: boolean,
 *   floorTicked: boolean, nextRuleY: number | null, rowLeft?: number, rowRight?: number,
 *   tickDivided?: boolean, stackRise?: number}} ClosedCell
 * @typedef {{bounds: PercentBox, enclosureBounds: PercentBox | undefined,
 *   writableBounds: PercentBox | undefined, cell: ClosedCell,
 *   kind: import('./fieldTypes.ts').DetectorFieldKind, label: string | undefined,
 *   ownTextCount: number, coverage: number, closure: number}} ResolvedCell
 */

/**
 * Closed table/box cells from vector ink (`pageInk.js`), cross-referenced with
 * page text for labels, that `formGrid.js`'s comb/checkbox detector leaves
 * alone (ported from the MOBI-10 spike). It reports every closed cell it finds,
 * including one drawn around a comb; `fieldRegions.js` reconciles the two.
 *
 * The page grid is rebuilt from ink through `inkEdges.js` (with `excludeRect`
 * and `includeRectSides`, see below), then each row band between horizontal
 * rules is walked column by column. A cell is kept only when real ink closes
 * all four sides above a coverage threshold; nothing is invented. Text decides
 * the rest: an empty cell, or one with a short label hugging the top or right
 * edge and enough blank left, is an input; heavy text coverage is an
 * explanatory box. The nearest text above in the column is the label. `חתימה`
 * makes a signature, `תאריך` or "/ /" a date, and a column recurring across 3+
 * bands makes a `table-cell`.
 *
 * Bounds are the strip a person writes in, not the ruled box: a caption inside
 * the box is not part of the field. Only the band carve (the strip under a
 * caption) is trusted for that. A side carve (a caption hugging the right
 * wall) is a much weaker guess at the extent, so the whole cell is published.
 *
 * Where the typed box goes is a different question. On an RTL form a box given
 * the cell's whole span starts its text at the right edge, the wall the caption
 * is printed against, so a side-carved cell also publishes the blank strip as
 * `writable` (`placeTextOnCell`). Printed separators are not a caption: a
 * person writes across `/  /`, so that cell keeps its whole span
 * (`isPrintedSeparators`, `typingStrip`). The ruled box rides along as
 * `enclosure`, and the whole-field questions (the hit test `cellRegionAt`, the
 * claim test in `fieldRegions.js`) are asked of it.
 *
 * Ink stays in PDF points; text runs and output are page-percent, through the
 * one transform in `geometry/coords.ts` (SIGN-05, ARCH-02). The measurements
 * behind the numbers are in docs/sign-form-fields.md.
 */

// Tunables, in PDF points (pageInk.js's native unit).
/** Positions within this many points are the same wall (mirrors formGrid.js's PITCH_TOLERANCE). */
const POS_TOLERANCE = 1.0;
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
const MIN_TICK_COLUMN_ROWS = 3;
/** Abutting cells in one column whose heights are within this ratio are rows of one stack. */
const STACKED_ROW_HEIGHT_RATIO = 0.8;
/**
 * A vertical that does not span a band still counts as a column edge when it
 * starts at the band's floor rule and rises this fraction of the band's height:
 * a tick dividing the writing strip above an underline (FORM-26). 0.3 sits
 * between the real ticks and the tallest floor-anchored noise (docs/sign-form-fields.md).
 */
const MIN_FLOOR_RISE_FRACTION = 0.3;
/** The blank remainder (after any hugging label) must be at least this large. */
const MIN_BLANK_WIDTH = 25;
const MIN_BLANK_HEIGHT = 8;
/** A cell whose own text covers more of its area than this is explanatory, not fillable. */
const FULL_TEXT_COVERAGE = 0.4;
/** How far above a cell to look for a column header, in points. */
const HEADER_SEARCH_HEIGHT = 220;

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
function buildClosedCells(ink) {
  const edges = verticalEdges(ink, { excludeRect: isBackgroundPanel });
  const rules = horizontalRules(ink, { excludeRect: isBackgroundPanel, includeRectSides: true });
  const ys = distinctPositions(rules.map((r) => r.y), POS_TOLERANCE).sort((a, b) => b - a);
  // Per height: the rules close enough to bound a band there, and the rules actually at it.
  const nearRules = ys.map((y) => rules.filter((rule) => Math.abs(rule.y - y) <= BAND_TOLERANCE));
  const rulesAt = nearRules.map((near, m) => near.filter((rule) => Math.abs(rule.y - ys[m]) <= POS_TOLERANCE));

  /** @type {ClosedCell[]} */
  const cells = [];
  for (let i = 0; i < ys.length - 1; i += 1) {
    const top = ys[i];
    for (let k = i + 1; k < ys.length; k += 1) {
      const bottom = ys[k];
      const height = top - bottom;
      if (height > MAX_ROW_HEIGHT || k - i - 1 > MAX_HEIGHTS_BETWEEN) break;
      if (height < MIN_ROW_HEIGHT) continue;

      // Rules that veto a column: those in between for any column they reach,
      // those just outside for one they cross (index neighbours, ys is sorted).
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

      const bandEdges = edges.filter((edge) => edge.y1 > bottom - BAND_TOLERANCE && edge.y0 < top + BAND_TOLERANCE);
      // A column edge spans the whole band, or is a floor tick (MIN_FLOOR_RISE_FRACTION).
      const spansBand = (/** @type {VerticalEdge} */ edge) => edge.y1 >= top - BAND_TOLERANCE && edge.y0 <= bottom + BAND_TOLERANCE;
      const risesFromFloor = (/** @type {VerticalEdge} */ edge) => edge.y0 <= bottom + BAND_TOLERANCE
        && Math.min(edge.y1, top) - bottom >= MIN_FLOOR_RISE_FRACTION * height;
      const edgeXs = (/** @type {(edge: VerticalEdge) => boolean} */ keep) => distinctPositions(bandEdges.filter(keep).map((edge) => edge.x), POS_TOLERANCE)
        .sort((a, b) => a - b);
      const xs = edgeXs((edge) => spansBand(edge) || risesFromFloor(edge));
      // A box with no interior wall is either a panel or a lone labelled field;
      // geometry cannot tell them apart, so it is kept, tagged `lone`, and
      // `detectCellCandidates` decides by its own text. "Own" walls are those
      // inside the band's own x-span (`bandSpan`), not elsewhere on the page (FORM-10).
      if (xs.length < 2) continue;
      const isLone = (/** @type {number[]} */ walls, /** @type {number} */ left, /** @type {number} */ right) => {
        const [spanLeft, spanRight] = bandSpan(rulesAt[i], rulesAt[k], left, right);
        return walls.filter((x) => x >= spanLeft - POS_TOLERANCE && x <= spanRight + POS_TOLERANCE).length === 2;
      };
      // The next rule below the floor that crosses the column bounds a
      // floor-ticked column's caption (`captionBelowFloor`); scoped to the
      // column so an unrelated box's rule lower down cannot close the strip.
      const nextRuleBelow = (/** @type {number} */ left, /** @type {number} */ right) => rules.reduce(
        (/** @type {number | null} */ best, rule) => (rule.y < bottom - POS_TOLERANCE && rule.x0 < right && rule.x1 > left
          && (best === null || rule.y > best) ? rule.y : best),
        null,
      );
      // Collected before pushing so a floor-ticked group's span can be measured
      // across only the columns it contains, not `xs`'s full width.
      const columnsBetween = (/** @type {number[]} */ walls) => {
        /** @type {ClosedCell[]} */
        const columns = [];
        for (let j = 0; j < walls.length - 1; j += 1) {
          const left = walls[j];
          const right = walls[j + 1];
          const width = right - left;
          if (width < MIN_TICK_CELL_WIDTH) continue;
          const crosses = (/** @type {HorizontalRule} */ rule) => rule.x0 < right && rule.x1 > left;
          const reaches = (/** @type {HorizontalRule} */ rule) => rule.x0 < right + POS_TOLERANCE && rule.x1 > left - POS_TOLERANCE;
          if (!rulesAt[i].some(crosses) || !rulesAt[k].some(crosses)) continue;
          if (inside.some(reaches) || outside.some(crosses)) continue;

          const topCoverage = ruledCoverage(nearRules[i], top, left, right, BAND_TOLERANCE);
          const bottomCoverage = ruledCoverage(nearRules[k], bottom, left, right, BAND_TOLERANCE);
          if (topCoverage < CLOSED_EDGE_COVERAGE || bottomCoverage < CLOSED_EDGE_COVERAGE) continue;

          const leftCoverage = verticalCoverage(bandEdges, left, bottom, top);
          const rightCoverage = verticalCoverage(bandEdges, right, bottom, top);
          // A floor tick is only ever partial-height, so it is exempt from the
          // full-height coverage a wall needs; `closure` still carries its real,
          // lower number.
          const isFloorTick = (/** @type {number} */ x) => bandEdges.some(
            (edge) => Math.abs(edge.x - x) <= POS_TOLERANCE && risesFromFloor(edge),
          );
          if ((leftCoverage < CLOSED_EDGE_COVERAGE && !isFloorTick(left))
            || (rightCoverage < CLOSED_EDGE_COVERAGE && !isFloorTick(right))) continue;

          const closure = Math.min(topCoverage, bottomCoverage, leftCoverage, rightCoverage);
          // Tied to the same coverage gate as the exemption above: a real wall
          // that falls a point short of the band's top still rises past
          // `MIN_FLOOR_RISE_FRACTION`, and must stay a wall (FORM-26 part A).
          const floorTicked = (leftCoverage < CLOSED_EDGE_COVERAGE && isFloorTick(left))
            || (rightCoverage < CLOSED_EDGE_COVERAGE && isFloorTick(right));
          columns.push({
            left, right, bottom, top, width, height, closure, narrow: width < MIN_CELL_WIDTH,
            lone: isLone(xs, left, right), square: isSquare(width, height),
            floorTicked, nextRuleY: floorTicked ? nextRuleBelow(left, right) : null,
          });
        }
        return columns;
      };
      const bandCells = columnsBetween(xs);
      // The group's own span, read once in `detectCellCandidates`: a row's caption
      // sits over one column of the group, not centred over it (FORM-26 part A).
      const ticked = bandCells.filter((c) => c.floorTicked);
      if (ticked.length > 0) {
        const rowLeft = Math.min(...ticked.map((c) => c.left));
        const rowRight = Math.max(...ticked.map((c) => c.right));
        for (const c of ticked) { c.rowLeft = rowLeft; c.rowRight = rowRight; }
        // Ticks divide a column only into captioned fields (FORM-27). An open
        // comb's teeth stand on the same floor and rise as far, and would chop
        // the column into captionless slivers that get dropped, taking the
        // printed cell with them. So the wall column is built too, tagged
        // `tickDivided`, and kept unless a captioned floor-ticked column inside it survives.
        const holdsTicked = (/** @type {ClosedCell} */ column) => ticked.some(
          (c) => c.left >= column.left - POS_TOLERANCE && c.right <= column.right + POS_TOLERANCE,
        );
        const walls = edgeXs(spansBand);
        for (const column of columnsBetween(walls)) {
          if (holdsTicked(column)) {
            bandCells.push({ ...column, lone: isLone(walls, column.left, column.right), tickDivided: true });
          }
        }
      }
      cells.push(...bandCells);
    }
  }
  return cells;
}

// Text: page-percent (y down) to PDF points (y up), through the one shared transform.
/**
 * @param {PageTextRun} item
 * @param {import('../../../editor/geometry/coords.ts').PageGeometry} geometry
 * @returns {TextPoints}
 */
function textItemToPoints(item, geometry) {
  const topLeft = pagePercentToPdfPoint({ x: item.left, y: item.top }, geometry);
  const bottomRight = pagePercentToPdfPoint({ x: item.left + item.width, y: item.top + item.height }, geometry);
  return {
    str: item.str,
    x0: Math.min(topLeft.x, bottomRight.x),
    x1: Math.max(topLeft.x, bottomRight.x),
    y0: Math.min(topLeft.y, bottomRight.y),
    y1: Math.max(topLeft.y, bottomRight.y),
  };
}

/**
 * @param {{x0: number, y0: number, x1: number, y1: number}} a
 * @param {{x0: number, y0: number, x1: number, y1: number}} b
 */
function rectIntersectArea(a, b) {
  const ix0 = Math.max(a.x0, b.x0);
  const iy0 = Math.max(a.y0, b.y0);
  const ix1 = Math.min(a.x1, b.x1);
  const iy1 = Math.min(a.y1, b.y1);
  const iw = Math.max(0, ix1 - ix0);
  const ih = Math.max(0, iy1 - iy0);
  return iw * ih;
}

/**
 * `{left, right, bottom, top}` to `{x0, y0, x1, y1}`: the one place the two
 * box shapes are bridged.
 *
 * @param {Bounds} cell
 */
function cellRect(cell) {
  return { x0: cell.left, y0: cell.bottom, x1: cell.right, y1: cell.top };
}

/**
 * A box in PDF points as the page-percent box a published field carries.
 *
 * @param {import('../../../editor/geometry/coords.ts').PageGeometry} geometry
 * @param {Bounds} bounds
 */
function cellBox(geometry, bounds) {
  return toPagePercentBox(geometry, cellRect(bounds));
}

/**
 * Text items whose bulk (>=50% of their own area) sits inside the cell.
 *
 * @param {Bounds} cell
 * @param {TextPoints[]} textItems
 */
function textInsideCell(cell, textItems) {
  const rect = cellRect(cell);
  return textItems.filter((item) => {
    const area = (item.x1 - item.x0) * (item.y1 - item.y0);
    if (!(area > 0)) return false;
    return rectIntersectArea(rect, item) / area >= 0.5;
  });
}

/**
 * How far the stack of row bands this cell stands in rises above it, in points.
 * A table prints its column header once, over its first row, so a bottom row
 * cannot see it within `HEADER_SEARCH_HEIGHT` (FORM-03); following the stack
 * pulls in no extra text on a page with no table.
 *
 * @param {ClosedCell} cell
 * @param {ClosedCell[]} closedCells
 * @returns {number}
 */
function stackRise(cell, closedCells) {
  let top = cell.top;
  for (;;) {
    const above = closedCells.find((other) => Math.abs(other.left - cell.left) <= POS_TOLERANCE
      && Math.abs(other.right - cell.right) <= POS_TOLERANCE
      && Math.abs(other.bottom - top) <= POS_TOLERANCE
      && other.top > top + POS_TOLERANCE);
    if (!above) return top - cell.top;
    top = above.top;
  }
}

/** Nearest text above the cell in the same column; `cell.stackRise` lengthens the reach for a stack of rows. */
/** @type {(cell: ClosedCell, textItems: TextPoints[]) => TextPoints | null} */
function headerAbove(cell, textItems) {
  /** @type {TextPoints | null} */
  let best = null;
  let bestGap = Infinity;
  for (const item of textItems) {
    if (!item.str || !item.str.trim()) continue;
    if (item.y0 < cell.top - POS_TOLERANCE) continue; // not above
    const gap = item.y0 - cell.top;
    if (gap > HEADER_SEARCH_HEIGHT + (cell.stackRise || 0)) continue;
    const overlap = Math.min(item.x1, cell.right) - Math.max(item.x0, cell.left);
    const itemWidth = item.x1 - item.x0;
    if (itemWidth <= 0 || overlap / itemWidth < 0.5) continue; // must sit in this column
    if (gap < bestGap) {
      bestGap = gap;
      best = item;
    }
  }
  return best;
}

/**
 * A floor-ticked column's label: the caption printed *below* its floor rule,
 * inside the column's x-range (FORM-26 part B). `headerAbove` would sail past
 * the row and borrow a caption higher up the page. The window is bounded below
 * by the next rule under the column, else by `LONE_CAPTION_GAP`.
 *
 * @param {ClosedCell} cell
 * @param {TextPoints[]} textItems
 */
function captionBelowFloor(cell, textItems) {
  const limit = cell.nextRuleY !== null && cell.nextRuleY !== undefined
    ? Math.max(cell.nextRuleY, cell.bottom - LONE_CAPTION_GAP)
    : cell.bottom - LONE_CAPTION_GAP;
  /** @type {TextPoints | null} */
  let best = null;
  let bestGap = Infinity;
  for (const item of textItems) {
    if (!item.str || !item.str.trim()) continue;
    const centerY = (item.y0 + item.y1) / 2;
    if (centerY > cell.bottom + POS_TOLERANCE || centerY < limit) continue; // not in the strip below
    const centerX = (item.x0 + item.x1) / 2;
    if (centerX < cell.left - POS_TOLERANCE || centerX > cell.right + POS_TOLERANCE) continue; // not this column
    const gap = cell.bottom - centerY;
    if (gap < bestGap) {
      bestGap = gap;
      best = item;
    }
  }
  return best;
}

// The 4-letter root, not the lemma: Hebrew construct state turns חתימה into
// חתימת, which does not contain the lemma. `formLines.js` reads these two
// constants too, one Hebrew root per kind, one owner.
export const HEBREW_SIGNATURE = 'חתימ';
export const HEBREW_DATE = 'תאריך';
const SLASH_DATE_RE = /^[\s/.]{1,6}$/;
/** Bare 1-3 letter Latin runs are checkbox glyphs (symbol fonts decode to ASCII), not words. */
const GLYPH_NOISE_RE = /^[a-zA-Z]{1,3}(\s+[a-zA-Z]{1,3})*$/;
/** Longer than this is a sentence/paragraph, not a short label hugging an edge. */
const MAX_LABEL_CHARS = 25;
/** How far above a lone box (points) its caption may sit and still be its caption (SNG-10). */
const LONE_CAPTION_GAP = 12;
/**
 * Hebrew, Arabic and their supplements. A side carve keeps the blank on the
 * left, the shape an RTL caption hugging the right wall leaves; an LTR caption
 * reaching the midpoint is a heading or column caption, not a label (FORM-14).
 */
const RTL_RE = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/;
/**
 * How much further a side-carved caption's blank-side gap must reach than its
 * hugged-side gap before the carve is trusted (FORM-14). A caption beside an
 * answer hugs one wall; a heading centred over a table's rows has near-equal
 * gaps, which `rightHug` alone cannot tell apart (docs/sign-form-fields.md).
 */
const HEADER_GAP_RATIO = 3;

/**
 * Is a cell's own printed text separators a person writes *across*, rather than
 * a caption they write beside? A `/  /` cell is a date because the marks are
 * part of the answer's shape, so a typed box may take all of it; a captioned
 * cell keeps the caption's corner and the answer starts clear of it.
 * `GLYPH_NOISE_RE` is the same idea for checkbox glyphs, dropped outright.
 */
/** @param {string} ownStr */
function isPrintedSeparators(ownStr) {
  return ownStr.length > 0 && SLASH_DATE_RE.test(ownStr);
}

/**
 * Where a typed box goes in a side-carved cell: the strip beside its caption,
 * found from the caption alone, or null for the whole cell. Separators are left
 * out of that hunt, since a person writes across them; counting a lone
 * area-code slash as caption would carve a sliver beside it instead of the band
 * under the caption.
 *
 * @param {CellBox} cell
 * @param {TextPoints[]} ownText
 * @param {CellBox | null} sideStrip
 * @returns {CellBox | null}
 */
function typingStrip(cell, ownText, sideStrip) {
  const caption = ownText.filter((t) => t.str.trim() && !isPrintedSeparators(t.str.trim()));
  if (caption.length === 0) return null;
  if (caption.length === ownText.length) return sideStrip;
  return writableArea(cell, caption)?.area ?? sideStrip;
}

/**
 * @param {TextPoints[]} ownText
 * @param {string | undefined} label
 * @returns {import('./fieldTypes.ts').DetectorFieldKind}
 */
function classifyKind(ownText, label) {
  const ownStr = ownText.map((t) => t.str).join(' ').trim();
  if (isPrintedSeparators(ownStr)) return 'date';
  const haystack = `${label || ''} ${ownStr}`;
  if (haystack.includes(HEBREW_SIGNATURE)) return 'signature';
  if (haystack.includes(HEBREW_DATE)) return 'date';
  return 'text';
}

/**
 * The blank part of a cell a person can write in, in points: the whole cell
 * when empty, the strip under a label in its top corner, the strip beside a
 * label that hugs its right wall, or null when no usable strip is left. Never
 * an L shape: a right-aligned answer belongs against the cell's right wall.
 *
 * `area` is `cell` itself when the whole cell is writable, so a caller can tell
 * "no label" from "a strip"; `carve` says whether a caption sits in a `band`
 * above the writing line or at the `side` (see the module doc for why the two
 * are not equally trustworthy as bounds). A side carve also needs the caption
 * to be believable as a label: printed separators are trusted outright, any
 * other text must be RTL (`RTL_RE`) and hug its wall (`HEADER_GAP_RATIO`).
 *
 * @param {CellBox} cell
 * @param {TextPoints[]} ownText
 * @returns {{area: CellBox, carve: 'none' | 'band' | 'side'} | null}
 */
function writableArea(cell, ownText) {
  let area = cell;
  /** @type {'none' | 'band' | 'side'} */
  let carve = 'none';
  if (ownText.length > 0) {
    const textLeft = Math.min(...ownText.map((t) => t.x0));
    const textRight = Math.max(...ownText.map((t) => t.x1));
    // A pdf.js item's box starts at its baseline.
    const textBottom = Math.min(...ownText.map((t) => t.y0));
    const rightHug = textRight >= cell.left + cell.width * 0.5;
    const topHug = textBottom >= cell.bottom + cell.height * 0.5;
    const ownStr = ownText.map((t) => t.str).join(' ').trim();
    const isSeparators = isPrintedSeparators(ownStr);
    // Rule 1: a caption with no RTL character never side-carves.
    const sideCarveable = isSeparators || RTL_RE.test(ownStr);
    // Rule 2: an RTL caption side-carves only when it hugs its wall.
    const leftGap = textLeft - cell.left;
    const rightGap = cell.right - textRight;
    const hugsWall = isSeparators || leftGap >= rightGap * HEADER_GAP_RATIO;
    if (topHug && textBottom - cell.bottom >= MIN_BLANK_HEIGHT) {
      area = { ...cell, top: textBottom };
      carve = 'band';
    } else if (rightHug && sideCarveable && hugsWall && leftGap >= MIN_BLANK_WIDTH) {
      area = { ...cell, right: textLeft };
      carve = 'side';
    } else return null;
  }
  const width = area.right - area.left;
  const height = area.top - area.bottom;
  return width >= MIN_BLANK_WIDTH && height >= MIN_BLANK_HEIGHT ? { area, carve } : null;
}

/**
 * Kept below the comb detector's 0.8 so a comb wins a shared rectangle:
 * rewarded for fully closed geometry and a label; a date or signature matched a
 * keyword, not just geometry.
 *
 * @param {ResolvedCell} resolved
 * @param {import('./fieldTypes.ts').DetectorFieldKind} kind
 */
function confidenceOf(resolved, kind) {
  let confidence = 0.45;
  if (resolved.closure >= 0.95) confidence += 0.1;
  if (resolved.label) confidence += 0.1;
  if (kind !== 'text') confidence += 0.05;
  return Math.min(confidence, 0.7);
}

/**
 * @typedef {import('./fieldTypes.ts').PercentBox} PercentBox
 * @typedef {import('./fieldTypes.ts').PageTextRun} PageTextRun
 * @typedef {import('./fieldTypes.ts').FieldCandidate} FieldCandidate
 * @typedef {import('./fieldTypes.ts').DetectedCell} DetectedCell
 * @typedef {DetectedCell & {id: string, label?: string, required: string, confidence: number,
 *   source: string, notes: string}} CellCandidate
 */

/**
 * A tick box: its own box, no text, labelled by the column header above it.
 *
 * @param {ClosedCell} cell
 * @param {import('../../../editor/geometry/coords.ts').PageGeometry} geometry
 * @param {TextPoints[]} textItems
 * @returns {ResolvedCell}
 */
function tickBoxCell(cell, geometry, textItems) {
  return {
    bounds: cellBox(geometry, cell),
    enclosureBounds: undefined,
    writableBounds: undefined,
    cell,
    kind: 'checkbox',
    label: headerAbove(cell, textItems)?.str?.trim(),
    ownTextCount: 0,
    coverage: 0,
    closure: cell.closure,
  };
}

/**
 * Closed-cell candidate fields on one page: the text/date/signature/table-cell
 * regions the comb/checkbox detector leaves alone.
 *
 * @param {{verticals: VerticalEdge[], horizontals: HorizontalRule[], rects: Array<object>}} ink
 * @param {import('../../../editor/geometry/coords.ts').PageGeometry} geometry
 * @param {number} pageIndex
 * @param {PageTextRun[]} textItems page text, page-percent bounds
 * @returns {CellCandidate[]}
 */
export function detectCellCandidates(ink, geometry, pageIndex, textItems) {
  const textItemsPoints = textItems.map((item) => textItemToPoints(item, geometry));
  const stacked = buildClosedCells(ink);
  const closedCells = stacked.map((cell) => ({ ...cell, stackRise: stackRise(cell, stacked) }));

  // Counted over every closed cell, not the survivors: a tick column is
  // admitted by the fact that it repeats, and its other filters come later.
  const columnKey = (/** @type {ClosedCell} */ c) => `${Math.round(c.left)}|${Math.round(c.right)}`;
  /** @type {Map<string, number>} */
  const closedColumnCounts = new Map();
  for (const cell of closedCells) {
    const key = columnKey(cell);
    closedColumnCounts.set(key, (closedColumnCounts.get(key) || 0) + 1);
  }

  // A row of a stack: an abutting cell in its own column, about as tall. Equal
  // rows repeating down a column are a divided box, where a ledge or underline
  // leaves a short strip beside a tall one.
  const isStackedRow = (/** @type {ClosedCell} */ cell) => closedCells.some((other) => other !== cell
    && columnKey(other) === columnKey(cell)
    && (Math.abs(other.top - cell.bottom) <= POS_TOLERANCE || Math.abs(other.bottom - cell.top) <= POS_TOLERANCE)
    && Math.min(other.height, cell.height) / Math.max(other.height, cell.height) >= STACKED_ROW_HEIGHT_RATIO);

  // First pass classifies each cell; the table-cell count needs the whole population.
  /** @type {ResolvedCell[]} */
  const resolved = [];
  for (const cell of closedCells) {
    const ownText = textInsideCell(cell, textItemsPoints);
    if (cell.floorTicked) {
      // The field is one written line standing on the floor rule, not the whole
      // band above it (FORM-26 part A). Its height is what `writableArea`'s band
      // carve gives the *row*, read once across the row's span because the row
      // caption sits over one column only, falling back to the band's own top.
      const rowLeft = /** @type {number} */ (cell.rowLeft);
      const rowRight = /** @type {number} */ (cell.rowRight);
      const row = {
        left: rowLeft,
        right: rowRight,
        bottom: cell.bottom,
        top: cell.top,
        width: rowRight - rowLeft,
        height: cell.top - cell.bottom,
      };
      const rowOwnText = textInsideCell(row, textItemsPoints);
      const rowWritable = writableArea(row, rowOwnText);
      const carvedTop = rowWritable && rowWritable.carve === 'band' ? rowWritable.area.top : cell.top;
      const field = {
        left: cell.left,
        right: cell.right,
        bottom: cell.bottom,
        top: Math.min(cell.top, carvedTop),
      };
      // No caption below the floor means no field (FORM-26 part B): that keeps a
      // stray tick pair, or a divider inside another field's comb, from being published.
      const caption = captionBelowFloor(cell, textItemsPoints);
      if (!caption) continue;
      const label = caption.str.trim();
      const fieldOwnText = textInsideCell(field, textItemsPoints);
      resolved.push({
        bounds: cellBox(geometry, field),
        enclosureBounds: field.top === cell.top ? undefined : cellBox(geometry, cell),
        writableBounds: undefined,
        cell,
        kind: classifyKind(fieldOwnText, label),
        label,
        ownTextCount: fieldOwnText.length,
        coverage: 0,
        closure: cell.closure,
      });
      continue;
    }
    if (cell.narrow) {
      // Too narrow for text tests to mean anything: admitted by its column,
      // disqualified by any text at all.
      if (ownText.length > 0) continue;
      if ((closedColumnCounts.get(columnKey(cell)) || 0) < MIN_TICK_COLUMN_ROWS) continue;
      resolved.push(tickBoxCell(cell, geometry, textItemsPoints));
      continue;
    }
    // A lone closed square with no text is a tick box on that alone (FORM-10).
    if (cell.lone && cell.square && ownText.length === 0) {
      resolved.push(tickBoxCell(cell, geometry, textItemsPoints));
      continue;
    }
    // A row of a stack has a rule between it and its neighbour, so only a
    // genuinely lone box is judged here.
    if (cell.lone && !isStackedRow(cell)) {
      // Own text settles the panel case: a panel is full of the prose it exists
      // to hold, so any text drops it, even a short paragraph under
      // FULL_TEXT_COVERAGE. A box with no text still needs a short caption right
      // on it (`LONE_CAPTION_GAP`, `MAX_LABEL_CHARS`) before it is trusted as a
      // field: precision first (SNG-10).
      if (ownText.length > 0) continue;
      const caption = headerAbove(cell, textItemsPoints);
      if (!caption || caption.y0 - cell.top > LONE_CAPTION_GAP) continue;
      if (caption.str.trim().length > MAX_LABEL_CHARS) continue;
    }
    const ownStr = ownText.map((t) => t.str).join(' ').trim();
    const ownArea = ownText.reduce((sum, item) => sum + rectIntersectArea(cellRect(cell), item), 0);
    const cellArea = cell.width * cell.height;
    const coverage = cellArea > 0 ? ownArea / cellArea : 1;
    if (coverage > FULL_TEXT_COVERAGE) continue; // explanatory box, not an input
    // A paragraph is not a short label hugging an edge, whatever its coverage.
    if (ownStr.length > MAX_LABEL_CHARS) continue;
    // A checkbox glyph rendered as text: already covered by that checkbox.
    if (GLYPH_NOISE_RE.test(ownStr)) continue;

    const writable = writableArea(cell, ownText);
    if (!writable) continue;

    const header = headerAbove(cell, textItemsPoints);
    const label = ownText.length > 0 ? ownStr : header?.str?.trim();
    const kind = classifyKind(ownText, label);

    // Only the band carve is trusted as bounds (see the module doc).
    const field = writable.carve === 'band' ? writable.area : cell;
    const bounds = cellBox(geometry, field);
    const enclosureBounds = field === cell ? undefined : cellBox(geometry, cell);
    // A side carve is where the typed box belongs, though not trusted as
    // bounds; printed separators publish no strip and keep the whole span.
    const strip = writable.carve === 'side' ? typingStrip(cell, ownText, writable.area) : null;
    const writableBounds = strip ? cellBox(geometry, strip) : undefined;
    resolved.push({
      bounds, enclosureBounds, writableBounds, cell, kind, label, ownTextCount: ownText.length, coverage, closure: cell.closure,
    });
  }

  // A wall column the floor ticks divided yields to them only when one survived
  // as a captioned field (FORM-27): address-row ticks are dividers, a comb's teeth are not.
  const sameBand = (/** @type {Bounds} */ a, /** @type {Bounds} */ b) => Math.abs(a.top - b.top) <= POS_TOLERANCE && Math.abs(a.bottom - b.bottom) <= POS_TOLERANCE;
  const dividedByCaptionedTicks = (/** @type {ClosedCell} */ column) => resolved.some(({ cell }) => cell.floorTicked && sameBand(cell, column)
    && cell.left >= column.left - POS_TOLERANCE && cell.right <= column.right + POS_TOLERANCE);
  const fields = resolved.filter(({ cell }) => !cell.tickDivided || !dividedByCaptionedTicks(cell));

  // A column recurring across 3+ row bands is a repeating table; a one-off
  // labelled field stays `text`.
  /** @type {Map<string, number>} */
  const columnCounts = new Map();
  for (const r of fields) {
    const key = columnKey(r.cell);
    columnCounts.set(key, (columnCounts.get(key) || 0) + 1);
  }

  /** @type {CellCandidate[]} */
  const candidates = [];
  let index = 0;
  for (const r of fields) {
    const kind = r.kind === 'text' && (columnCounts.get(columnKey(r.cell)) ?? 0) >= 3 ? 'table-cell' : r.kind;

    candidates.push({
      id: `combined-heuristic-${String(index).padStart(4, '0')}`,
      pageIndex,
      ...r.bounds,
      ...(r.enclosureBounds ? { enclosure: r.enclosureBounds } : {}),
      ...(r.writableBounds ? { writable: r.writableBounds } : {}),
      kind,
      label: r.label || undefined,
      required: 'unknown',
      confidence: confidenceOf(r, kind),
      source: 'combined-heuristic',
      notes: `closure=${r.closure.toFixed(2)} coverage=${r.coverage.toFixed(2)} ownText=${r.ownTextCount}`,
    });
    index += 1;
  }

  return candidates;
}

/**
 * Closed-cell candidate fields on a pdf-lib page. Read-only: the page is walked, never modified.
 *
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @param {number} pageIndex
 * @param {PageTextRun[]} textItems page text, page-percent bounds
 */
export function detectPageCellCandidates(page, pageIndex, textItems) {
  const geometry = createPageGeometry({
    cropBox: pageCropBox(page),
    rotation: page.getRotation().angle,
  });
  const ink = collectPageInk(page);
  return detectCellCandidates(ink, geometry, pageIndex, textItems);
}
