import { isBlurStrength } from './blurStrength.ts';
import type { BlurStrokeElement, WhiteoutStrokeElement } from './editorModel.ts';

// RED-32: pure geometry for a brush stroke. A stroke is an ordered list of
// page-percent points plus a brush diameter in page points. Percent is
// anisotropic (1% of width is not 1% of height), so every distance that
// means something on the page is converted through the page's size in
// points first. Screen (SVG / mask) and export (canvas) both draw the same
// polyline with round caps and joins, so they cannot disagree.

export type StrokePoint = [number, number];

export interface StrokeBBox { left: number; top: number; width: number; height: number; }

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Distance between two percent points, in page points. */
function distancePt(a: StrokePoint, b: StrokePoint, pageWidthPt: number, pageHeightPt: number): number {
  return Math.hypot(((b[0] - a[0]) / 100) * pageWidthPt, ((b[1] - a[1]) / 100) * pageHeightPt);
}

/**
 * Drops points closer than `minStepPt` to the last kept one, so a slow drag
 * does not write hundreds of points into an undo entry. Both endpoints are
 * always kept: the last point replaces the previous kept one when it would
 * otherwise be dropped, so the stroke still ends where the pointer lifted.
 */
export function simplifyStroke(
  points: readonly StrokePoint[],
  minStepPt: number,
  pageWidthPt: number,
  pageHeightPt: number,
): StrokePoint[] {
  if (points.length <= 1) return points.map((p) => [p[0], p[1]]);
  const kept: StrokePoint[] = [[points[0][0], points[0][1]]];
  for (let i = 1; i < points.length - 1; i += 1) {
    if (distancePt(kept[kept.length - 1], points[i], pageWidthPt, pageHeightPt) >= minStepPt) {
      kept.push([points[i][0], points[i][1]]);
    }
  }
  const last: StrokePoint = [points[points.length - 1][0], points[points.length - 1][1]];
  if (kept.length > 1 && distancePt(kept[kept.length - 1], last, pageWidthPt, pageHeightPt) < minStepPt) {
    kept[kept.length - 1] = last;
  } else {
    kept.push(last);
  }
  return kept;
}

/** The stroke's bounding box in page percent, brush radius included, clamped to the page. */
export function strokeBBox(
  points: readonly StrokePoint[],
  sizePt: number,
  pageWidthPt: number,
  pageHeightPt: number,
): StrokeBBox {
  if (points.length === 0) return { left: 0, top: 0, width: 0, height: 0 };
  const rx = (sizePt / 2 / pageWidthPt) * 100;
  const ry = (sizePt / 2 / pageHeightPt) * 100;
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const left = clampPercent(minX - rx);
  const top = clampPercent(minY - ry);
  const right = clampPercent(maxX + rx);
  const bottom = clampPercent(maxY + ry);
  return { left, top, width: right - left, height: bottom - top };
}

interface MakeStrokeArgs {
  id: string;
  pageIndex: number;
  points: readonly StrokePoint[];
  sizePt: number;
  pageWidthPt: number;
  pageHeightPt: number;
  color?: string;
  strength?: unknown;
}

/** The step below which two points are one point: half a point of page. */
export const STROKE_MIN_STEP_PT = 0.5;

/** Builds a committed stroke element: simplified points and their bbox. */
export function makeStroke(kind: 'blurStroke', args: MakeStrokeArgs): BlurStrokeElement;
export function makeStroke(kind: 'whiteoutStroke', args: MakeStrokeArgs): WhiteoutStrokeElement;
export function makeStroke(kind: 'blurStroke' | 'whiteoutStroke', args: MakeStrokeArgs): BlurStrokeElement | WhiteoutStrokeElement;
export function makeStroke(kind: 'blurStroke' | 'whiteoutStroke', args: MakeStrokeArgs): BlurStrokeElement | WhiteoutStrokeElement {
  const { id, pageIndex, sizePt, pageWidthPt, pageHeightPt } = args;
  const points = simplifyStroke(args.points, STROKE_MIN_STEP_PT, pageWidthPt, pageHeightPt);
  const bbox = strokeBBox(points, sizePt, pageWidthPt, pageHeightPt);
  if (kind === 'blurStroke') {
    const element: BlurStrokeElement = { id, type: 'blurStroke', pageIndex, ...bbox, points, sizePt };
    if (isBlurStrength(args.strength)) element.strength = args.strength;
    return element;
  }
  return { id, type: 'whiteoutStroke', pageIndex, ...bbox, points, sizePt, color: args.color || '#ffffff' };
}

