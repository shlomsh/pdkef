import {
  COMB_BOX_FILL,
  COMB_CAP_HEIGHT_EM,
  COMB_MIN_CELL_EM,
  DEFAULT_FONT_SIZE_PT,
  FIELD_FONT_FILL_RATIO,
  FIELD_FONT_MAX_PT,
  HELVETICA_BASELINE_OFFSET_EM,
  MAX_COMB_CELLS,
  MIN_FONT_SIZE_PT,
  TEXT_BOX_LINE_HEIGHT_EM,
  TEXT_BOX_PADDING_EM,
} from '../../constants/signGeometry.js';
import {
  FONT_VERTICAL_METRICS,
  baselineOffsetEmFromMetrics,
  figureCentreEm,
  resolveFontFamily,
  textBoxPaddingEm,
} from './fonts.js';

/**
 * Turning a detected printed grid into a text element that fills it.
 *
 * `comb.js` owns where each character lands inside a span; this decides the span. The element is an
 * ordinary text element with `width` and `combCells` set, so `isComb` stays derived from `width`.
 */

/** A rectangle in the editor's top-left-origin page percentages. */
export interface PercentBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Any detected printed field, in the editor's top-left-origin page percentages. */
export interface FieldRegion extends PercentBox {
  pageIndex: number;
  /**
   * The part of the field a person writes in, when that is not the whole of it: an open comb whose teeth
   * hang inside a printed cell (the strip is the writing area), or a cell whose caption hugs a wall (its
   * bounds stay the whole cell, `formCells.js`). The field stays the run for taps, hints and fill order.
   * A cell captioned in a band needs none: its bounds are already the strip.
   */
  writable?: PercentBox;
  /**
   * The ruled rectangle the bounds were carved out of. Hit tests and the detectors' claim test
   * (`fieldRegions.js`'s `claimExtent`) ask of it, not of the carved strip.
   */
  enclosure?: PercentBox;
}

/** A detected comb run: a ruled strip divided into `cells` equal boxes. */
export interface CombRegion extends FieldRegion {
  cells: number;
  /** True when the cells are closed boxes rather than teeth on a writing line. */
  boxed?: boolean;
}

/**
 * How far below a text box's top its glyph baselines sit, in em. The exporter subtracts this back off in
 * `serializeText`. It is font-specific in both halves (real ascent/descent, and the family's own
 * padding); the Helvetica offset is only the fallback for a family with no metrics.
 */
export function baselineDropEm(fontFamily: string): number {
  const metrics = FONT_VERTICAL_METRICS[fontFamily];
  const offset = metrics
    ? baselineOffsetEmFromMetrics(metrics.ascent, metrics.descent)
    : HELVETICA_BASELINE_OFFSET_EM;
  return offset + textBoxPaddingEm(fontFamily);
}

/**
 * A family's digit ink centre below a text box's own top, in em. It holds for every placement kind
 * because the figure-centre term cancels the same way in `cellTextTop` and `placeCombOnRegion`.
 */
function inkCentreOffsetEm(fontFamily: string): number {
  return baselineDropEm(fontFamily) - figureCentreEm(fontFamily);
}

/**
 * Shifts `top` so the new font's ink centre lands where the old font's was, for any text element
 * (`inkCentreOffsetEm` is a per-family constant, not a field property). Placement sets `top` once, so
 * without this a later font change keeps the old font's height. A no-op when both families resolve
 * (against this element's own text) to the same face.
 */
