import { createPageGeometry, pagePercentToPdfPoint } from '../../geometry/coords.ts';
import { collectPageInk, pageCropBox } from './pageInk.js';
import { toPagePercentBox } from './formGrid.js';

/**
 * Closed table/box cells from vector ink (`pageInk.js`) that `formGrid.js`'s comb/checkbox
 * detector deliberately leaves alone, cross-referenced against page text for labels and
 * blank-vs-full classification.
 *
 * Ported from the MOBI-10 spike (`scripts/spike/mobi-10/cells.mjs`, kept as a thin CLI wrapper
 * over this module). See `scripts/spike/mobi-10/report-cells.md` for the measured recall on the
 * two spike forms and the seven documented failure classes still open.
 *
 * Deliberately NOT re-detecting combs or checkboxes: `baselineCandidates` (from `formGrid.js`'s
 * `detectRegions`/`detectPageRegions`) already gets those at 100% precision on the spike forms,
 * and this module skips any cell that overlaps one.
 *
 * ## The idea
 *
 * 1. Rebuild the page's own grid from its ink: every vertical edge (`verticals` plus rectangle
 *    side walls) and every horizontal rule (`horizontals` plus rectangle top/bottom) `pageInk.js`
 *    reports. This is the same normalization `formGrid.js` does internally (its own
 *    `verticalEdges`/`horizontalRules`, not exported, so duplicated here for a general-purpose
 *    cell rather than a comb/checkbox-specific one).
 * 2. Snap rule/edge coordinates, walk adjacent horizontal-rule pairs as row bands, and within
 *    each band walk adjacent vertical-edge pairs as columns. A cell is only kept when real ink
 *    closes all four sides above a coverage threshold - nothing is invented, same discipline as
 *    `findCombRuns`.
 * 3. Classify by what page text sits inside: empty (or a short label hugging the top/right edge,
 *    since these forms are RTL) with a large enough blank remainder is an input cell; heavy text
 *    coverage is an explanatory box and is dropped. The nearest text sitting *above* the cell in
 *    the same column is read as a header/label even when nothing is printed inside the cell
 *    itself (most misses are exactly that: a labelled header row over one wholly blank data row).
 * 4. `חתימה` in the resolved label makes it a signature; `תאריך` in the resolved label, or
 *    "/ /"-only own text, makes it a date; everything else is `text`, upgraded to `table-cell`
 *    when the same column recurs across three or more row bands (a real repeating table, not a
 *    one-off labelled field).
 *
 * ## Coordinates
 *
 * Ink geometry stays in PDF points throughout (the unit `pageInk.js` and `formGrid.js` already
 * work in); text runs and output candidates are the editor's page-percent model (0..100,
 * top-left origin, y down), routed through the same `geometry/coords.ts` transform `formGrid.js`
 * uses. That is the one page-coordinate transform in this repo (SIGN-05, ARCH-02).
 *
 * One fix from the MOBI-10 spike's `cells.mjs`, found while writing this module's unit tests:
 * `textInsideCell`/the own-text-area sum called `rectIntersectArea(cell, item)` directly, but a
 * closed cell's own shape (`{left, right, bottom, top}`) and `rectIntersectArea`'s expected shape
 * (`{x0, y0, x1, y1}`) don't share field names, so the comparison was silently `NaN` and a cell's
 * own printed text was never actually found. It went unnoticed in the spike's scored numbers
 * because `headerAbove` - a separate, correctly-shaped code path - still supplied most labels;
 * see `cellRect()` below for the fix. A form whose blank input sits on the *same* line as its
 * label (own-text hugging an edge, rather than a header row above) was undercounted until now.
 */

