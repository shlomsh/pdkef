// Pure percent <-> pixel <-> PDF-point conversion helpers shared by the Sign/Redact
// editors and signPdf's bake-out. No DOM reads or PDF-library imports live here:
// callers provide page metadata/rects, keeping the one transform usable by pdf.js,
// pdf-lib, component previews and gesture tests without coupling those layers.

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type AffineTransform = readonly [number, number, number, number, number, number];

export interface PageGeometry {
  /** Visible PDF user-space box after CropBox is clipped to MediaBox. */
  cropBox: Rect;
  /** Clockwise page rotation, normalized to 0/90/180/270. */
  rotation: 0 | 90 | 180 | 270;
  /** PDF /UserUnit, where 1 is one 1/72-inch PDF point. */
  userUnit: number;
  /** Rotated visible width/height in editor units (physical PDF points). */
  width: number;
  height: number;
  /** Raw PDF user space -> the top-left-origin viewport rendered by pdf.js. */
  pdfToViewport: AffineTransform;
  /** Inverse of pdfToViewport. */
  viewportToPdf: AffineTransform;
  /** Bottom-left-origin editor coordinates -> raw PDF user space. */
  editorToPdf: AffineTransform;
  /** Inverse of editorToPdf. */
  pdfToEditor: AffineTransform;
}

export interface PageGeometryInput {
  cropBox: Rect;
  rotation?: number;
  userUnit?: number;
}

const FLIP_Y: (height: number) => AffineTransform = (height) => [1, 0, 0, -1, 0, height];

export function applyAffineTransform(point: Point, transform: AffineTransform): Point {
  const [a, b, c, d, e, f] = transform;
  return {
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f,
  };
}

/** Returns `outer(inner(point))`. */
export function composeAffineTransforms(outer: AffineTransform, inner: AffineTransform): AffineTransform {
  const [a1, b1, c1, d1, e1, f1] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function invertAffineTransform(transform: AffineTransform): AffineTransform {
  const [a, b, c, d, e, f] = transform;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < Number.EPSILON) {
    throw new Error('Cannot invert a singular page-coordinate transform');
  }
  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant,
  ];
}

export function normalizePageRotation(rotation = 0): 0 | 90 | 180 | 270 {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized !== 0 && normalized !== 90 && normalized !== 180 && normalized !== 270) {
    throw new Error(`Page rotation must be a multiple of 90 degrees; received ${rotation}`);
  }
  return normalized;
}

/**
 * PDF viewers display the intersection of CropBox and MediaBox. Keeping that
 * rule here makes pdf.js preview metadata and pdf-lib export metadata converge
 * even when a producer wrote a CropBox extending beyond the physical page.
 */
export function visiblePageBox(mediaBox: Rect, cropBox: Rect): Rect {
  const left = Math.max(mediaBox.x, cropBox.x);
  const bottom = Math.max(mediaBox.y, cropBox.y);
  const right = Math.min(mediaBox.x + mediaBox.width, cropBox.x + cropBox.width);
  const top = Math.min(mediaBox.y + mediaBox.height, cropBox.y + cropBox.height);
  if (right <= left || top <= bottom) return { ...mediaBox };
  return { x: left, y: bottom, width: right - left, height: top - bottom };
}

/**
 * Builds the same scale-1 viewport transform as pdf.js PageViewport, then
 * derives every other conversion from that matrix. Model percentages use the
 * viewport's top-left origin; serializers draw in an editor space with a
 * bottom-left origin and are wrapped once in `editorToPdf` during export.
 */
