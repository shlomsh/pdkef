import {
  COMB_MIN_CELL_EM,
  HELVETICA_BASELINE_OFFSET_EM,
  MAX_COMB_CELLS,
  MIN_FONT_SIZE_PT,
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
