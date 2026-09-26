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
   * The part of the field a person actually writes in, when that is not the
   * whole of it. `fieldRegions.js` sets it on an open comb whose teeth hang
   * inside a printed cell: the teeth are a few points tall, the cell is the
   * strip, and a box on the field belongs in the strip. The field itself
   * stays the run (what a tap targets, what the hint outlines, what the fill
   * order groups into a row); this is only where a box placed on it sits.
   *
   * A detected cell sets it when its printed caption hugs a wall instead of
   * sitting in a band above the writing line. There its bounds stay the whole
   * ruled cell (the side carve is too weak a guess to publish as the field's
   * extent, `formCells.js`, "What a cell candidate's bounds are"), so without
   * this a box on it would start its text on the caption. A cell captioned in
   * a band needs no `writable`: its bounds are already the strip.
   */
  writable?: PercentBox;
  /**
   * The printed rectangle a field's bounds were carved out of, when the two
   * differ - form 101 rules one box per field and prints the caption inside
   * it, above the writing line, so the field is the blank band and the
   * `enclosure` is the box a person sees. Both of the questions asked about a
   * field as a whole are asked of it: the hit test here (a tap that lands on
   * the caption is still a tap on that field) and the claim test that
   * reconciles the detectors (`fieldRegions.js`'s `claimExtent`), which has to
   * ask whether something already covers the printed box rather than the
   * carved strip.
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
 *
 * What a tap is tested against is the field's `enclosure` when it has one -
 * the printed rectangle the bounds were carved out of - so that a labelled
 * cell keeps the whole box a person sees as its target while placing the box
 * in the blank band. Combs and checkboxes have no enclosure and are
 * unaffected.
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
 * The size a placement takes: the ONE function every path reads (SIGN-32) - a
 * text cell, a comb, a date on either (an ordinary text element, same path),
 * and free text with no field at all. A document carries one font size once
 * anything has set it (`PdfSignTool`'s `SignToolState.carriedFontSize`,
 * round-tripped through the draft); before that, `carriedFontSize` is `null`
 * and this is the one place that seeds it.
 *
 * No carried size yet: the field's own writable height decides it -
 * `FIELD_FONT_FILL_RATIO` (~0.65) of `seedHeightPoints`, capped at
 * `FIELD_FONT_MAX_PT` so a very tall field doesn't render an oversized single
 * line, floored at `MIN_FONT_SIZE_PT`. An open comb inside a printed cell
 * seeds from its writable strip, the same height a cell in the same row
 * seeds from - not the boxed digit-height fraction `heightCeilingPoints`
 * uses, so a comb an empty document starts on carries the same size a
 * same-height cell in its row would, not one already shrunk toward its own
 * box-fill margin. Free text (or any field too short to
 * measure, `seedHeightPoints` left at 0) has no height to grow toward and
 * takes `DEFAULT_FONT_SIZE_PT` instead. Either way, the returned size IS the
 * carried size from then on - the caller adopts it because it knows it asked
 * with `carriedFontSize: null`, not because this function says so twice.
 *
 * A carried size already exists: every path only ever shrinks it, never grows
 * it, to whichever ceiling(s) the field in front of it actually enforces - a
 * comb's cell-width ceiling and, boxed, its cap-height ceiling; a cell's own
 * line-height ceiling; free text and an open comb's teeth pass none and get
 * the carried size back untouched. That shrink belongs to this element alone
 * and is never written back to the carried size - see `placeCombOnRegion`'s
 * and `placeTextOnCell`'s own callers for why a narrow comb must not drag the
 * next, roomier field down with it.
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
 * Where a one-line box's top goes in a cell's blank strip (page percent,
 * `em` being the font size in page percent): the digits' own ink centred on
 * the strip's middle, then dropped by the same small amount every font keeps
 * toward the writing line, and lifted back up by the box's own baseline drop
 * to get from the baseline to the box's top.
 *
 * Centring the *em box* here (SIGN-38's bug) instead of the digits' own ink
 * put every family at a different height: Arimo's digit centre landed 1.71pt
 * below the cell's middle at 14pt in a 22pt cell, Gveret Levin's 3.26pt below,
 * Pacifico's 7.75pt below (with Pacifico's baseline itself sitting below the
 * cell) - because a font's ascent/descent describe its whole em box, not
 * where "0123456789" actually draws ink inside it. `figureCentreEm` is that
 * real, per-font distance, read from the TTF outlines. The `+
 * TEXT_BOX_PADDING_EM` keeps today's small downward nudge toward the writing
 * line (approved for Arimo, which this formula must reproduce within 0.05pt -
 * see combPlacement.test.ts): without it every font centred dead on the
 * strip read as hanging off a caption printed above it (live report, form
 * 101's phone number). One rule for a cell's text and for open comb teeth
 * inside a cell, because they share a row and have to line up.
 */
