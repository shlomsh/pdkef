import {
  COMB_MIN_CELL_EM,
  HELVETICA_BASELINE_OFFSET_EM,
  MAX_COMB_CELLS,
  MIN_FONT_SIZE_PT,
  TEXT_BOX_LINE_HEIGHT_EM,
} from '../../constants/signGeometry.js';
import {
  FONT_VERTICAL_METRICS,
  baselineOffsetEmFromMetrics,
  textBoxPaddingEm,
} from './fonts.js';

/**
 * Turning a detected printed grid into a text element that fills it.
 *
 * MOBI-03 finds where the boxes are; this decides what a text element has to
 * look like to sit in them. `comb.js` already owns where each character lands
 * *inside* a span, for both the editor and the exporter - so the only thing
 * left is the span itself, and that is what a person otherwise sets by
 * dragging a side handle until nine digits happen to land in nine boxes.
 *
 * Nothing here is a second source of truth. The element it describes is an
 * ordinary text element with `width` and `combCells` set, so `isComb` stays
 * derived from `width` exactly as before.
 */

/** Any detected printed field, in the editor's top-left-origin page percentages. */
export interface FieldRegion {
  pageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A detected comb run: a ruled strip divided into `cells` equal boxes. */
export interface CombRegion extends FieldRegion {
  cells: number;
  /** True when the cells are closed boxes rather than teeth on a writing line. */
  boxed?: boolean;
}

/**
 * How far below a text box's top edge its glyph baselines sit, in em.
 *
 * This is the number the exporter subtracts back off in `serializeText`, and
 * it is font-specific in both halves: the baseline offset comes from the
 * family's real ascent and descent, and the box's padding is whatever that
 * family's overhang needs. Reaching for the Helvetica fallback instead put a
 * comb about a point low on Arimo, which is invisible on free-placed text and
 * very visible when the printed rule then cuts across the digits.
 */
export function baselineDropEm(fontFamily: string): number {
  const metrics = FONT_VERTICAL_METRICS[fontFamily];
  const offset = metrics
    ? baselineOffsetEmFromMetrics(metrics.ascent, metrics.descent)
    : HELVETICA_BASELINE_OFFSET_EM;
  return offset + textBoxPaddingEm(fontFamily);
}

/**
 * How far the middle of a font's em box sits below its baseline, in em.
 *
 * Used to centre text in a closed cell: the em box runs from `ascent` above
 * the baseline to `descent` below it, so its middle is this far down, and
 * putting *that* on the cell's middle is what centres the digits. Falls back
 * to half the Helvetica line for a family with no bundled metrics.
 */
function emBoxCentreBelowBaselineEm(fontFamily: string): number {
  const metrics = FONT_VERTICAL_METRICS[fontFamily];
  if (!metrics) return 0;
  return (metrics.ascent - metrics.descent) / 2;
}

/** A field a text box can be typed into, tagged with the detector it came from. */
export type TypableField =
  | { kind: 'comb'; region: CombRegion }
  | { kind: 'cell'; region: FieldRegion };

export interface CombPlacement {
  left: number;
  top: number;
  width: number;
  combCells: number;
  fontSize: number;
}

/**
 * How far above and below the printed rule a tap still counts as hitting it.
 *
 * The ink of a comb is a row of teeth about 4pt tall on an A4 page - well
 * under a finger. The target has to be the *field*, which is the strip a
 * person would write in, so the hit area is grown to a comfortable band around
 * the rule rather than the ink's own height. Expressed in page percent so it
 * does not depend on zoom.
 */
const HIT_BAND_ABOVE_PERCENT = 1.4;
const HIT_BAND_BELOW_PERCENT = 0.6;

/**
 * A checkbox is 6.6pt square on the health declaration - about a millimetre and
 * a half, and far under a fingertip. Its hit area is grown symmetrically to
 * something tappable; overlaps between neighbours are resolved by picking the
 * nearer centre rather than by shrinking the target back down.
 */
const CHECKBOX_HIT_MARGIN_X_PERCENT = 0.7;
const CHECKBOX_HIT_MARGIN_Y_PERCENT = 0.5;

/**
 * The region a point falls in, or null.
 *
 * Ties break to the nearer centre, because detected fields sit edge to edge:
 * form 101's two date fields share a wall, and the health declaration's yes/no
 * checkboxes are a few points apart. A tap between two of them should pick the
 * one it is closer to the middle of, not whichever the detector reported first.
 */
function regionAt<T extends FieldRegion>(
  regions: T[],
  point: { x: number; y: number },
  pageIndex: number,
  margin: { top: number; bottom: number; sides: number },
): T | null {
  const hits = regions.filter((region) => region.pageIndex === pageIndex
    && point.x >= region.left - margin.sides
    && point.x <= region.left + region.width + margin.sides
    && point.y >= region.top - margin.top
    && point.y <= region.top + region.height + margin.bottom);
  if (hits.length === 0) return null;
  const distance = (region: T) => Math.hypot(
    point.x - (region.left + region.width / 2),
    point.y - (region.top + region.height / 2),
  );
  return hits.reduce((best, region) => (distance(region) < distance(best) ? region : best));
}

export function combRegionAt(
  regions: CombRegion[],
  point: { x: number; y: number },
  pageIndex: number,
): CombRegion | null {
  return regionAt(regions, point, pageIndex, {
    top: HIT_BAND_ABOVE_PERCENT,
    bottom: HIT_BAND_BELOW_PERCENT,
    sides: 0,
  });
}

export function checkboxRegionAt(
  regions: FieldRegion[],
  point: { x: number; y: number },
  pageIndex: number,
): FieldRegion | null {
  return regionAt(regions, point, pageIndex, {
    top: CHECKBOX_HIT_MARGIN_Y_PERCENT,
    bottom: CHECKBOX_HIT_MARGIN_Y_PERCENT,
    sides: CHECKBOX_HIT_MARGIN_X_PERCENT,
  });
}

/**
 * A detected free-text cell (MOBI-11's `formCells.js`: a name, an address
 * line, a date written on a blank line - a closed printed cell with no comb
 * teeth and no fixed pitch) is already a real, usually multi-word-sized
 * rectangle, unlike a checkbox. This margin is just forgiveness for tap and
 * measurement imprecision, not a "smaller than a fingertip" correction.
 */
const CELL_HIT_MARGIN_PERCENT = 0.5;

export function cellRegionAt(
  regions: FieldRegion[],
  point: { x: number; y: number },
  pageIndex: number,
): FieldRegion | null {
  return regionAt(regions, point, pageIndex, {
    top: CELL_HIT_MARGIN_PERCENT,
    bottom: CELL_HIT_MARGIN_PERCENT,
    sides: CELL_HIT_MARGIN_PERCENT,
  });
}

/**
 * The largest font size whose characters still fit the printed cell.
 *
 * A comb whose cells are narrower than the characters in them has stopped
 * doing the one thing it exists for - the same rule `combWidthFloor` enforces
 * from the other direction when a side handle is dragged. Here the cell width
 * is fixed by the paper, so it is the font that has to give: someone whose
 * last text box was 24pt should not get a 24pt comb in an 11.3pt cell.
 */
export function combFontSize(
  preferredSize: number,
  cellWidthPercent: number,
  pageWidthPoints: number,
): number {
  const cellPoints = (cellWidthPercent / 100) * pageWidthPoints;
  if (!(cellPoints > 0)) return preferredSize;
  const ceiling = cellPoints / COMB_MIN_CELL_EM;
  return Math.max(MIN_FONT_SIZE_PT, Math.min(preferredSize, ceiling));
}

/**
 * The largest font size whose one-line box still fits the printed cell's
 * height.
 *
 * A free-text cell's `minWidth` (see `placeTextOnCell`) only ever grows the
 * box past the cell horizontally, the same way a hand-placed box grows - the
 * printed columns either side of it are somebody else's field, but there is
 * no printed rule stopping the box from widening into blank margin. Its
 * *height* has no such give: the row above and the row below are both real
 * fields too, so a box taller than the row it was placed on doesn't grow
 * past a boundary, it visibly sits on top of the next one. Someone whose
 * last text box was 24pt should not get a 24pt box in an 8pt-tall column.
 *
 * `TEXT_BOX_LINE_HEIGHT_EM` is the same one-line-box-height figure a raw
 * (unsnapped) tap already centres itself by, so a cell taller than that at
 * the preferred size changes nothing - this only ever shrinks, never grows,
 * a box past what a plain click would have given it.
 */
export function cellFontSize(
  preferredSize: number,
  cellHeightPercent: number,
  pageHeightPoints: number,
): number {
  const cellPoints = (cellHeightPercent / 100) * pageHeightPoints;
  if (!(cellPoints > 0)) return preferredSize;
  const ceiling = cellPoints / TEXT_BOX_LINE_HEIGHT_EM;
  return Math.max(MIN_FONT_SIZE_PT, Math.min(preferredSize, ceiling));
}

/**
 * Where a freshly placed text box sits on a detected free-text cell.
 *
 * The box takes the cell's whole span as `minWidth` - never `width`, which
 * is what makes a box a comb (`comb.js`'s `isComb` is derived from `width`
 * alone, see its docstring), so a name typed into it would have snapped one
 * letter per imaginary cell the moment a second letter arrived. With a
 * minimum width instead, the box fills the cell edge to edge, lays its text
 * out as plain text aligned to the reading direction's start edge (the
 * editor's `dir`/`text-align`, the exporter's pen), and grows past the cell
 * only if more is typed than fits - the same way a free box grows.
 *
 * The font size is `cellFontSize`'s answer, not whatever was last used: a
 * short row (an e-ticket's "Status" column, one line of ~9pt) given a
 * remembered 24pt box would render past its own row into the one below it,
 * same defect class `combFontSize` already guards a comb's cells against.
 *
 * `left` is the cell's left edge whichever way the text reads: a box with a
 * span has no growing edge to anchor (see signHelpers' `textAnchorsRightEdge`),
 * so unlike a free RTL box its `left` is always the physical left. `top` is
 * the cell's middle less half the (possibly shrunk) box's own height, the
 * same re-centring a raw tap gets, so the vertical result is identical to a
 * tap landing exactly on the cell's middle. The box's own padding
 * (`textBoxPaddingEm`) keeps the glyphs off the printed rule, so no extra
 * inset is applied.
 */
export function placeTextOnCell(
  region: FieldRegion,
  { fontSize, pageHeightPoints }: { fontSize: number; pageHeightPoints: number },
): { left: number; top: number; minWidth: number; fontSize: number } {
  const size = cellFontSize(fontSize, region.height, pageHeightPoints);
  const em = pageHeightPoints > 0 ? (size / pageHeightPoints) * 100 : 0;
  const textHeight = em * TEXT_BOX_LINE_HEIGHT_EM;
  return {
    left: region.left,
    top: Math.max(0, region.top + region.height / 2 - textHeight / 2),
    minWidth: region.width,
    fontSize: size,
  };
}

/**
 * Where a text element has to sit to fill a detected run.
 *
 * The vertical answer is the interesting one, and it has two cases the two
 * evidence forms happen to split between them. Form 101 rules a line and hangs
 * short teeth up from it, so the line is what you write *on* and the digits'
 * baselines belong exactly there. The health declaration draws each cell as a
 * closed box, where there is no writing line and the digits belong in the
 * middle. `region.boxed` is the detector's answer to which, taken from whether
 * the page rules the run's top edge as well as its bottom.
 *
 * Either way the box is then lifted by its own baseline drop, which is what
 * the exporter subtracts back off in `serializeText`.
 *
 * `left` is the run's left edge and stays the left edge whatever gets typed:
 * a comb's span is fixed by the paper, so unlike a growing text box it has no
 * anchored edge to flip. See `usesFixedSpan` in the registry's view flags.
 */
export function placeCombOnRegion(
  region: CombRegion,
  { fontSize, fontFamily, pageWidthPoints, pageHeightPoints }: {
    fontSize: number;
    fontFamily: string;
    pageWidthPoints: number;
    pageHeightPoints: number;
  },
): CombPlacement {
  const cells = Math.max(1, Math.min(MAX_COMB_CELLS, Math.round(region.cells)));
  const size = combFontSize(fontSize, region.width / cells, pageWidthPoints);
  const em = pageHeightPoints > 0 ? (size / pageHeightPoints) * 100 : 0;
  // A closed cell is a box and text belongs in the middle of it; an open one is
  // a row of teeth hanging from the line you write on, and text belongs on that
  // line. Centring in the first case means putting the font's em-box middle on
  // the cell's middle, which is the same thing your eye does.
  const baselinePercent = region.boxed
    ? region.top + region.height / 2 + em * emBoxCentreBelowBaselineEm(fontFamily)
    : region.top + region.height;
  return {
    left: region.left,
    top: Math.max(0, baselinePercent - em * baselineDropEm(fontFamily)),
    width: region.width,
    combCells: cells,
    fontSize: size,
  };
}

/**
 * The geometry a text box takes to sit on a detected field, whichever kind it
 * is - the one place a tap on a field (useWorkspaceGestures) and a Next/
 * Previous move onto one (the coming useFieldNavigation) both get it from, so
 * the two can never drift apart. A comb takes the run's span, cell count and
 * combFontSize's answer; a cell takes placeTextOnCell's answer (its left
 * edge, vertical middle re-centred on the box's own possibly-shrunk height,
 * and cellFontSize's answer) - neither kind needs a `direction` any more:
 * a comb's span is fixed by the paper (no anchored edge to flip) and a cell
 * box is left-anchored with a minimum width for the same reason (see
 * signHelpers' `textAnchorsRightEdge`), so which edge the text reads toward
 * is purely a rendering/export question, never a placement one.
 */
export function placeTextOnField(
  field: TypableField,
  { fontSize, fontFamily, pageWidthPoints, pageHeightPoints }: {
    fontSize: number;
    fontFamily: string;
    pageWidthPoints: number;
    pageHeightPoints: number;
  },
): CombPlacement | { left: number; top: number; minWidth: number; fontSize: number } {
  return field.kind === 'comb'
    ? placeCombOnRegion(field.region, { fontSize, fontFamily, pageWidthPoints, pageHeightPoints })
    : placeTextOnCell(field.region, { fontSize, pageHeightPoints });
}
