import { createPageGeometry, pagePercentToPdfPoint, toPagePercentBox } from '../../geometry/coords.ts';
import { collectPageInk, pageCropBox } from './pageInk.js';

/**
 * Closed table/box cells from vector ink (`pageInk.js`) that `formGrid.js`'s comb/checkbox
 * detector deliberately leaves alone, cross-referenced against page text for labels and
 * blank-vs-full classification.
 *
 * Ported from the MOBI-10 spike (`scripts/spike/mobi-10/cells.mjs`, kept as a thin CLI wrapper
 * over this module). See `scripts/spike/mobi-10/report-cells.md` for the measured recall on the
 * two spike forms and the seven documented failure classes still open.
 *
 * Deliberately NOT re-detecting combs or checkboxes: `formGrid.js` already gets those at 100%
 * precision on the spike forms. This module reports every closed cell it finds, including one
 * drawn around a comb; `fieldRegions.js` reconciles the two detectors' answers.
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
 * ## What a cell candidate's bounds are
 *
 * The strip a person writes in, not the ruled box around it. Form 101 rules
 * one box per field and prints the caption inside it, in a band above the
 * writing line: the box is `שם` plus the blank under it, and only the blank
 * is the field. Publishing the whole box put its bounds about half on the
 * caption - measured against the MOBI-10 ground truth, five of form 101's
 * labelled cells sat on a real target at IoU 0.44-0.49, just under the 0.5
 * match threshold, and scored as false positives on a field they had
 * correctly found. Publishing the band under the caption instead takes those
 * five to IoU 0.56-0.65 (page 1: recall 82.0% -> 85.6%, precision 92.7% ->
 * 96.7%, text recall 53.3% -> 70.0%, with no new miss or false positive on
 * either spike form).
 *
 * Only the *band* carve is trusted for this. `writableArea` can also carve
 * sideways, when a caption hugs the cell's right wall, and that carve is a
 * much weaker guess at how much of the page the field is: it read form 101's
 * three date cells (printed `/ /` separators that a person writes *across*,
 * not beside) and two of its phone cells as labels, and each time it left a
 * 40pt sliver against the left wall. Published as bounds those five went the
 * other way, IoU 0.54-0.74 down to 0.09-0.22, turning five true positives
 * into false ones. So a side carve still admits the cell - there is room to
 * write in it - and the whole cell is what gets published as its bounds.
 *
 * ## Where the typed box goes, which is a different question
 *
 * "How big is this field" and "where does an answer typed into it start" are
 * not the same question, and a side carve is a bad answer to the first and a
 * necessary one to the second. On an RTL form a box given the cell's whole
 * span starts its text at the span's *right* edge (`getTextAlign` -> the
 * exporter's pen) - which is the wall the caption is printed against, so the
 * answer runs straight across the caption, in the export as much as on
 * screen. So a side-carved cell publishes the blank strip as `writable`:
 * bounds unchanged, placement kept off the printed caption
 * (`placeTextOnCell`).
 *
 * Unless its own text is not a caption at all. Form 101's date cells print
 * `/  /`, and a person writes the day, month and year *across* those marks,
 * not beside them - nothing in the cell is spoken for, and the typed box
 * wants all of it. `isPrintedSeparators` is that test, the same fact
 * `classifyKind` already calls such a cell a date by, and the same test
 * keeps a separator printed *beside* a caption out of the caption: form 101's
 * two lower phone cells print an area-code `/` under theirs, and their typed
 * box is the band under the caption at the cell's whole width (w28.94,
 * w26.13), not the sliver left of the slash (`typingStrip`). The three `/ /`
 * date cells keep the whole w12.35 span.
 *
 * The ruled box does not disappear either: it rides along as `enclosure`
 * whenever it differs from the bounds, and both of the questions asked about
 * a field as a whole are asked of it - the hit test (a tap that lands on the
 * printed caption is still a tap on that field, `cellRegionAt`) and the claim
 * test that reconciles the two detectors (`fieldRegions.js`'s `claimExtent`).
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
/**
 * A band may span at most this many page-wide rule heights between its top and bottom. A real
 * row is crossed by a handful of stray heights from boxes beside it, not dozens; the cap keeps a
 * dense hatch (hundreds of rules at a 1pt pitch) from pairing every height with every other.
 * The busiest band that closes a cell on the scored corpus has 7.
 */
