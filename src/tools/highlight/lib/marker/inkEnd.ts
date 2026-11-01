import type { HighlightElement } from '#editor/model/editorModel.ts';

/** The end of a highlight's ink in page percent: where the last band stops in reading direction, and that line's top and bottom. */
export function inkEnd(el: HighlightElement): { x: number; top: number; bottom: number } {
  const rtl = el.direction === 'rtl';
  const band = el.bands[el.bands.length - 1];
  if (!band) return { x: rtl ? el.left : el.left + el.width, top: el.top, bottom: el.top + el.height };
  const left = el.left + (band.left / 100) * el.width;
  const top = el.top + (band.top / 100) * el.height;
  return {
    x: rtl ? left : left + (band.width / 100) * el.width,
    top,
    bottom: top + (band.height / 100) * el.height,
  };
}

const GAP = 6;
const EDGE = 8;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

export interface BarPlacement { side: 'above' | 'below'; top: number; edge: number; align: 'left' | 'right' }

/**
 * Viewport px. The toolbar sits above the line, or below it when there is no room, never over it. `edge`
 * is the viewport x of the edge that stays still while the color row grows (left in LTR, right in RTL).
 */
export function placeBar({ x, lineTop, lineBottom, barW, barMaxW, barH, vw, vh, topMin, rtl }: {
  x: number; lineTop: number; lineBottom: number; barW: number; barMaxW: number; barH: number;
  vw: number; vh: number; topMin: number; rtl: boolean;
}): BarPlacement {
  const above = lineTop - GAP - barH >= topMin;
  const top = Math.min(above ? lineTop - GAP - barH : lineBottom + GAP, vh - barH - EDGE);
  if (rtl) {
    const right = clamp(vw - (x + barW / 2), EDGE, vw - EDGE - barMaxW);
    return { side: above ? 'above' : 'below', top, edge: vw - right, align: 'right' };
  }
  return { side: above ? 'above' : 'below', top, edge: clamp(x - barW / 2, EDGE, vw - EDGE - barMaxW), align: 'left' };
}