export function createPageGeometry({ cropBox, rotation = 0, userUnit = 1 }: PageGeometryInput): PageGeometry {
  const normalizedRotation = normalizePageRotation(rotation);
  if (![cropBox.x, cropBox.y, cropBox.width, cropBox.height, userUnit].every(Number.isFinite)
    || cropBox.width <= 0 || cropBox.height <= 0 || userUnit <= 0) {
    throw new Error('Page geometry requires a finite positive crop box and user unit');
  }

  const xMin = cropBox.x;
  const yMin = cropBox.y;
  const xMax = cropBox.x + cropBox.width;
  const yMax = cropBox.y + cropBox.height;
  const centerX = (xMin + xMax) / 2;
  const centerY = (yMin + yMax) / 2;
  let rotateA: number;
  let rotateB: number;
  let rotateC: number;
  let rotateD: number;

  switch (normalizedRotation) {
    case 90:
      rotateA = 0; rotateB = 1; rotateC = 1; rotateD = 0;
      break;
    case 180:
      rotateA = -1; rotateB = 0; rotateC = 0; rotateD = 1;
      break;
    case 270:
      rotateA = 0; rotateB = -1; rotateC = -1; rotateD = 0;
      break;
    default:
      rotateA = 1; rotateB = 0; rotateC = 0; rotateD = -1;
  }

  const swapsAxes = rotateA === 0;
  const width = (swapsAxes ? cropBox.height : cropBox.width) * userUnit;
  const height = (swapsAxes ? cropBox.width : cropBox.height) * userUnit;
  const offsetX = (swapsAxes ? Math.abs(centerY - yMin) : Math.abs(centerX - xMin)) * userUnit;
  const offsetY = (swapsAxes ? Math.abs(centerX - xMin) : Math.abs(centerY - yMin)) * userUnit;
  const pdfToViewport: AffineTransform = [
    rotateA * userUnit,
    rotateB * userUnit,
    rotateC * userUnit,
    rotateD * userUnit,
    offsetX - rotateA * userUnit * centerX - rotateC * userUnit * centerY,
    offsetY - rotateB * userUnit * centerX - rotateD * userUnit * centerY,
  ];
  const viewportToPdf = invertAffineTransform(pdfToViewport);
  const editorToPdf = composeAffineTransforms(viewportToPdf, FLIP_Y(height));

  return {
    cropBox: { ...cropBox },
    rotation: normalizedRotation,
    userUnit,
    width,
    height,
    pdfToViewport,
    viewportToPdf,
    editorToPdf,
    pdfToEditor: invertAffineTransform(editorToPdf),
  };
}

/** Metadata adapter for a pdf.js PDFPageProxy; intentionally uses no pdf.js imports. */
export function pageGeometryFromPdfJsPage(page: {
  view?: number[];
  rotate?: number;
  userUnit?: number;
  getViewport?: (options: { scale: number }) => { width: number; height: number; viewBox?: number[] };
}): PageGeometry {
  const viewport = page.view ? undefined : page.getViewport?.({ scale: 1 });
  const view = page.view || viewport?.viewBox;
  if (!view) {
    // Small component-test doubles historically expose only viewport width and
    // height. Preserve that valid adapter boundary without weakening real PDF
    // metadata: production PDFPageProxy objects always expose `view`.
    const rotation = normalizePageRotation(page.rotate || 0);
    const swapsAxes = rotation === 90 || rotation === 270;
    const userUnit = page.userUnit || 1;
    const visibleWidth = (viewport?.width || 1) / userUnit;
    const visibleHeight = (viewport?.height || 1) / userUnit;
    return createPageGeometry({
      cropBox: {
        x: 0,
        y: 0,
        width: swapsAxes ? visibleHeight : visibleWidth,
        height: swapsAxes ? visibleWidth : visibleHeight,
      },
      rotation,
      userUnit,
    });
  }
  const [xMin, yMin, xMax, yMax] = view;
  return createPageGeometry({
    cropBox: { x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin },
    rotation: page.rotate || 0,
    userUnit: page.userUnit || 1,
  });
}

/** Stored top-left-origin percentages -> raw PDF user-space point. */
export function pagePercentToPdfPoint(point: Point, geometry: PageGeometry): Point {
  return applyAffineTransform({
    x: percentToPoints(point.x, geometry.width),
    y: percentToPoints(point.y, geometry.height),
  }, geometry.viewportToPdf);
}

/** Raw PDF user-space point -> stored top-left-origin percentages. */
export function pdfPointToPagePercent(point: Point, geometry: PageGeometry): Point {
  const viewportPoint = applyAffineTransform(point, geometry.pdfToViewport);
  return {
    x: pointsToPercent(viewportPoint.x, geometry.width),
    y: pointsToPercent(viewportPoint.y, geometry.height),
  };
}

