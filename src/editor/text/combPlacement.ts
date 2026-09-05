import {
  COMB_MIN_CELL_EM,
  HELVETICA_BASELINE_OFFSET_EM,
  TEXT_BOX_PADDING_EM,
  MAX_COMB_CELLS,
  MIN_FONT_SIZE_PT,
} from '../../constants/signGeometry.js';

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

/** A detected comb run, in the editor's top-left-origin page percentages. */
export interface CombRegion {
  pageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
  cells: number;
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
 * The run a point falls in, or null.
 *
 * Ties break to the nearer centre, because two runs on the same rule sit edge
 * to edge (form 101's date fields share a wall) and a tap on that wall should
 * pick the field it is closer to the middle of rather than whichever the
 * detector happened to report first.
 */
export function combRegionAt(
  regions: CombRegion[],
  point: { x: number; y: number },
  pageIndex: number,
): CombRegion | null {
  const hits = regions.filter((region) => region.pageIndex === pageIndex
    && point.x >= region.left
    && point.x <= region.left + region.width
    && point.y >= region.top - HIT_BAND_ABOVE_PERCENT
    && point.y <= region.top + region.height + HIT_BAND_BELOW_PERCENT);
  if (hits.length === 0) return null;
  const distance = (region: CombRegion) => Math.abs(point.x - (region.left + region.width / 2));
  return hits.reduce((best, region) => (distance(region) < distance(best) ? region : best));
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
 * The vertical answer is the interesting one. A run's teeth hang *upward* from
 * the rule the field is written on, so in top-left-origin percentages the rule
 * is the run's bottom edge - and that is the line the digits' baselines belong
 * on, not the box's top. So the box is lifted by its own baseline offset,
 * which is what the exporter subtracts back off in `serializeText`.
 *
 * `left` is the run's left edge and stays the left edge whatever gets typed:
 * a comb's span is fixed by the paper, so unlike a growing text box it has no
 * anchored edge to flip. See `usesFixedSpan` in the registry's view flags.
 */
export function placeCombOnRegion(
  region: CombRegion,
  { fontSize, pageWidthPoints, pageHeightPoints }: {
    fontSize: number;
    pageWidthPoints: number;
    pageHeightPoints: number;
  },
): CombPlacement {
  const cells = Math.max(1, Math.min(MAX_COMB_CELLS, Math.round(region.cells)));
  const size = combFontSize(fontSize, region.width / cells, pageWidthPoints);
  const baselinePercent = region.top + region.height;
  const baselineOffsetPercent = pageHeightPoints > 0
    ? ((size * (HELVETICA_BASELINE_OFFSET_EM + TEXT_BOX_PADDING_EM)) / pageHeightPoints) * 100
    : 0;
  return {
    left: region.left,
    top: Math.max(0, baselinePercent - baselineOffsetPercent),
    width: region.width,
    combCells: cells,
    fontSize: size,
  };
}
