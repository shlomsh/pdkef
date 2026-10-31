// SIGN-44: where a comment card's passage crop comes from on the page canvas, and how big it draws.
import type { PercentBox } from './commentCards.ts';

interface CropPlan {
  /** Source rect on the page canvas, in canvas pixels. */
  sx: number; sy: number; sw: number; sh: number;
  /** Backing-store size and CSS height of the crop canvas. */
  dw: number; dh: number; cssHeight: number;
}

/**
 * Copy `band` (page percent) from a canvas of `source` pixels into a crop `cssWidth` CSS px wide.
 * The height follows the band's aspect ratio, capped at `maxHeightPx`; the rest is cropped away
 * from the bottom so the first line stays whole.
 */
export function cropPlan(band: PercentBox, source: { width: number; height: number }, cssWidth: number, dpr: number, maxHeightPx: number): CropPlan {
  const sx = (band.left / 100) * source.width;
  const sy = (band.top / 100) * source.height;
  const sw = Math.max(1, (band.width / 100) * source.width);
  const fullSh = Math.max(1, (band.height / 100) * source.height);
  const cssHeight = Math.min((cssWidth * fullSh) / sw, maxHeightPx);
  const sh = Math.min(fullSh, (sw * cssHeight) / cssWidth);
  return { sx, sy, sw, sh, dw: Math.max(1, Math.round(cssWidth * dpr)), dh: Math.max(1, Math.round(cssHeight * dpr)), cssHeight };
}