const MAX_HEIGHTS_BETWEEN = 12;
/** A column narrower than this is a rule gap, not a cell anyone could write in. */
const MIN_CELL_WIDTH = 15;

/**
 * A captioned cell sitting directly above this many identical, empty rows in
 * its own column is a table's header, not a field - see `emptyRowRunBelow`.
 * Two is the smallest number that is a repeat rather than a coincidence: one
 * blank cell below a caption is exactly the ordinary "label above a blank
 * answer" shape the detector is supposed to find (`headerAbove`'s whole
 * job), and only a *second* identical blank row beneath the first rules that
 * out. Measured (FORM-13) over every page of every scored form, it drops
 * five cells and all five are headings: on itc101's first page the children
 * table's "מספר זהות" and "שם" (a 13-row run below) and the letter-spaced
 * "השינויים בפרטי" title, on its second page the "כתובת" and "שם" column
 * captions. 2 and 3 drop the same five.
 */
const MIN_HEADER_RUN = 2;
/** Bounds `emptyRowRunBelow`'s walk down a column; no scored table has close to this many rows. */
const MAX_HEADER_RUN_WALK = 60;

/**
 * A ruled cell narrower than `MIN_CELL_WIDTH` is a tick target rather than a
 * place to write a word - form 101 rules its children table as 13 rows of
 * 6.3pt and 8.1pt columns a person ticks, and a width floor written for
 * free-text cells cannot see any of them (MOBI-11: 26 of that form's 43
 * missed fields are exactly these).
 *
 * What keeps the lower floor from admitting every incidental gap is the
 * column, not the width: a tick cell belongs to a printed column that repeats
 * down the table, while the gaps between the dashes of a leader line - the
 * failure class this floor was raised to exclude - land at a different x on
 * every row and so never recur.
 */
const MIN_TICK_CELL_WIDTH = 6;
const MIN_TICK_COLUMN_ROWS = 3;
/** The blank remainder (after any hugging label) must be at least this large. */
const MIN_BLANK_WIDTH = 25;
const MIN_BLANK_HEIGHT = 8;
/** A cell whose own text covers more of its area than this is explanatory, not fillable. */
const FULL_TEXT_COVERAGE = 0.4;
/** How far above a cell to look for a column header, in points. */
const HEADER_SEARCH_HEIGHT = 220;

// ---------------------------------------------------------------------------
// Ink normalization - the same folding formGrid.js does (rect sides publish as vertical
// edges, rect top/bottom as horizontal rules), extended to full rectangles too (a table
// cell can be drawn as a filled box, not just ruled).
// ---------------------------------------------------------------------------

/**
 * A fill with no stroke that is larger than any row both ways is a tinted background panel, not
 * a box: its sides are where the tint stops, not ruled walls. Form 1040 paints its whole body as
 * one 492x666pt fill, and its left side at x=91.6 would otherwise split every field it crosses.
 * Form 101's large frames are stroked, so they keep their walls.
 */
function isBackgroundPanel(rect) {
  return rect.filled && !rect.stroked && rect.width > MAX_ROW_HEIGHT && rect.height > MAX_ROW_HEIGHT;
}