/** Stored percentages -> bottom-left-origin coordinates used by serializers. */
export function pagePercentToEditorPoint(point: Point, geometry: PageGeometry): Point {
  return {
    x: percentToPoints(point.x, geometry.width),
    y: geometry.height - percentToPoints(point.y, geometry.height),
  };
}

/** A browser client point -> the same percentage model export consumes. */
export function clientPointToPagePercent(point: Point, rect: Rect, geometry?: PageGeometry): Point {
  if (!geometry) {
    return {
      x: pxToPercent(point.x - rect.x, rect.width),
      y: pxToPercent(point.y - rect.y, rect.height),
    };
  }
  const width = geometry?.width || rect.width;
  const height = geometry?.height || rect.height;
  const viewportPoint = {
    x: rect.width ? ((point.x - rect.x) / rect.width) * width : 0,
    y: rect.height ? ((point.y - rect.y) / rect.height) * height : 0,
  };
  return {
    x: pointsToPercent(viewportPoint.x, width),
    y: pointsToPercent(viewportPoint.y, height),
  };
}

export function clientDeltaToPagePercent(delta: Point, rect: Rect, geometry?: PageGeometry): Point {
  if (!geometry) {
    return {
      x: pxDeltaToPercent(delta.x, rect.width),
      y: pxDeltaToPercent(delta.y, rect.height),
    };
  }
  const width = geometry?.width || rect.width;
  const height = geometry?.height || rect.height;
  return {
    x: pointsToPercent(rect.width ? (delta.x / rect.width) * width : 0, width),
    y: pointsToPercent(rect.height ? (delta.y / rect.height) * height : 0, height),
  };
}

// An absolute pixel offset within a parent, expressed as a percentage of the
// parent's own size (e.g. a pointer's x position relative to a page wrapper).
export function pxToPercent(px: number, parentPx: number): number {
  return (px / parentPx) * 100;
}

// A pixel *delta* (drag/resize distance) expressed as a percentage of the
// parent's size. Same formula as pxToPercent — kept as a separate name because
// call sites reason about "how far did I drag" rather than "where am I".
export function pxDeltaToPercent(dx: number, parentPx: number): number {
  return (dx / parentPx) * 100;
}

// Inverse of pxToPercent/pxDeltaToPercent.
export function percentToPx(pct: number, parentPx: number): number {
  return (pct / 100) * parentPx;
}

// Percent of a page dimension -> PDF points along that same dimension.
export function percentToPoints(pct: number, pageDimPoints: number): number {
  return (pct / 100) * pageDimPoints;
}

// Inverse of percentToPoints.
export function pointsToPercent(points: number, pageDimPoints: number): number {
  return (points / pageDimPoints) * 100;
}

// PDF points -> on-screen pixels, given the page's current render scale factor
// (screen px per PDF point, e.g. pageWrapperWidthPx / pageWidthPoints).
export function pointsToPx(points: number, scaleFactor: number): number {
  return points * scaleFactor;
}

// Inverse of pointsToPx.
export function pxToPoints(px: number, scaleFactor: number): number {
  return px / scaleFactor;
}

// The page's current render scale factor (screen px per PDF point), derived
// from the page wrapper's measured pixel width and the page's intrinsic
// PDF-point width.
export function scaleFactorFromPx(parentWidthPx: number, pageWidthPoints: number): number {
  return parentWidthPx / pageWidthPoints;
}

// Converts a width percentage to the height percentage that preserves a given
// aspect ratio (height/width, measured in real px). Width% and height% are each
// relative to a different pixel dimension of the parent (parentWidthPx vs.
// parentHeightPx), so the parent's own aspect ratio has to be folded in too.
export function widthPercentToHeightPercent(
  widthPercent: number,
  aspectRatio: number,
  parentWidthPx: number,
  parentHeightPx: number,
): number {
  return widthPercent * aspectRatio * (parentWidthPx / parentHeightPx);
}
