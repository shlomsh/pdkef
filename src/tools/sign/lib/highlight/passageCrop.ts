// SIGN-44: where a comment card's passage crop comes from on the page canvas, and how big it draws.
import type { PercentBox } from './commentCards.ts';

interface CropPlan {
  /** Source rect on the page canvas, in canvas pixels. */
  sx: number; sy: number; sw: number; sh: number;
  /** Backing-store size and CSS size of the crop canvas. */
  dw: number; dh: number; cssWidth: number; cssHeight: number;
}

/**
 * Copy the start of `band` (page percent) from a canvas of `source` pixels: the line drawn
 * `lineHeightPx` CSS px tall, as much of it as fits `maxCssWidth`, taken from where it is read first
 * (its left end, or its right end for right-to-left). A short band draws at its own width.
 */
export function cropPlan(
  band: PercentBox, source: { width: number; height: number }, maxCssWidth: number, dpr: number, lineHeightPx: number, direction: 'ltr' | 'rtl',
): CropPlan {
  const left = (band.left / 100) * source.width;
  const sy = (band.top / 100) * source.height;
  const fullSw = Math.max(1, (band.width / 100) * source.width);
  const sh = Math.max(1, (band.height / 100) * source.height);
  const scale = lineHeightPx / sh;
  const sw = Math.min(fullSw, maxCssWidth / scale);
  const cssWidth = sw * scale;
  const sx = direction === 'rtl' ? left + fullSw - sw : left;
  return { sx, sy, sw, sh, dw: Math.max(1, Math.round(cssWidth * dpr)), dh: Math.max(1, Math.round(lineHeightPx * dpr)), cssWidth, cssHeight: lineHeightPx };
}