// Tunables, in PDF points (pageInk.js's native unit).
/** A rect thinner than this on one axis is a drawn rule, not a box wall. */
const THIN_INK = 1.5;
/** Positions within this many points are the same wall (mirrors formGrid.js's PITCH_TOLERANCE). */
const POS_TOLERANCE = 1.0;
/** How far a wall may sit from a row band and still count as bounding it. */
const BAND_TOLERANCE = 1.5;
/** How much of a side must be ruled/edged for that side to count as closed. */
const CLOSED_EDGE_COVERAGE = 0.7;
/** Row bands outside this height range are not a single writable line/box. */
const MIN_ROW_HEIGHT = 6;
const MAX_ROW_HEIGHT = 45;
/** A column narrower than this is a rule gap, not a cell anyone could write in. */
const MIN_CELL_WIDTH = 15;
/** The blank remainder (after any hugging label) must be at least this large. */
const MIN_BLANK_WIDTH = 25;
const MIN_BLANK_HEIGHT = 8;
/** A cell whose own text covers more of its area than this is explanatory, not fillable. */
const FULL_TEXT_COVERAGE = 0.4;
/** How far above a cell to look for a column header, in points. */
const HEADER_SEARCH_HEIGHT = 220;
/** A candidate is dropped if it overlaps a baseline comb/checkbox this much. */
const BASELINE_IOU = 0.3;
const BASELINE_CONTAINMENT = 0.6;

// ---------------------------------------------------------------------------
// Ink normalization - the same folding formGrid.js does (rect sides publish as vertical
// edges, rect top/bottom as horizontal rules), extended to full rectangles too (a table
// cell can be drawn as a filled box, not just ruled).
// ---------------------------------------------------------------------------

function verticalEdgesAll(ink) {
  const edges = ink.verticals.map((edge) => ({ ...edge }));
  for (const rect of ink.rects) {
    if (rect.width <= THIN_INK && rect.height > THIN_INK) {
      edges.push({ x: rect.x + rect.width / 2, y0: rect.y, y1: rect.y + rect.height });
    } else if (rect.width > THIN_INK && rect.height > THIN_INK) {
      edges.push({ x: rect.x, y0: rect.y, y1: rect.y + rect.height });
      edges.push({ x: rect.x + rect.width, y0: rect.y, y1: rect.y + rect.height });
    }
  }
  return edges;
}

function horizontalRulesAll(ink) {
  const rules = ink.horizontals.map((rule) => ({ ...rule }));
  for (const rect of ink.rects) {
    if (rect.height <= THIN_INK && rect.width > THIN_INK) {
      rules.push({ y: rect.y + rect.height / 2, x0: rect.x, x1: rect.x + rect.width });
    } else if (rect.width > THIN_INK && rect.height > THIN_INK) {
      rules.push({ y: rect.y, x0: rect.x, x1: rect.x + rect.width });
      rules.push({ y: rect.y + rect.height, x0: rect.x, x1: rect.x + rect.width });
    }
  }
  return rules;
}

function distinctPositions(values, tolerance) {
  const sorted = [...values].sort((a, b) => a - b);
  const out = [];
  for (const value of sorted) {
    if (out.length === 0 || value - out[out.length - 1] > tolerance) out.push(value);
  }
  return out;
}

