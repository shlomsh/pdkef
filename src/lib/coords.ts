// Pure percent <-> pixel <-> PDF-point conversion helpers shared by the Sign/Redact
// editors (DraggableOverlayElement.jsx, PdfSignTool.jsx, PdfRedactTool.jsx) and
// signPdf's bake-out (sign.js). No DOM reads here — callers measure rects/scale
// factors and pass the numbers in, so every function is trivially testable and
// there is exactly one place that can get a conversion's scale wrong.

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
