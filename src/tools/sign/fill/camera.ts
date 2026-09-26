/**
 * Fill mode's app-owned camera: pure, framework-free geometry for the locked-scale,
 * layout-zoom viewport described in docs/sign-next-gen-guidelines.md §4.
 *
 * Every function here takes plain numbers and rects and returns plain numbers.
 * No DOM access, no side effects: the caller (the island) reads the real viewport
 * and scroll position, calls these, and applies the result.
 */

/** The camera never zooms below the whole-page fit. */
export const MIN_ZOOM = 1;

/** The camera never zooms past what the iOS canvas cap allows at a sane page size. */
export const MAX_ZOOM = 5;

/** A focused field is zoomed until its text renders at least this many CSS px tall. */
export const FRAMED_TEXT_PX = 16;

/** A focused field's top lands this fraction of the way down the visual viewport. */
export const FRAME_FROM_TOP = 1 / 3;

/** Horizontal breathing room kept between a framed field's reading-start edge and the viewport edge. */
export const FRAME_SIDE_MARGIN_PX = 16;

/** iOS silently fails to allocate a canvas backing store larger than this, in device pixels. */
export const IOS_CANVAS_MAX_PIXELS = 16_777_216;

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export type ReadingDirection = 'ltr' | 'rtl';

/** Clamps a zoom level to the camera's fixed range. */
export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * The zoom that renders a field's text at FRAMED_TEXT_PX, given the font size that
 * text would render at today's zoom-1 layout. Never zooms OUT on a hop: a field whose
 * text is already legible at the current zoom keeps that zoom.
 */
export function zoomToFrameText({
  fontSizePxAtZoom1,
  currentZoom,
}: {
  fontSizePxAtZoom1: number;
  currentZoom: number;
}): number {
  const neededZoom = FRAMED_TEXT_PX / fontSizePxAtZoom1;
  return clampZoom(Math.max(currentZoom, neededZoom));
}

/**
 * The scroll position that lands a focused field a third of the way down the visual
 * viewport, with its reading-start edge kept in view with a margin. `fieldRect` is in
 * document px at the target zoom; `viewport` is the visual viewport's CSS size with
 * the keyboard already excluded by the caller. Never returns a negative scroll.
 */
export function frameScroll({
  fieldRect,
  viewport,
  dir,
}: {
  fieldRect: Rect;
  viewport: Size;
  dir: ReadingDirection;
}): { scrollX: number; scrollY: number } {
  const scrollY = Math.max(0, fieldRect.top - FRAME_FROM_TOP * viewport.height);

  let scrollX: number;
  if (fieldRect.width <= viewport.width) {
    // The whole field fits: show it whole, centred, rather than pinned to one edge.
    scrollX = fieldRect.left + fieldRect.width / 2 - viewport.width / 2;
  } else if (dir === 'rtl') {
    // Keep the right (reading-start) edge visible with the margin.
    const rightEdge = fieldRect.left + fieldRect.width;
    scrollX = rightEdge - (viewport.width - FRAME_SIDE_MARGIN_PX);
  } else {
    // Keep the left (reading-start) edge visible with the margin.
    scrollX = fieldRect.left - FRAME_SIDE_MARGIN_PX;
  }

  return { scrollX: Math.max(0, scrollX), scrollY };
}

/**
 * One step of a live pinch gesture: the zoom and scroll that keep the document point
 * under the starting midpoint fixed under the current midpoint. `midpoint` is in
 * visual-viewport px; `startScroll` is the document scroll at gesture start. Zoom is
 * clamped to the camera's range; scroll is never negative.
 */
export function pinchStep({
  startZoom,
  startDistance,
  distance,
  midpoint,
  startScroll,
}: {
  startZoom: number;
  startDistance: number;
  distance: number;
  midpoint: Point;
  startScroll: Point;
}): { zoom: number; scrollX: number; scrollY: number } {
  const ratio = startDistance > 0 ? distance / startDistance : 1;
  const zoom = clampZoom(startZoom * ratio);

  const docPoint: Point = {
    x: (startScroll.x + midpoint.x) / startZoom,
    y: (startScroll.y + midpoint.y) / startZoom,
  };

  const scrollX = Math.max(0, docPoint.x * zoom - midpoint.x);
  const scrollY = Math.max(0, docPoint.y * zoom - midpoint.y);

  return { zoom, scrollX, scrollY };
}

/**
 * The pdf.js render viewport scale for a page rendered at CSS size
 * (cssWidthAtZoom, cssHeightAtZoom), sharp at the device pixel ratio, reduced
 * uniformly so its canvas never exceeds IOS_CANVAS_MAX_PIXELS device pixels.
 */
export function canvasRenderScale({
  cssWidthAtZoom,
  cssHeightAtZoom,
  dpr,
  pageWidthPoints,
}: {
  cssWidthAtZoom: number;
  cssHeightAtZoom: number;
  dpr: number;
  pageWidthPoints: number;
}): { scale: number; pixelWidth: number; pixelHeight: number } {
  let scale = (cssWidthAtZoom * dpr) / pageWidthPoints;
  let pixelWidth = cssWidthAtZoom * dpr;
  let pixelHeight = cssHeightAtZoom * dpr;

  const pixelCount = pixelWidth * pixelHeight;
  if (pixelCount > IOS_CANVAS_MAX_PIXELS) {
    const reduction = Math.sqrt(IOS_CANVAS_MAX_PIXELS / pixelCount);
    scale *= reduction;
    pixelWidth *= reduction;
    pixelHeight *= reduction;
  }

  return {
    // Floor, never round: rounding either dimension up could push the pixel
    // count back over the cap that just reduced it.
    scale,
    pixelWidth: Math.floor(pixelWidth),
    pixelHeight: Math.floor(pixelHeight),
  };
}