function verticalEdgesAll(ink) {
  const edges = ink.verticals.map((edge) => ({ ...edge }));
  for (const rect of ink.rects) {
    if (isBackgroundPanel(rect)) continue;
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
    if (isBackgroundPanel(rect)) continue;
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
 * Rows are scoped per column. Rule heights are collected page-wide, but a cell's top and bottom
 * are the nearest rules *that cross its own column*: a band may span several page-wide rule
 * heights, and a column in it yields a cell only when rules at the band's top and bottom heights
 * cross it and no rule at a height in between reaches it. So a stray rule from a box off to the
 * side (form 101's children table, whose rows the boxes to their left cut at y=450.42 and
 * friends) no longer splits a row it never touches, and a cell is still atomic within its own
 * column. For a band between adjacent heights nothing is in between and this is the plain
 * adjacent-pair walk.
 *
 * Every test here looks at the rules *at* a height (within POS_TOLERANCE, the tolerance the
 * heights were merged with), not at ruledCoverage's wider BAND_TOLERANCE window:
 * - The band's own top and bottom must be crossed by a rule at that height. Otherwise a height
 *   1.3pt inside a row (the top of a radio square beside it, on the health declaration) closes
 *   the row's other columns short of their real rule, which the window would accept.
 * - A rule in between vetoes a column it crosses or ends against (within POS_TOLERANCE of either
 *   wall). One ending against a wall marks a junction there: the wall belongs to a smaller box
 *   beside the column, and the column is not one cell at this band. On the health declaration
 *   that is the sliver between the table's frame and each radio square, whose right wall is the
 *   square's side.
 * - In a taller band a rule at a height just outside it vetoes a column it crosses, so a column
 *   whose real edge is a rule 1.3pt past the band does not close on the band instead. Only one
 *   that crosses: a neighbour's row rule a little lower, ending against the shared wall, is an
 *   ordinary misaligned row, not a split.
 * - A rule within POS_TOLERANCE of the band's own top or bottom is that edge, never a veto. With
 *   the window, a stray height 1.2pt from the top read the top rule itself as crossing every
 *   column and dropped the whole row.
 *
 * Cost: rules are bucketed by height once, O(heights x rules). A top pairs with at most
 * MAX_HEIGHTS_BETWEEN + 1 bottoms, and each band costs a pass over the vertical edges plus, per
 * column, the rules at its own few heights, so the walk is O(heights x MAX_HEIGHTS_BETWEEN x
 * (edges + columns x rules-at-the-band's-heights)), never every rule on the page per band.
 */
function buildClosedCells(ink) {
  const edges = verticalEdgesAll(ink);
  const rules = horizontalRulesAll(ink);
  const ys = distinctPositions(rules.map((r) => r.y), POS_TOLERANCE).sort((a, b) => b - a);
  // Per height: the rules close enough to bound a band there, and the rules actually at it.
  const nearRules = ys.map((y) => rules.filter((rule) => Math.abs(rule.y - y) <= BAND_TOLERANCE));
  const rulesAt = nearRules.map((near, m) => near.filter((rule) => Math.abs(rule.y - ys[m]) <= POS_TOLERANCE));

  const cells = [];
  for (let i = 0; i < ys.length - 1; i += 1) {
    const top = ys[i];
    for (let k = i + 1; k < ys.length; k += 1) {
      const bottom = ys[k];
      const height = top - bottom;
      if (height > MAX_ROW_HEIGHT || k - i - 1 > MAX_HEIGHTS_BETWEEN) break;
      if (height < MIN_ROW_HEIGHT) continue;

      // Rules that veto a column: those in between for any column they reach, those just
      // outside for one they cross. ys is sorted, so the heights just outside are index
      // neighbours.
      const inside = [];
      const outside = [];
      if (k - i > 1) {
        const ownEdge = (rule) => Math.abs(rule.y - top) <= POS_TOLERANCE
          || Math.abs(rule.y - bottom) <= POS_TOLERANCE;
        const collect = (list, m) => { for (const rule of rulesAt[m]) if (!ownEdge(rule)) list.push(rule); };
        for (let m = i + 1; m < k; m += 1) collect(inside, m);
        for (let m = i - 1; m >= 0 && ys[m] - top <= BAND_TOLERANCE; m -= 1) collect(outside, m);
        for (let m = k + 1; m < ys.length && bottom - ys[m] <= BAND_TOLERANCE; m += 1) collect(outside, m);
      }

      const bandEdges = edges.filter((edge) => edge.y1 > bottom - BAND_TOLERANCE && edge.y0 < top + BAND_TOLERANCE);
      const bandEdgeX = bandEdges
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
        if (width < MIN_TICK_CELL_WIDTH) continue;
        const crosses = (rule) => rule.x0 < right && rule.x1 > left;
        const reaches = (rule) => rule.x0 < right + POS_TOLERANCE && rule.x1 > left - POS_TOLERANCE;
        if (!rulesAt[i].some(crosses) || !rulesAt[k].some(crosses)) continue;
        if (inside.some(reaches) || outside.some(crosses)) continue;

        const topCoverage = ruledCoverage(nearRules[i], top, left, right);
        const bottomCoverage = ruledCoverage(nearRules[k], bottom, left, right);
        if (topCoverage < CLOSED_EDGE_COVERAGE || bottomCoverage < CLOSED_EDGE_COVERAGE) continue;

        const leftCoverage = verticalCoverage(bandEdges, left, bottom, top);
        const rightCoverage = verticalCoverage(bandEdges, right, bottom, top);
        if (leftCoverage < CLOSED_EDGE_COVERAGE || rightCoverage < CLOSED_EDGE_COVERAGE) continue;

        const closure = Math.min(topCoverage, bottomCoverage, leftCoverage, rightCoverage);
        cells.push({ left, right, bottom, top, width, height, closure, narrow: width < MIN_CELL_WIDTH });
      }
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

/**
 * How many contiguous, identical, empty rows sit directly beneath `cell` in
 * its own column - FORM-13's header signal.
 *
 * A table column header and a one-off labelled field print the same shape
 * (a caption, then blank space to write in): what tells them apart is not
 * the caption, it is what continues below it. Walks down from `cell`,
 * requiring at each step a closed cell whose left and right walls match
 * `cell`'s own (`POS_TOLERANCE`, the same window `buildClosedCells` used to
 * decide they are one column), whose top meets the running bottom
 * (`BAND_TOLERANCE`, stacked with no gap), whose height matches the row
 * before it (also `BAND_TOLERANCE` - a table's rows are cut from the same
 * ruling, a coincidence of adjacent unrelated boxes is not), and which holds
 * no own text at all. The walk stops at the first row that fails any of
 * these, or at `MAX_HEADER_RUN_WALK`.
 *
 * "Empty" is deliberately just "no own text" here, not "not narrow": a
 * narrow tick column's header is already dropped before this runs (a narrow
 * cell with any own text is rejected outright, see the `cell.narrow` branch
 * in `detectCellCandidates`), so this only ever walks the free-text columns
 * a table like itc101's children table prints beside its tick columns.
 */
function emptyRowRunBelow(cell, closedCells, textItems) {
  let run = 0;
  let cursorBottom = cell.bottom;
  let refHeight = null;
  for (let i = 0; i < MAX_HEADER_RUN_WALK; i += 1) {
    const next = closedCells.find((c) => c !== cell
      && Math.abs(c.left - cell.left) <= POS_TOLERANCE
      && Math.abs(c.right - cell.right) <= POS_TOLERANCE
      && Math.abs(c.top - cursorBottom) <= BAND_TOLERANCE
      && (refHeight === null || Math.abs(c.height - refHeight) <= BAND_TOLERANCE));
    if (!next || textInsideCell(next, textItems).length > 0) break;
    run += 1;
    refHeight = next.height;
    cursorBottom = next.bottom;
  }
  return run;
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

/**
 * Is a cell's own printed text separators a person writes *across*, rather
 * than a caption they have to write beside?
 *
 * One fact, two consequences, and they are the same fact twice. A cell
 * printed `/  /` is a date; it is a date *because* those marks are part of
 * the answer's own shape - the day goes before the first slash, the month
 * between them - so no part of the cell belongs to the printing and a typed
 * box may take all of it. A cell printed `מספר טלפון` is captioned, the
 * caption keeps its corner of the cell, and an answer has to start clear of
 * it. `GLYPH_NOISE_RE` above is the same idea for a third kind of own text
 * (checkbox glyphs, dropped outright rather than written on or beside).
 */
function isPrintedSeparators(ownStr) {
  return ownStr.length > 0 && SLASH_DATE_RE.test(ownStr);
}

/**
 * Where a typed box goes in a side-carved cell: the strip beside its caption,
 * found from the caption alone, or null for the whole cell.
 *
 * The separators are left out of that hunt for the same reason a `/  /` cell
 * keeps its whole span: a person writes across them. Form 101's two lower
 * phone cells print `מספר טלפון` in the top corner and a lone `/` (the area
 * code's) low in the middle; counting the slash as caption made it the
 * caption's left edge and its bottom, so the carve went sideways and the
 * typed box was the 40pt sliver left of the slash (w6.72, w5.60 of the page)
 * where the cell is w28.94 and w26.13. On the caption alone the carve is a
 * band, and the box takes the cell's whole width under the caption.
 */
function typingStrip(cell, ownText, sideStrip) {
  const caption = ownText.filter((t) => t.str.trim() && !isPrintedSeparators(t.str.trim()));
  if (caption.length === 0) return null;
  if (caption.length === ownText.length) return sideStrip;
  return writableArea(cell, caption)?.area ?? sideStrip;
}

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
 * when it is empty, the strip under a label in its top corner, the strip
 * beside a label that only hugs its right wall, or null when no clean strip
 * of a usable size is left (a caption centred in a decorative cell, a cell
 * too small to write in). Never an L shape: a right-aligned answer belongs
 * against the cell's own right wall, not the label's left.
 *
 * Returns `{area, carve}`: `area` is `cell` itself when the whole cell is
 * writable, so a caller can tell "no label" from "a strip", and `carve` says
 * which way the label carved it - a caption sitting in a `band` above the
 * writing line, or a caption at the `side` of it. The two are not equally
 * trustworthy as a published box; see "What a cell candidate's bounds are"
 * in the module docstring.
 */
function writableArea(cell, ownText) {
  let area = cell;
  let carve = 'none';
  if (ownText.length > 0) {
    const textLeft = Math.min(...ownText.map((t) => t.x0));
    // A pdf.js item's box starts at its baseline, so this is the label's baseline.
    const textBottom = Math.min(...ownText.map((t) => t.y0));
    const rightHug = Math.max(...ownText.map((t) => t.x1)) >= cell.left + cell.width * 0.5;
    const topHug = textBottom >= cell.bottom + cell.height * 0.5;
    if (topHug && textBottom - cell.bottom >= MIN_BLANK_HEIGHT) {
      area = { ...cell, top: textBottom };
      carve = 'band';
    } else if (rightHug && textLeft - cell.left >= MIN_BLANK_WIDTH) {
      area = { ...cell, right: textLeft };
      carve = 'side';
    } else return null;
  }
  const width = area.right - area.left;
  const height = area.top - area.bottom;
  return width >= MIN_BLANK_WIDTH && height >= MIN_BLANK_HEIGHT ? { area, carve } : null;
}

/**
 * Honest and below the comb detector's 0.8: rewarded for fully closed
 * geometry and a label; a date/signature matched a keyword, not just geometry.
 */
function confidenceOf(resolved, kind) {
  let confidence = 0.45;
  if (resolved.closure >= 0.95) confidence += 0.1;
  if (resolved.label) confidence += 0.1;
  if (kind !== 'text') confidence += 0.05;
  return Math.min(confidence, 0.7);
}

/**
 * @typedef {{left: number, top: number, width: number, height: number}} PercentBox
 * @typedef {PercentBox & {str: string}} PageTextRun
 * @typedef {PercentBox & {kind: string, enclosure?: PercentBox, writable?: PercentBox}} FieldCandidate
 */

/**
 * Closed-cell candidate fields on one page: text/date/signature/table-cell regions the
 * comb/checkbox detector deliberately leaves alone.
 *
 * @param {{verticals: Array, horizontals: Array, rects: Array}} ink
 * @param {import('../../geometry/coords.ts').PageGeometry} geometry
 * @param {number} pageIndex
 * @param {PageTextRun[]} textItems page text, page-percent bounds
 */
export function detectCellCandidates(ink, geometry, pageIndex, textItems) {
  const textItemsPoints = textItems.map((item) => textItemToPoints(item, geometry));
  const closedCells = buildClosedCells(ink);

  // Counted over every closed cell rather than the survivors below, because a tick column is
  // admitted by the fact that it repeats and the filters it has to pass come after.
  const columnKey = (c) => `${Math.round(c.left)}|${Math.round(c.right)}`;
  const closedColumnCounts = new Map();
  for (const cell of closedCells) {
    const key = columnKey(cell);
    closedColumnCounts.set(key, (closedColumnCounts.get(key) || 0) + 1);
  }

  // First pass: geometry + text classification; the column-repeat count
  // (table-cell vs text) below needs the whole population.
  const resolved = [];
  for (const cell of closedCells) {
    const ownText = textInsideCell(cell, textItemsPoints);
    if (cell.narrow) {
      // Too narrow to hold a label or a written answer, so the text tests below say nothing
      // about it: a tick cell is admitted by its column and disqualified by any text at all.
      if (ownText.length > 0) continue;
      if ((closedColumnCounts.get(columnKey(cell)) || 0) < MIN_TICK_COLUMN_ROWS) continue;
      resolved.push({
        bounds: toPagePercentBox(geometry, {
          x0: cell.left, y0: cell.bottom, x1: cell.right, y1: cell.top,
        }),
        enclosureBounds: undefined,
        writableBounds: undefined,
        cell,
        kind: 'checkbox',
        label: headerAbove(cell, textItemsPoints)?.str?.trim(),
        ownTextCount: 0,
        coverage: 0,
        closure: cell.closure,
      });
      continue;
    }
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

    const writable = writableArea(cell, ownText);
    if (!writable) continue;

    // A side-carved caption over a run of identical empty rows is the column's heading, not a
    // label beside a blank (FORM-13, `emptyRowRunBelow`). Only the side carve: a band carve
    // already publishes the blank under its caption as the field. A printed `/  /` is not a
    // caption, for the same reason `typingStrip` ignores it.
    if (writable.carve === 'side' && !isPrintedSeparators(ownStr)
      && emptyRowRunBelow(cell, closedCells, textItemsPoints) >= MIN_HEADER_RUN) {
      continue;
    }

    const header = headerAbove(cell, textItemsPoints);
    const label = ownText.length > 0 ? ownStr : header?.str?.trim();
    const kind = classifyKind(ownText, label);

    // The field is the writing strip, not the ruled box around it - but only
    // the caption-band carve is trusted to say where that strip is. See
    // "What a cell candidate's bounds are" in the module docstring.
    const field = writable.carve === 'band' ? writable.area : cell;
    const bounds = toPagePercentBox(geometry, {
      x0: field.left, y0: field.bottom, x1: field.right, y1: field.top,
    });
    const enclosureBounds = field === cell ? undefined : toPagePercentBox(geometry, {
      x0: cell.left, y0: cell.bottom, x1: cell.right, y1: cell.top,
    });
    // A side carve is not trusted as bounds, but it is still where a typed box
    // belongs: see "Where the typed box goes" in the module docstring. Printed
    // separators are not a caption - a person writes the date across `/  /` -
    // so that cell publishes no strip and keeps the whole span.
    const strip = writable.carve === 'side' ? typingStrip(cell, ownText, writable.area) : null;
    const writableBounds = strip
      ? toPagePercentBox(geometry, { x0: strip.left, y0: strip.bottom, x1: strip.right, y1: strip.top })
      : undefined;
    resolved.push({
      bounds, enclosureBounds, writableBounds, cell, kind, label, ownTextCount: ownText.length, coverage, closure: cell.closure,
    });
  }

  // table-cell vs text: a column that recurs across >=3 row bands (same left/right within
  // POS_TOLERANCE) is a real repeating table row; a one-off labelled field (the common case
  // here - a header row over one blank data row) stays `text`.
  const columnCounts = new Map();
  for (const r of resolved) {
    const key = columnKey(r.cell);
    columnCounts.set(key, (columnCounts.get(key) || 0) + 1);
  }

  const candidates = [];
  let index = 0;
  for (const r of resolved) {
    const kind = r.kind === 'text' && columnCounts.get(columnKey(r.cell)) >= 3 ? 'table-cell' : r.kind;

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
 * Closed-cell candidate fields on a pdf-lib page. On-device and read-only: the page is walked,
 * never modified.
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
