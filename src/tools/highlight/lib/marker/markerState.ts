import { HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';

export { HIGHLIGHT_COLORS };

export interface Marker { color: string; style: 'highlight' | 'underline'; opacity: number; /** READ-04: the underline's width in points; absent is UNDERLINE_WIDTH.default. */ strokeWidth?: number }

export const OPACITY_MIN = 0.3;

export const DEFAULT_MARKER: Marker = { color: HIGHLIGHT_COLORS[0].hex, style: 'highlight', opacity: 1 };

const clamp = (n: number) => Math.min(1, Math.max(OPACITY_MIN, n));

/** R5: the marker after a change; opacity stays within [0.3, 1]. */
export function rearm(m: Marker, change: Partial<Marker>): Marker {
  const next = { ...m, ...change };
  return { ...next, opacity: clamp(next.opacity) };
}

/** The color a Comment over an uncolored line lays. @testSeam */
export function commentBandColor(lastUsed: Marker | null): string {
  return lastUsed ? lastUsed.color : DEFAULT_MARKER.color;
}
