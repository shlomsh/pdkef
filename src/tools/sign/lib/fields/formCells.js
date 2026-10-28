// @ts-check
import { createPageGeometry, pagePercentToPdfPoint, toPagePercentBox } from '#editor/geometry/coords.ts';
import { collectPageInk, pageCropBox } from './pageInk.js';
import { CELL_CONFIDENCE } from './confidenceWeights.ts';
import { buildClosedCells, POS_TOLERANCE } from './formCellGrid.ts';

/**
 * Shapes shared by the cell walk below, all in PDF points (origin bottom-left, y up).
 * @typedef {import('./formCellGrid.ts').VerticalEdge} VerticalEdge
 * @typedef {import('./formCellGrid.ts').HorizontalRule} HorizontalRule
 * @typedef {import('./formCellGrid.ts').Bounds} Bounds
 * @typedef {import('./formCellGrid.ts').CellBox} CellBox
 * @typedef {import('./formCellGrid.ts').ClosedCell} ClosedCell
 * @typedef {{str: string, x0: number, x1: number, y0: number, y1: number}} TextPoints
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


// Tunables, in PDF points.
const MIN_TICK_COLUMN_ROWS = 3;
/** Abutting cells in one column whose heights are within this ratio are rows of one stack. */
const STACKED_ROW_HEIGHT_RATIO = 0.8;
/** The blank remainder (after any hugging label) must be at least this large. */
const MIN_BLANK_WIDTH = 25;
const MIN_BLANK_HEIGHT = 8;
/** A cell whose own text covers more of its area than this is explanatory, not fillable. */
const FULL_TEXT_COVERAGE = 0.4;
/** How far above a cell to look for a column header, in points. */
const HEADER_SEARCH_HEIGHT = 220;

// Text: page-percent (y down) to PDF points (y up), through the one shared transform.
/**
 * @param {PageTextRun} item
 * @param {import('#editor/geometry/coords.ts').PageGeometry} geometry
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
 * @param {import('#editor/geometry/coords.ts').PageGeometry} geometry
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

/** Closed cells a column must hold before a far header still names its empty ones (FORM-34). */
const MIN_REPEATING_COLUMN_ROWS = 4;
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
 * Confidence of a cell candidate: the weights in `CELL_CONFIDENCE`, summed in order and capped.
 *
 * @param {ResolvedCell} resolved
 * @param {import('./fieldTypes.ts').DetectorFieldKind} kind
 */
