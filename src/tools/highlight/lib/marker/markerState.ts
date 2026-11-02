import { HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';
import { UNDERLINE_WIDTH } from '#editor/model/underlineInk.ts';

export { HIGHLIGHT_COLORS };

export interface Marker { color: string; style: 'highlight' | 'underline'; opacity: number; /** READ-04: the underline's width in points; absent is UNDERLINE_WIDTH.default. */ strokeWidth?: number }

export const OPACITY_MIN = 0.3;

/** Half strength by default: phones draw ink over the page without the multiply blend, so full strength would hide the text. */
export const DEFAULT_MARKER: Marker = { color: HIGHLIGHT_COLORS[0].hex, style: 'highlight', opacity: 0.5 };

const clamp = (n: number) => Math.min(1, Math.max(OPACITY_MIN, n));

export const clampWidth = (n: number) => Math.min(UNDERLINE_WIDTH.max, Math.max(UNDERLINE_WIDTH.min, n));

/** R5: the marker after a change; opacity stays within [0.3, 1]. */
export function rearm(m: Marker, change: Partial<Marker>): Marker {
  const next = { ...m, ...change };
  const { strokeWidth, ...rest } = next;
  return { ...rest, opacity: clamp(next.opacity), ...(strokeWidth === undefined ? {} : { strokeWidth: clampWidth(strokeWidth) }) };
}

/** The color a Comment over an uncolored line lays. @testSeam */
export function commentBandColor(lastUsed: Marker | null): string {
  return lastUsed ? lastUsed.color : DEFAULT_MARKER.color;
}