function cellTextTop(strip: { top: number; height: number }, em: number, fontFamily: string): number {
  const centre = strip.top + strip.height / 2;
  const baseline = centre + em * (figureCentreEm(fontFamily) + TEXT_BOX_PADDING_EM);
  return baseline - em * baselineDropEm(fontFamily);
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
 * The font size is `fieldFontSize`'s answer, not whatever was last used: a
 * short row (an e-ticket's "Status" column, one line of ~9pt) given a
 * carried 24pt box would render past its own row into the one below it,
 * same defect class a comb's cells are guarded against below.
 *
 * `left` is the cell's left edge whichever way the text reads: a box with a
 * span has no growing edge to anchor (see signHelpers' `textAnchorsRightEdge`),
 * so unlike a free RTL box its `left` is always the physical left. `top` is
 * the cell's middle less half the (possibly shrunk) box's own height - the
 * same re-centring a raw tap gets - then lowered by the box's bottom padding,
 * so the answer sits down toward the cell's line rather than hanging off a
 * caption above it. Only that padding crosses the cell's bottom; the glyphs
 * stay inside it, so no extra inset is applied.
 *
 * "The cell" here is the region's `writable` when it carries one and its own
 * bounds otherwise, because which of the two holds the blank strip depends on
 * where the caption is printed. `formCells.js` publishes a caption *band*'s
 * strip as the bounds themselves - the band under "שם", not the whole box
 * "שם" is printed in - but a caption hugging a wall leaves the bounds the
 * whole cell and names the strip beside it `writable`. Either way the box
 * lands on the blank and not on the caption, which matters most on an RTL
 * form: a box with a span starts its text at the span's right edge, the very
 * wall such a caption is printed against. A cell printing only separators
 * (form 101's `/  /` dates) is not captioned at all and carries no
 * `writable` - a person writes the date across those marks, so the box takes
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
  // The blank part of the cell, not the cell: a labelled cell's answer goes
  // under (or beside) its printed label, and centring on the whole cell put
  // the top of the typed text against the label's baseline (live report,
  // form 101's employer row). See FieldRegion.writable.
  const area = region.writable ?? region;
  const areaHeightPoints = pageHeightPoints > 0 ? (area.height / 100) * pageHeightPoints : 0;
  const heightCeilingPoints = areaHeightPoints > 0 ? areaHeightPoints / TEXT_BOX_LINE_HEIGHT_EM : undefined;
  const size = fieldFontSize(carriedFontSize, { seedHeightPoints: areaHeightPoints, heightCeilingPoints });
  const em = pageHeightPoints > 0 ? (size / pageHeightPoints) * 100 : 0;
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
  { carriedFontSize, fontFamily, pageWidthPoints, pageHeightPoints }: {
    carriedFontSize: number | null;
    fontFamily: string;
    pageWidthPoints: number;
    pageHeightPoints: number;
  },
): CombPlacement {
  const cells = Math.max(1, Math.min(MAX_COMB_CELLS, Math.round(region.cells)));
  const cellWidthPoints = pageWidthPoints > 0 ? ((region.width / cells) / 100) * pageWidthPoints : 0;
  const widthCeilingPoints = cellWidthPoints > 0 ? cellWidthPoints / COMB_MIN_CELL_EM : undefined;
  // Only a closed box has a height to fit; open teeth are dividers, and the
  // digits on them keep the size every other field on the form gets.
  const digitHeightPercent = region.boxed ? region.height * COMB_BOX_FILL : 0;
  const digitHeightPoints = pageHeightPoints > 0 ? (digitHeightPercent / 100) * pageHeightPoints : 0;
  const heightCeilingPoints = digitHeightPoints > 0 ? digitHeightPoints / COMB_CAP_HEIGHT_EM : undefined;
  // Seeding a fresh carried size reads the strip a person writes in, not the
  // digit-height fraction above: an open comb's teeth are only a few points
  // tall, so seeding from `region.height` alone floored a birth-date comb to
  // MIN_FONT_SIZE_PT while the name cells in the same row, seeded from their
  // own writable strip, landed near 12pt (form 101, live report). A boxed
  // comb has no `writable` and keeps seeding from its own bounds, which are
  // already the box. Either way this is the whole strip, never this comb's
  // own box-fill margin (see fieldFontSize's own doc).
  const seedArea = region.writable ?? region;
  const seedHeightPoints = pageHeightPoints > 0 ? (seedArea.height / 100) * pageHeightPoints : 0;
  const size = fieldFontSize(carriedFontSize, { seedHeightPoints, widthCeilingPoints, heightCeilingPoints });
  const em = pageHeightPoints > 0 ? (size / pageHeightPoints) * 100 : 0;
  // A closed cell is a box and text belongs in the middle of it; an open one is
  // a row of teeth hanging from the line you write on, and text belongs on that
  // line. Centring in the first case means putting the digits' own ink middle
  // (`figureCentreEm`, SIGN-38) on the cell's middle, which is the same thing
  // your eye does - not the font's whole em-box middle, which a font's real
  // ascent/descent can put well off the ink itself (see cellTextTop's doc).
  const baselinePercent = region.boxed
    ? region.top + region.height / 2 + em * figureCentreEm(fontFamily)
    : region.top + region.height;
  let top = baselinePercent - em * baselineDropEm(fontFamily);
  // Open teeth inside a printed cell (`writable`, from fieldRegions.js): the
  // digits sit where a cell's text sits in the blank strip - the
  // identity number on form 101 shares a row with the name cells and stood
  // 5pt lower than them on the rule (live report). Never below the rule,
  // though, when the strip is shorter than the box.
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
 * The geometry a text box takes to sit on a detected field, whichever kind it
 * is - the one place a tap on a field (useWorkspaceGestures) and a Next/
 * Previous move onto one (useFieldNavigation) both get it from, so the two
 * can never drift apart. A comb takes the run's span, cell count and
 * fieldFontSize's answer; a cell takes placeTextOnCell's answer (its left
 * edge, vertical middle re-centred on the box's own possibly-shrunk height,
 * and fieldFontSize's answer) - neither kind needs a `direction` any more:
 * a comb's span is fixed by the paper (no anchored edge to flip) and a cell
 * box is left-anchored with a minimum width for the same reason (see
 * signHelpers' `textAnchorsRightEdge`), so which edge the text reads toward
 * is purely a rendering/export question, never a placement one.
 *
 * `carriedFontSize` is the document's carried size, or `null` on a document
 * that has none yet (SIGN-32). The caller passes `null` only when it means
 * to adopt whatever this returns as the new carried size - see
 * `fieldFontSize`'s own doc for why that adoption lives with the caller
 * rather than in a second return value here.
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