function confidenceOf(resolved, kind) {
  let confidence = CELL_CONFIDENCE.base;
  if (resolved.closure >= CELL_CONFIDENCE.closedAt) confidence += CELL_CONFIDENCE.closed;
  if (resolved.label) confidence += CELL_CONFIDENCE.labelled;
  if (kind !== 'text') confidence += CELL_CONFIDENCE.keywordKind;
  return Math.min(confidence, CELL_CONFIDENCE.cap);
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
 * @param {import('#editor/geometry/coords.ts').PageGeometry} geometry
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
 * What a resolver may read, besides its cell: the page, the cell's own text and
 * the column bookkeeping `detectCellCandidates` counts over every closed cell.
 *
 * @typedef {object} CellContext
 * @property {import('#editor/geometry/coords.ts').PageGeometry} geometry
 * @property {TextPoints[]} textItemsPoints every text run on the page, in PDF points
 * @property {TextPoints[]} ownText the runs whose bulk sits inside this cell
 * @property {Map<string, number>} closedColumnCounts closed cells per column key
 * @property {Map<string, number>} emptyColumnCounts closed cells with no text of their own, per column key
 * @property {(cell: ClosedCell) => string} columnKey
 * @property {(cell: ClosedCell) => boolean} isStackedRow
 */

/**
 * One kind of closed cell's verdict. `undefined` means the cell is not this
 * resolver's kind (ask the next one), `null` means it is and it is dropped, a
 * cell means it is resolved. A drop must not fall through: a narrow cell that
 * fails its tests would otherwise be re-read as a general field.
 *
 * @typedef {(cell: ClosedCell, context: CellContext) => ResolvedCell | null | undefined} CellResolver
 */

/**
 * A floor-ticked band is one written line on its floor rule, so it is cut down
 * to that line and captioned from below, which no other kind of cell reads.
 *
 * @type {CellResolver}
 */
export function resolveFloorTicked(cell, { geometry, textItemsPoints }) {
  if (!cell.floorTicked) return undefined;
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
  if (!caption) return null;
  const label = caption.str.trim();
  const fieldOwnText = textInsideCell(field, textItemsPoints);
  return {
    bounds: cellBox(geometry, field),
    enclosureBounds: field.top === cell.top ? undefined : cellBox(geometry, cell),
    writableBounds: undefined,
    cell,
    kind: classifyKind(fieldOwnText, label),
    label,
    ownTextCount: fieldOwnText.length,
    coverage: 0,
    closure: cell.closure,
  };
}

/**
 * A column too narrow for text tests to mean anything is a tick column when it
 * repeats and holds nothing, so it is judged by its column, not by its text.
 *
 * @type {CellResolver}
 */
export function resolveNarrowTick(cell, { geometry, textItemsPoints, ownText, closedColumnCounts, columnKey }) {
  if (!cell.narrow) return undefined;
  // Admitted by its column, disqualified by any text at all.
  if (ownText.length > 0) return null;
  if ((closedColumnCounts.get(columnKey(cell)) || 0) < MIN_TICK_COLUMN_ROWS) return null;
  return tickBoxCell(cell, geometry, textItemsPoints);
}

/**
 * A lone square with no text is a tick box on its shape alone, so it skips the
 * caption test a lone rectangle has to pass (FORM-10).
 *
 * @type {CellResolver}
 */
export function resolveLoneSquare(cell, { geometry, textItemsPoints, ownText }) {
  if (!(cell.lone && cell.square && ownText.length === 0)) return undefined;
  return tickBoxCell(cell, geometry, textItemsPoints);
}

/**
 * A lone rectangle is as likely a panel or photo box as a field, so it must
 * hold no text and carry a short caption right on it before it is trusted
 * (SNG-10), except that the caption may sit far above a box in a column of
 * four or more empty closed cells repeating under one header (FORM-34). A passing box is not resolved here: it falls through to the general
 * resolver for its bounds and kind.
 *
 * @type {CellResolver}
 */
export function resolveLoneBox(cell, { textItemsPoints, ownText, isStackedRow, emptyColumnCounts, columnKey }) {
  // A row of a stack has a rule between it and its neighbour, so only a
  // genuinely lone box is judged here.
  if (!cell.lone || isStackedRow(cell)) return undefined;
  // Own text settles the panel case: a panel is full of the prose it exists
  // to hold, so any text drops it, even a short paragraph under
  // FULL_TEXT_COVERAGE. A box with no text still needs a short caption right
  // on it (`LONE_CAPTION_GAP`, `MAX_LABEL_CHARS`) before it is trusted as a
  // field: precision first (SNG-10).
  if (ownText.length > 0) return null;
  const caption = headerAbove(cell, textItemsPoints);
  if (!caption) return null;
  // A column of empty cells repeating under one header is a table, so the
  // header may sit far above its lower rows (FORM-34).
  const repeating = (emptyColumnCounts.get(columnKey(cell)) || 0) >= MIN_REPEATING_COLUMN_ROWS;
  if (caption.y0 - cell.top > LONE_CAPTION_GAP && !repeating) return null;
  if (caption.str.trim().length > MAX_LABEL_CHARS) return null;
  return undefined;
}

/**
 * Every cell no earlier resolver owns is a candidate text, date or signature
 * field, kept only when its text reads as a short label and a blank is left to
 * write in; it is last because it is the fallback for all the rest.
 *
 * @type {CellResolver}
 */
export function resolveGeneralCell(cell, { geometry, textItemsPoints, ownText }) {
  const ownStr = ownText.map((t) => t.str).join(' ').trim();
  const ownArea = ownText.reduce((sum, item) => sum + rectIntersectArea(cellRect(cell), item), 0);
  const cellArea = cell.width * cell.height;
  const coverage = cellArea > 0 ? ownArea / cellArea : 1;
  if (coverage > FULL_TEXT_COVERAGE) return null; // explanatory box, not an input
  // A paragraph is not a short label hugging an edge, whatever its coverage.
  if (ownStr.length > MAX_LABEL_CHARS) return null;
  // A checkbox glyph rendered as text: already covered by that checkbox.
  if (GLYPH_NOISE_RE.test(ownStr)) return null;

  const writable = writableArea(cell, ownText);
  if (!writable) return null;

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
  return {
    bounds, enclosureBounds, writableBounds, cell, kind, label, ownTextCount: ownText.length, coverage, closure: cell.closure,
  };
}

/** The resolvers in the order a cell is offered to them; the first with a verdict decides. */
const CELL_RESOLVERS = [resolveFloorTicked, resolveNarrowTick, resolveLoneSquare, resolveLoneBox, resolveGeneralCell];

/**
 * Closed-cell candidate fields on one page: the text/date/signature/table-cell
 * regions the comb/checkbox detector leaves alone.
 *
 * @param {{verticals: VerticalEdge[], horizontals: HorizontalRule[], rects: Array<object>}} ink
 * @param {import('#editor/geometry/coords.ts').PageGeometry} geometry
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
  // The FORM-34 repeating-column rule counts only cells with no text of their own.
  /** @type {Map<string, number>} */
  const emptyColumnCounts = new Map();
  for (const cell of closedCells) {
    if (textInsideCell(cell, textItemsPoints).length > 0) continue;
    const key = columnKey(cell);
    emptyColumnCounts.set(key, (emptyColumnCounts.get(key) || 0) + 1);
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
  const shared = { geometry, textItemsPoints, closedColumnCounts, emptyColumnCounts, columnKey, isStackedRow };
  for (const cell of closedCells) {
    const context = { ...shared, ownText: textInsideCell(cell, textItemsPoints) };
    for (const resolver of CELL_RESOLVERS) {
      const outcome = resolver(cell, context);
      if (outcome === undefined) continue; // not this resolver's cell: ask the next
      if (outcome) resolved.push(outcome);
      break; // resolved, or dropped by the resolver that owns it
    }
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
