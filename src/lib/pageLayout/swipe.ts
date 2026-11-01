// Pure geometry between the page canvas (device pixels) and a highlight element (page percent).
import type { Band } from './bands.ts';

interface CanvasSize { width: number; height: number }
interface CanvasRect { x: number; y: number; width: number; height: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The canvas rect to read for a vertical swipe: full width, min(y)-margin to max(y)+margin, clamped. */
export function canvasWindowRect(canvasSize: CanvasSize, yFromPx: number, yToPx: number, marginPx: number): CanvasRect {
  const top = Math.floor(clamp(Math.min(yFromPx, yToPx) - marginPx, 0, canvasSize.height));
  const bottom = Math.ceil(clamp(Math.max(yFromPx, yToPx) + marginPx, 0, canvasSize.height));
  return { x: 0, y: top, width: canvasSize.width, height: bottom - top };
}

/** Window-pixel bands to page-percent bands; the canvas covers the whole displayed page. */
export function bandsToPagePercent(bands: Band[], windowTopPx: number, canvasSize: CanvasSize): Band[] {
  return bands.map((b) => ({
    left: (b.left / canvasSize.width) * 100,
    top: ((b.top + windowTopPx) / canvasSize.height) * 100,
    width: (b.width / canvasSize.width) * 100,
    height: (b.height / canvasSize.height) * 100,
  }));
}

/** The element box (union of the page-percent bands) and each band in percent of that box. */
export function highlightGeometry(pageBands: Band[]): (Band & { bands: Band[] }) | null {
  if (pageBands.length === 0) return null;
  const left = Math.min(...pageBands.map((b) => b.left));
  const top = Math.min(...pageBands.map((b) => b.top));
  const right = Math.max(...pageBands.map((b) => b.left + b.width));
  const bottom = Math.max(...pageBands.map((b) => b.top + b.height));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;
  return {
    left, top, width, height,
    bands: pageBands.map((b) => ({
      left: ((b.left - left) / width) * 100,
      top: ((b.top - top) / height) * 100,
      width: (b.width / width) * 100,
      height: (b.height / height) * 100,
    })),
  };
}
