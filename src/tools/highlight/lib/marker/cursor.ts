// R14: over the page the cursor is the pen in the hand. A 24 px highlighter leaning right, its tip in
// the armed color: a chisel for highlighting, a fine tip for underlining. The hotspot is the tip.
// Drawn on a 32 grid and shown at 24 css px; the numbers come from the READ-01 sketch.
import { underlineInk } from '#editor/model/underlineInk.ts';
import type { Marker } from './markerState.ts';

export const CURSOR_SIZE = 24;
export const CURSOR_FALLBACK = 'crosshair';

const GRID = 32;
/** The tip on the 32 grid, after the pen is turned. */
const TIP_ON_GRID = { x: 6, y: 29 };
/** The least a tip shows: a 0.3 marker still reads as a colored tip. */
const MIN_TIP_OPACITY = 0.55;
const INK = '#173636';
const HALO = '#FFFFFF';

const onSize = (n: number) => Math.round((n * CURSOR_SIZE) / GRID);
export const CURSOR_HOTSPOT = { x: onSize(TIP_ON_GRID.x), y: onSize(TIP_ON_GRID.y) };

/** The pen's outline, upright with the tip at (16, 30): a chisel for highlighting, a fine point for underlining. */
function outlinePath(underline: boolean): string {
  const head = 'M10 5.4a2.4 2.4 0 0 1 2.4-2.4h7.2a2.4 2.4 0 0 1 2.4 2.4v17.1';
  return `${head}${underline ? 'h-3.5L16 30l-2.5-7.5H10' : 'h-2v3.2L13.6 30H12v-7.5h-2'}z`;
}

/** The cursor image for the armed marker, as svg markup. */
export function cursorSvg({ color, style, opacity }: Marker): string {
  const underline = style === 'underline';
  const ink = underline ? underlineInk(color) : color;
  const tip = underline
    ? `<path data-tip="fine" fill="${ink}" d="M13.5 22.5h5L16 30z"/>`
    : `<path data-tip="chisel" fill="${color}" fill-opacity="${Math.max(MIN_TIP_OPACITY, opacity)}" d="M12 22.5h8v3.2L13.6 30H12z"/>`;
  const body = `<rect x="10" y="3" width="12" height="19.5" rx="2.4" fill="#fff"/>`
    + `<path d="M10 7.5V5.4A2.4 2.4 0 0 1 12.4 3h7.2A2.4 2.4 0 0 1 22 5.4v2.1z" fill="${ink}"/>`
    + `<path d="M10.6 18h10.8" stroke="${INK}" stroke-width=".8" stroke-opacity=".45"/>`;
  const outline = (stroke: string, width: number) => `<path fill="none" stroke-linejoin="round" stroke="${stroke}" stroke-width="${width}" d="${outlinePath(underline)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CURSOR_SIZE}" height="${CURSOR_SIZE}" viewBox="0 0 ${GRID} ${GRID}">`
    + `<g transform="translate(-10 -1) rotate(38 16 30)">${outline(HALO, 3.2)}${tip}${body}${outline(INK, 1.3)}</g></svg>`;
}

/** The css `cursor` value: the image, its hotspot, then a crosshair for a browser that cannot show the image. */
export function cursorValue(marker: Marker): string {
  return `url("data:image/svg+xml,${encodeURIComponent(cursorSvg(marker))}") ${CURSOR_HOTSPOT.x} ${CURSOR_HOTSPOT.y}, ${CURSOR_FALLBACK}`;
}
