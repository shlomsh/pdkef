// The numbers behind the corner editor's zoom (SCAN-75): pure, no DOM. The hook keeps the point under the fingers by
// measuring the frame before and after a zoom is written, so no scroll model lives here.
export const ZOOM_FIT = 1;
export const ZOOM_MAX = 6;
/** One press of a zoom button or key. @testSeam */
export const ZOOM_STEP = 1.5;

/** To Fit..Max; a value within 0.01 of Fit is Fit, so a pinch that ends "almost back" really is back. */
export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return ZOOM_FIT;
  if (Math.abs(z - ZOOM_FIT) < 0.01) return ZOOM_FIT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_FIT, z));
}

/** One press of a zoom button or key. */
export function steppedZoom(z: number, dir: 1 | -1): number {
  return clampZoom(dir === 1 ? z * ZOOM_STEP : z / ZOOM_STEP);
}