export function topKeepingInkCentre(
  top: number,
  { fontSize, pageHeightPoints, fromFamily, toFamily, text }: {
    fontSize: number;
    pageHeightPoints: number;
    fromFamily: string;
    toFamily: string;
    text: string;
  },
): number {
  const from = resolveFontFamily(fromFamily, text);
  const to = resolveFontFamily(toFamily, text);
  if (from === to) return top;
  const em = toPercent(fontSize, pageHeightPoints);
  return top + em * (inkCentreOffsetEm(from) - inkCentreOffsetEm(to));
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
 * A tap within this band of the printed rule hits the comb; its teeth are far under a finger's height.
 * Page percent, so it does not depend on zoom.
 */
const HIT_BAND_ABOVE_PERCENT = 1.4;
const HIT_BAND_BELOW_PERCENT = 0.6;

/** Checkboxes are tiny: the hit area is grown, and overlaps resolve to the nearer centre. */
const CHECKBOX_HIT_MARGIN_X_PERCENT = 0.7;
const CHECKBOX_HIT_MARGIN_Y_PERCENT = 0.5;

/**
 * The region a point falls in, or null. Detected fields sit edge to edge (adjacent dates share a wall,
 * checkboxes are a few points apart), so ties break to the nearer centre. A region is tested against its
 * `enclosure` when it has one, so a labelled cell keeps the whole printed box as its target.
 */
function regionAt<T extends FieldRegion>(
  regions: T[],
  point: { x: number; y: number },
  pageIndex: number,
  margin: { top: number; bottom: number; sides: number },
): T | null {
  const target = (region: T): PercentBox => region.enclosure ?? region;
  const hits = regions.filter((region) => {
    if (region.pageIndex !== pageIndex) return false;
    const box = target(region);
    return point.x >= box.left - margin.sides
      && point.x <= box.left + box.width + margin.sides
      && point.y >= box.top - margin.top
      && point.y <= box.top + box.height + margin.bottom;
  });
  if (hits.length === 0) return null;
  const distance = (region: T) => {
    const box = target(region);
    return Math.hypot(point.x - (box.left + box.width / 2), point.y - (box.top + box.height / 2));
  };
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

/** Forgiveness for tap and measurement imprecision; a cell is already a real rectangle. */
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

/** A page-relative percent as points; 0 for a page with no size. */
export function toPoints(percent: number, pagePoints: number): number {
  return pagePoints > 0 ? (percent / 100) * pagePoints : 0;
}

/** Points as a page-relative percent; 0 for a page with no size. */
export function toPercent(points: number, pagePoints: number): number {
  return pagePoints > 0 ? (points / pagePoints) * 100 : 0;
}

/**
 * The size a placement takes: the one function every path reads (SIGN-32), for cells, combs, dates and
 * free text alike.
 *
 * `carriedFontSize` null means the document has none yet and this seeds it: `FIELD_FONT_FILL_RATIO` of
 * `seedHeightPoints`, capped at `FIELD_FONT_MAX_PT`, floored at `MIN_FONT_SIZE_PT`; with no height to
 * seed from, `DEFAULT_FONT_SIZE_PT`. The caller adopts the result as the carried size because it asked
 * with null.
 *
 * With a carried size, it is only ever shrunk to the ceilings the field enforces (a comb's cell width
 * and, boxed, its cap height; a cell's line height; none for free text or open teeth). The shrink
 * belongs to this element alone and is never written back, so a narrow comb cannot drag the next,
 * roomier field down with it.
 */
export function fieldFontSize(
  carriedFontSize: number | null,
  ceilings: {
    seedHeightPoints?: number;
    widthCeilingPoints?: number;
    heightCeilingPoints?: number;
  } = {},
): number {
  if (carriedFontSize === null) {
    const { seedHeightPoints = 0 } = ceilings;
    return seedHeightPoints > 0
      ? Math.max(MIN_FONT_SIZE_PT, Math.min(FIELD_FONT_MAX_PT, seedHeightPoints * FIELD_FONT_FILL_RATIO))
      : DEFAULT_FONT_SIZE_PT;
  }
  const { widthCeilingPoints, heightCeilingPoints } = ceilings;
  const limits = [widthCeilingPoints, heightCeilingPoints].filter(
    (value): value is number => typeof value === 'number' && value > 0,
  );
  const ceiling = limits.length > 0 ? Math.min(...limits) : Infinity;
  return Math.max(MIN_FONT_SIZE_PT, Math.min(carriedFontSize, ceiling));
}

/**
 * Where a one-line box's top goes in a cell's blank strip (page percent; `em` is the font size in page
 * percent): the digits' own ink centred on the strip's middle, nudged by `TEXT_BOX_PADDING_EM` toward the
 * writing line, then lifted by the box's baseline drop.
 *
 * The ink is centred, not the em box: ascent/descent describe the whole em box, not where digits draw,
 * so em-box centring put every family at a different height. `figureCentreEm` is the real per-font
 * distance, read from the TTF outlines. The nudge keeps text from hanging off a caption printed above it
 * (Arimo's result is pinned in combPlacement.test.ts). One rule for cell text and for open comb teeth in
 * a cell, because they share a row and have to line up.
 */
function cellTextTop(strip: { top: number; height: number }, em: number, fontFamily: string): number {
  const centre = strip.top + strip.height / 2;
  const baseline = centre + em * (figureCentreEm(fontFamily) + TEXT_BOX_PADDING_EM);
  return baseline - em * baselineDropEm(fontFamily);
}

/**
 * Where a freshly placed text box sits on a detected free-text cell.
 *
 * The box takes the cell's span as `minWidth`, never `width`: `width` is what makes a box a comb
 * (`comb.js`'s `isComb`), which would snap a name to one letter per imaginary cell. It grows past the
 * cell only if more is typed than fits. The size is `fieldFontSize`'s, so a short row never gets a
 * carried size that renders into the row below.
 *
 * `left` is always the physical left edge: a span has no growing edge to anchor (see signHelpers'
 * `textAnchorsRightEdge`). `top` is `cellTextTop`'s, so the answer sits toward the cell's line; only the
 * box's bottom padding crosses the cell's bottom, so no extra inset is applied.
 *
 * "The cell" is the region's `writable` when it has one and its bounds otherwise, because where the
 * caption is printed decides which holds the blank strip. Either way the box lands on the blank, not the
 * caption, which matters most on an RTL form where a span starts its text at the caption's wall. A cell
 * printing only separators carries no `writable`: a person writes across the marks, so the box takes
 * the whole cell.
 */
export function placeTextOnCell(
  region: FieldRegion,
  { carriedFontSize, pageHeightPoints, fontFamily }: {
    carriedFontSize: number | null;
    pageHeightPoints: number;
    fontFamily: string;
  },
): { left: number; top: number; minWidth: number; fontSize: number } {
  // The blank part of the cell, not the cell: see FieldRegion.writable.
  const area = region.writable ?? region;
  const areaHeightPoints = toPoints(area.height, pageHeightPoints);
  const heightCeilingPoints = areaHeightPoints > 0 ? areaHeightPoints / TEXT_BOX_LINE_HEIGHT_EM : undefined;
  const size = fieldFontSize(carriedFontSize, { seedHeightPoints: areaHeightPoints, heightCeilingPoints });
  const em = toPercent(size, pageHeightPoints);
  return {
    left: area.left,
    top: Math.max(0, cellTextTop(area, em, fontFamily)),
    minWidth: area.width,
    fontSize: size,
  };
}

/**
 * Where a text element has to sit to fill a detected run.
 *
 * Vertically there are two cases. Open teeth hang from a line you write on, so the digits' baselines
 * sit on that line. A closed box has no writing line, so the digits go in the middle. `region.boxed` says
 * which: whether the page rules the run's top edge as well as its bottom. Either way the box is lifted by
 * its own baseline drop, which the exporter subtracts back off in `serializeText`.
 *
 * `left` is the run's left edge whatever is typed: the span is fixed by the paper, so there is no
 * anchored edge to flip (`usesFixedSpan` in the registry's view flags).
 */
export function placeCombOnRegion(
  region: CombRegion,
  { carriedFontSize, fontFamily, pageWidthPoints, pageHeightPoints }: {
    carriedFontSize: number | null;
    fontFamily: string;
    pageWidthPoints: number;
    pageHeightPoints: number;
  },
): CombPlacement {
  const cells = Math.max(1, Math.min(MAX_COMB_CELLS, Math.round(region.cells)));
  const cellWidthPoints = toPoints(region.width / cells, pageWidthPoints);
  const widthCeilingPoints = cellWidthPoints > 0 ? cellWidthPoints / COMB_MIN_CELL_EM : undefined;
  // Only a closed box has a height to fit; open teeth are dividers.
  const digitHeightPercent = region.boxed ? region.height * COMB_BOX_FILL : 0;
  const digitHeightPoints = toPoints(digitHeightPercent, pageHeightPoints);
  const heightCeilingPoints = digitHeightPoints > 0 ? digitHeightPoints / COMB_CAP_HEIGHT_EM : undefined;
  // Seed from the strip a person writes in, not the teeth: an open comb's teeth are a few points tall
  // and would floor the size while its row-mates seed from their own strip. A boxed comb has no
  // `writable`; its bounds are the box.
  const seedArea = region.writable ?? region;
  const seedHeightPoints = toPoints(seedArea.height, pageHeightPoints);
  const size = fieldFontSize(carriedFontSize, { seedHeightPoints, widthCeilingPoints, heightCeilingPoints });
  const em = toPercent(size, pageHeightPoints);
  // A closed box centres the digits' ink on the cell (`figureCentreEm`, as in `cellTextTop`), not the em
  // box; open teeth put the baseline on the rule.
  const baselinePercent = region.boxed
    ? region.top + region.height / 2 + em * figureCentreEm(fontFamily)
    : region.top + region.height;
  let top = baselinePercent - em * baselineDropEm(fontFamily);
  // Open teeth inside a printed cell sit where the strip's text sits, so the row lines up; never below
  // the rule when the strip is shorter than the box.
  if (!region.boxed && region.writable) {
    const strip = region.writable;
    top = Math.min(top, cellTextTop(strip, em, fontFamily));
  }
  return {
    left: region.left,
    top: Math.max(0, top),
    width: region.width,
    combCells: cells,
    fontSize: size,
  };
}

/**
 * The geometry a text box takes to sit on a detected field, whichever kind: the one place a tap
 * (useWorkspaceGestures) and Next/Previous (useFieldNavigation) both get it from, so the two cannot
 * drift apart. Neither kind needs a `direction`: a comb's span and a cell's `minWidth` are both
 * left-anchored (see signHelpers' `textAnchorsRightEdge`).
 *
 * `carriedFontSize` null means the document has none yet; the caller passes it only when it will adopt
 * the result as the carried size (see `fieldFontSize`).
 */
export function placeTextOnField(
  field: TypableField,
  { carriedFontSize, fontFamily, pageWidthPoints, pageHeightPoints }: {
    carriedFontSize: number | null;
    fontFamily: string;
    pageWidthPoints: number;
    pageHeightPoints: number;
  },
): CombPlacement | { left: number; top: number; minWidth: number; fontSize: number } {
  return field.kind === 'comb'
    ? placeCombOnRegion(field.region, { carriedFontSize, fontFamily, pageWidthPoints, pageHeightPoints })
    : placeTextOnCell(field.region, { carriedFontSize, pageHeightPoints, fontFamily });
}
