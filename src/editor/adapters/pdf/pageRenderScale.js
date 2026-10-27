// @ts-check
import { MAX_CANVAS_AREA } from './rasterPage.js';

/** The scale every page used before it followed the display; also the floor, so a page is never softer than it was. */
export const PAGE_RENDER_MIN_SCALE = 1.5;
/** Largest on-screen page canvas in pixels (~24 MB). Every page of a document holds one at once, so this sits well under the 16.7M iOS ceiling. */
export const MAX_PAGE_RENDER_AREA = 6_000_000;
/** Past 3x the extra pixels are invisible and only cost memory. */
export const MAX_PAGE_RENDER_DPR = 3;
/** Displayed widths are rounded up to this many CSS px, so dragging a window edge repaints a handful of times, not every pixel. */
export const WIDTH_BUCKET_PX = 64;

/** A displayed CSS width rounded up to its bucket; 0 when it cannot be measured.
 * @param {number} cssWidth
 * @returns {number}
 */
export function bucketWidth(cssWidth) {
  if (!Number.isFinite(cssWidth) || cssWidth <= 0) return 0;
  return Math.ceil(cssWidth / WIDTH_BUCKET_PX) * WIDTH_BUCKET_PX;
}

/**
 * The pdf.js scale that paints a page at the device pixels it is shown in:
 * `cssWidth * dpr / unitWidth`, never under PAGE_RENDER_MIN_SCALE, lowered to
 * keep the canvas under the area cap (the floor still wins for a poster-sized
 * page, as it did when the scale was fixed).
 *
 * @param {{ unitWidth: number, unitHeight: number, cssWidth: number, dpr?: number }} size
 *   unit* is the page's size at scale 1 (rotation applied); cssWidth is the
 *   width the canvas is displayed at.
 */
export function pageRenderScale({ unitWidth, unitHeight, cssWidth, dpr }) {
  if (!(unitWidth > 0) || !(unitHeight > 0) || !(cssWidth > 0)) return PAGE_RENDER_MIN_SCALE;
  const ratio = Math.min(typeof dpr === 'number' && Number.isFinite(dpr) && dpr > 0 ? dpr : 1, MAX_PAGE_RENDER_DPR);
  const wanted = (cssWidth * ratio) / unitWidth;
  const areaCap = Math.sqrt(Math.min(MAX_PAGE_RENDER_AREA, MAX_CANVAS_AREA) / (unitWidth * unitHeight));
  return Math.max(PAGE_RENDER_MIN_SCALE, Math.min(wanted, areaCap));
}