/** Share of `[left, right]` at height `y` that horizontal ink actually covers. */
function ruledCoverage(rules, y, left, right) {
  const span = right - left;
  if (!(span > 0)) return 0;
  const parts = rules
    .filter((rule) => Math.abs(rule.y - y) <= BAND_TOLERANCE)
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

/** Share of `[bottom, top]` at position `x` that vertical ink actually covers. */
function verticalCoverage(edges, x, bottomY, topY) {
  const span = topY - bottomY;
  if (!(span > 0)) return 0;
  const parts = edges
    .filter((edge) => Math.abs(edge.x - x) <= BAND_TOLERANCE)
    .map((edge) => [Math.max(edge.y0, bottomY), Math.min(edge.y1, topY)])
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
 * Closed cells on one page, in PDF points (origin bottom-left, y up).
 *
 * Walking only *adjacent* rule/edge pairs (not every pair) is deliberate: it finds atomic grid
 * cells the same way a table is actually drawn, and keeps the pass at O(rules x
 * edges-per-band) instead of O(rules^2 x edges^2).
 */
function buildClosedCells(ink) {
  const edges = verticalEdgesAll(ink);
  const rules = horizontalRulesAll(ink);
  const ys = distinctPositions(rules.map((r) => r.y), POS_TOLERANCE).sort((a, b) => b - a);

  const cells = [];
  for (let i = 0; i < ys.length - 1; i += 1) {
    const top = ys[i];
    const bottom = ys[i + 1];
    const height = top - bottom;
    if (height < MIN_ROW_HEIGHT || height > MAX_ROW_HEIGHT) continue;

    const bandEdgeX = edges
      .filter((edge) => edge.y1 >= top - BAND_TOLERANCE && edge.y0 <= bottom + BAND_TOLERANCE)
      .map((edge) => edge.x);
    const xs = distinctPositions(bandEdgeX, POS_TOLERANCE).sort((a, b) => a - b);
    // A row bounded by only its own two outer walls (xs.length === 2) is a single undivided
    // box, not a form row - every observed instructional or explanatory panel on both spike
    // forms has exactly this shape (one bordered paragraph, no internal rule), while every
    // real labelled-field row has at least one more division alongside it. Requiring a genuine
    // interior wall drops those panels without touching any table row in the misses.
    if (xs.length < 3) continue;

    for (let j = 0; j < xs.length - 1; j += 1) {
      const left = xs[j];
      const right = xs[j + 1];
      const width = right - left;
      if (width < MIN_CELL_WIDTH) continue;

      const topCoverage = ruledCoverage(rules, top, left, right);
      const bottomCoverage = ruledCoverage(rules, bottom, left, right);
      if (topCoverage < CLOSED_EDGE_COVERAGE || bottomCoverage < CLOSED_EDGE_COVERAGE) continue;

      const leftCoverage = verticalCoverage(edges, left, bottom, top);
      const rightCoverage = verticalCoverage(edges, right, bottom, top);
      if (leftCoverage < CLOSED_EDGE_COVERAGE || rightCoverage < CLOSED_EDGE_COVERAGE) continue;

      const closure = Math.min(topCoverage, bottomCoverage, leftCoverage, rightCoverage);
      cells.push({ left, right, bottom, top, width, height, closure });
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Text: page-percent (0..100, top-left, y down) -> PDF points (y up), through the one shared
// transform, so cells and text share a coordinate system for containment tests.
// ---------------------------------------------------------------------------

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

function rectIntersectArea(a, b) {
  const ix0 = Math.max(a.x0, b.x0);
  const iy0 = Math.max(a.y0, b.y0);
  const ix1 = Math.min(a.x1, b.x1);
  const iy1 = Math.min(a.y1, b.y1);
  const iw = Math.max(0, ix1 - ix0);
  const ih = Math.max(0, iy1 - iy0);
  return iw * ih;
}

/** `{left, right, bottom, top}` (buildClosedCells' own shape) -> `{x0, y0, x1, y1}`
 * (rectIntersectArea's shape). A cell and a text item are otherwise the same kind of box; this
 * is the one place that difference in field names has to be bridged. */
function cellRect(cell) {
  return { x0: cell.left, y0: cell.bottom, x1: cell.right, y1: cell.top };
}

/** Text items whose bulk (>=50% of their own area) sits inside the cell. */
function textInsideCell(cell, textItems) {
  const rect = cellRect(cell);
  return textItems.filter((item) => {
    const area = (item.x1 - item.x0) * (item.y1 - item.y0);
    if (!(area > 0)) return false;
    return rectIntersectArea(rect, item) / area >= 0.5;
  });
}

/** Nearest text above the cell, in the same column - a column header/label. */
function headerAbove(cell, textItems) {
  let best = null;
  let bestGap = Infinity;
  for (const item of textItems) {
    if (!item.str || !item.str.trim()) continue;
    if (item.y0 < cell.top - POS_TOLERANCE) continue; // not above
    const gap = item.y0 - cell.top;
    if (gap > HEADER_SEARCH_HEIGHT) continue;
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

// The 4-letter root, not the dictionary form: Hebrew construct state turns חתימה (signature)
// into חתימת (e.g. "חתימת העובד/ת", signature-of-the-employee), which does not contain the
// literal string "חתימה" - matching the root instead of the lemma is what actually catches
// every signature label on both spike forms.
const HEBREW_SIGNATURE = 'חתימ';
const HEBREW_DATE = 'תאריך';
const SLASH_DATE_RE = /^[\s/.]{1,6}$/;
/** One or more bare 1-3 letter Latin runs - almost always checkbox glyphs (Wingdings-style
 * symbol fonts decode to ASCII letters), never real words on these Hebrew forms, including
 * when two sit side by side in one cell. */
const GLYPH_NOISE_RE = /^[a-zA-Z]{1,3}(\s+[a-zA-Z]{1,3})*$/;
/** Longer than this is a sentence/paragraph, not a short label hugging an edge. */
const MAX_LABEL_CHARS = 25;

function classifyKind(ownText, label) {
  const ownStr = ownText.map((t) => t.str).join(' ').trim();
  if (ownStr && SLASH_DATE_RE.test(ownStr)) return 'date';
  const haystack = `${label || ''} ${ownStr}`;
  if (haystack.includes(HEBREW_SIGNATURE)) return 'signature';
  if (haystack.includes(HEBREW_DATE)) return 'date';
  return 'text';
}

// ---------------------------------------------------------------------------
// Baseline overlap (skip anything the comb/checkbox detector already claims), in page-percent.
// ---------------------------------------------------------------------------

function overlapsBaseline(bounds, baseline) {
  const ax2 = bounds.left + bounds.width;
  const ay2 = bounds.top + bounds.height;
  const area = bounds.width * bounds.height;
  return baseline.some((b) => {
    const bx2 = b.left + b.width;
    const by2 = b.top + b.height;
    const ix1 = Math.max(bounds.left, b.left);
    const iy1 = Math.max(bounds.top, b.top);
    const ix2 = Math.min(ax2, bx2);
    const iy2 = Math.min(ay2, by2);
    const iw = Math.max(0, ix2 - ix1);
    const ih = Math.max(0, iy2 - iy1);
    const inter = iw * ih;
    if (inter <= 0) return false;
    const bArea = b.width * b.height;
    const union = area + bArea - inter;
    const iou = union > 0 ? inter / union : 0;
    const containment = Math.min(area, bArea) > 0 ? inter / Math.min(area, bArea) : 0;
    return iou >= BASELINE_IOU || containment >= BASELINE_CONTAINMENT;
  });
}

/**
 * @typedef {{left: number, top: number, width: number, height: number}} PercentBox
 * @typedef {PercentBox & {str: string}} PageTextRun
 * @typedef {PercentBox & {kind: string}} FieldCandidate
 */

/**
 * Closed-cell candidate fields on one page: text/date/signature/table-cell regions the
 * comb/checkbox detector deliberately leaves alone.
 *
 * @param {{verticals: Array, horizontals: Array, rects: Array}} ink
 * @param {import('../../geometry/coords.ts').PageGeometry} geometry
 * @param {number} pageIndex
 * @param {FieldCandidate[]} baselineCandidates already-detected comb/checkbox regions to skip
 * @param {PageTextRun[]} textItems page text, page-percent bounds
 */
export function detectCellCandidates(ink, geometry, pageIndex, baselineCandidates, textItems) {
  const textItemsPoints = textItems.map((item) => textItemToPoints(item, geometry));
  const closedCells = buildClosedCells(ink);

  // First pass: geometry + text classification, kept even when the cell will later turn out
  // to duplicate a baseline region, so the column-repeat count (table-cell vs text) is
  // computed over the same population a person would see, not one already thinned by the
  // baseline-overlap filter.
  const resolved = [];
  for (const cell of closedCells) {
    const ownText = textInsideCell(cell, textItemsPoints);
    const ownStr = ownText.map((t) => t.str).join(' ').trim();
    const ownArea = ownText.reduce((sum, item) => sum + rectIntersectArea(cellRect(cell), item), 0);
    const cellArea = cell.width * cell.height;
    const coverage = cellArea > 0 ? ownArea / cellArea : 1;
    if (coverage > FULL_TEXT_COVERAGE) continue; // explanatory box, not an input
    // A sentence/paragraph is not "a short label hugging one edge" - the instructional boxes
    // at the top of both spike forms have exactly this shape (low area coverage over several
    // lines, but real prose, not a label).
    if (ownStr.length > MAX_LABEL_CHARS) continue;
    // A bare short Latin run is a checkbox glyph rendered as text, not a word on a Hebrew
    // form - treat its cell as already covered by that checkbox, not a fresh text field.
    if (GLYPH_NOISE_RE.test(ownStr)) continue;

    // Blank remainder: cell minus the union of its own text, required to actually hug the
    // right edge or the top edge (RTL forms put a short label at one of those two) rather
    // than merely computed from area coverage - a caption centered in a wide decorative cell
    // can have low area coverage without leaving any real fillable strip next to it.
    let blankWidth = cell.width;
    let blankHeight = cell.height;
    if (ownText.length > 0) {
      const textLeft = Math.min(...ownText.map((t) => t.x0));
      const textRight = Math.max(...ownText.map((t) => t.x1));
      const textBottom = Math.min(...ownText.map((t) => t.y0));
      const rightHug = textRight >= cell.left + cell.width * 0.5;
      const topHug = textBottom >= cell.bottom + cell.height * 0.5;
      const rightHugBlank = rightHug ? textLeft - cell.left : -Infinity;
      const topHugBlank = topHug ? textBottom - cell.bottom : -Infinity;
      if (rightHugBlank < MIN_BLANK_WIDTH && topHugBlank < MIN_BLANK_HEIGHT) continue; // no clean hug
      blankWidth = rightHugBlank >= MIN_BLANK_WIDTH ? rightHugBlank : cell.width;
      blankHeight = topHugBlank >= MIN_BLANK_HEIGHT ? topHugBlank : cell.height;
    }
    if (blankWidth < MIN_BLANK_WIDTH || blankHeight < MIN_BLANK_HEIGHT) continue;

    const header = headerAbove(cell, textItemsPoints);
    const label = ownText.length > 0 ? ownStr : header?.str?.trim();
    const kind = classifyKind(ownText, label);

    const bounds = toPagePercentBox(geometry, {
      x0: cell.left, y0: cell.bottom, x1: cell.right, y1: cell.top,
    });
    resolved.push({
      bounds, cell, kind, label, ownTextCount: ownText.length, coverage, closure: cell.closure,
    });
  }

  // table-cell vs text: a column that recurs across >=3 row bands (same left/right within
  // POS_TOLERANCE) is a real repeating table row; a one-off labelled field (the common case
  // here - a header row over one blank data row) stays `text`.
  const columnKey = (c) => `${Math.round(c.left)}|${Math.round(c.right)}`;
  const columnCounts = new Map();
  for (const r of resolved) {
    const key = columnKey(r.cell);
    columnCounts.set(key, (columnCounts.get(key) || 0) + 1);
  }

  const candidates = [];
  let index = 0;
  for (const r of resolved) {
    if (overlapsBaseline(r.bounds, baselineCandidates)) continue;
    const kind = r.kind === 'text' && columnCounts.get(columnKey(r.cell)) >= 3 ? 'table-cell' : r.kind;

    // Confidence: honest and below the baseline detector's 0.8. Rewarded for fully closed
    // geometry and a resolved, keyword-matched label; penalized for a classification that
    // fell back to the coverage heuristic with no label.
    let confidence = 0.45;
    if (r.closure >= 0.95) confidence += 0.1;
    if (r.label) confidence += 0.1;
    if (kind !== 'text') confidence += 0.05; // date/signature matched a keyword, not just geometry
    confidence = Math.min(confidence, 0.7);

    candidates.push({
      id: `combined-heuristic-${String(index).padStart(4, '0')}`,
      pageIndex,
      ...r.bounds,
      kind,
      label: r.label || undefined,
      required: 'unknown',
      confidence,
      source: 'combined-heuristic',
      notes: `closure=${r.closure.toFixed(2)} coverage=${r.coverage.toFixed(2)} ownText=${r.ownTextCount}`,
    });
    index += 1;
  }

  return candidates;
}

/**
 * Closed-cell candidate fields on a pdf-lib page. On-device and read-only: the page is walked,
 * never modified.
 *
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @param {number} pageIndex
 * @param {FieldCandidate[]} baselineCandidates already-detected comb/checkbox regions to skip
 * @param {PageTextRun[]} textItems page text, page-percent bounds
 */
export function detectPageCellCandidates(page, pageIndex, baselineCandidates, textItems) {
  const geometry = createPageGeometry({
    cropBox: pageCropBox(page),
    rotation: page.getRotation().angle,
  });
  const ink = collectPageInk(page);
  return detectCellCandidates(ink, geometry, pageIndex, baselineCandidates, textItems);
}
