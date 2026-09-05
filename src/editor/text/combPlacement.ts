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
 * A symbol sized to the checkbox it was tapped on.
 *
 * The size question a person otherwise answers by placing a mark and dragging
 * it until it looks right is answered by the paper: the detector reports the
 * printed square's real width and height, and both are already in the model's
 * own percentage units, so there is nothing to convert and no aspect ratio to
 * guess. Unlike the comb this needs no font metrics at all, which is why it
 * cannot drift when the font changes afterwards.
 */
export function placeSymbolOnRegion(region: FieldRegion): {
  left: number; top: number; width: number; height: number;
} {
  return {
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
  };
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
  { fontSize, fontFamily, pageWidthPoints, pageHeightPoints }: {
    fontSize: number;
    fontFamily: string;
    pageWidthPoints: number;
    pageHeightPoints: number;
  },
): CombPlacement {
  const cells = Math.max(1, Math.min(MAX_COMB_CELLS, Math.round(region.cells)));
  const size = combFontSize(fontSize, region.width / cells, pageWidthPoints);
  const baselinePercent = region.top + region.height;
  const baselineOffsetPercent = pageHeightPoints > 0
    ? ((size * baselineDropEm(fontFamily)) / pageHeightPoints) * 100
    : 0;
  return {
    left: region.left,
    top: Math.max(0, baselinePercent - baselineOffsetPercent),
    width: region.width,
    combCells: cells,
    fontSize: size,
  };
}