/** 'M x y L x y ...'; one point becomes a zero-length segment so round caps still draw a dot. */
function polyline(points: readonly StrokePoint[], map: (p: StrokePoint) => StrokePoint): string {
  if (points.length === 0) return '';
  const mapped = points.map(map);
  const parts = mapped.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${round3(x)} ${round3(y)}`);
  if (mapped.length === 1) parts.push(`L ${round3(mapped[0][0])} ${round3(mapped[0][1])}`);
  return parts.join(' ');
}

/** An SVG path in a 0..100 viewBox relative to the bbox (x and y scaled separately). */
export function strokeSvgPath(points: readonly StrokePoint[], bbox: StrokeBBox): string {
  const w = bbox.width > 0 ? bbox.width : 1;
  const h = bbox.height > 0 ? bbox.height : 1;
  return polyline(points, ([x, y]) => [((x - bbox.left) / w) * 100, ((y - bbox.top) / h) * 100]);
}

export interface StrokeSvgInPoints {
  /** `0 0 <bbox width in pt> <bbox height in pt>`: uniform, so the round stroke stays round. */
  viewBox: string;
  d: string;
  /** The brush diameter, in the same units as the viewBox. */
  strokeWidth: number;
}

/**
 * The stroke drawn in page-point units inside its own bbox. Unlike the
 * 0..100 path (which stretches x and y separately), this viewBox has the same
 * scale on both axes, so an SVG stroke-width equal to the brush diameter
 * draws a true round brush at any zoom. Screen renderers use this one.
 */
export function strokeSvgInPoints(
  stroke: { points: readonly StrokePoint[]; sizePt: number; left: number; top: number; width: number; height: number },
  pageWidthPt: number,
  pageHeightPt: number,
): StrokeSvgInPoints {
  const wPt = (stroke.width / 100) * pageWidthPt;
  const hPt = (stroke.height / 100) * pageHeightPt;
  const d = polyline(stroke.points, ([x, y]) => [
    ((x - stroke.left) / 100) * pageWidthPt,
    ((y - stroke.top) / 100) * pageHeightPt,
  ]);
  return { viewBox: `0 0 ${round3(Math.max(wPt, 0.001))} ${round3(Math.max(hPt, 0.001))}`, d, strokeWidth: stroke.sizePt };
}

export interface StrokeInPixels {
  /** The polyline in canvas pixels. */
  points: StrokePoint[];
  /** The brush diameter in canvas pixels (`sizePt` x the render scale). */
  diameter: number;
  /** The stroke's bbox in canvas pixels, for the region a blur must cover. */
  x: number; y: number; w: number; h: number;
}

/**
 * The stroke on an export canvas. `scale` is pixels per page point (the
 * export's raster scale), so the brush is `sizePt` points wide on the page at
 * any raster size. The export canvas is `canvasWidth` x `canvasHeight`
 * pixels, the whole page; percent geometry maps straight onto it.
 */
export function strokeInPixels(
  stroke: { points: readonly StrokePoint[]; sizePt: number; left: number; top: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
  scale: number,
): StrokeInPixels {
  return {
    points: stroke.points.map(([x, y]) => [(x / 100) * canvasWidth, (y / 100) * canvasHeight]),
    diameter: stroke.sizePt * scale,
    x: (stroke.left / 100) * canvasWidth,
    y: (stroke.top / 100) * canvasHeight,
    w: (stroke.width / 100) * canvasWidth,
    h: (stroke.height / 100) * canvasHeight,
  };
}
