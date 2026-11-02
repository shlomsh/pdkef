import { HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';
import { UNDERLINE_WIDTH } from '#editor/model/underlineInk.ts';


/** The three most popular highlighters, in the order the panel shows them; the rest sit behind "more". */
export const TOP_COLORS = (['yellow', 'pink', 'green'] as const).map((id) => HIGHLIGHT_COLORS.find((c) => c.id === id)!);
/** The colors behind "more", in palette order. */
export const MORE_COLORS = HIGHLIGHT_COLORS.filter((c) => !TOP_COLORS.includes(c));
/** The colors in the order the panel shows them, which is the order of the keys 1 to 6 (R9). */
export const PANEL_COLORS = [...TOP_COLORS, ...MORE_COLORS];

const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const isTopColor = (hex: string) => TOP_COLORS.some((c) => sameColor(c.hex, hex));

export interface Marker { color: string; style: 'highlight' | 'underline'; opacity: number; /** READ-04: the underline's width in points; absent is UNDERLINE_WIDTH.default. */ strokeWidth?: number; /** READ-11: absent is Clean; a change to Clean is `{ stroke: undefined }`. */ stroke?: 'sketch' }

export const OPACITY_MIN = 0.3;

/** Half strength by default: phones draw ink over the page without the multiply blend, so full strength would hide the text. */
export const DEFAULT_MARKER: Marker = { color: HIGHLIGHT_COLORS[0].hex, style: 'highlight', opacity: 0.5 };

const clamp = (n: number) => Math.min(1, Math.max(OPACITY_MIN, n));

export const clampWidth = (n: number) => Math.min(UNDERLINE_WIDTH.max, Math.max(UNDERLINE_WIDTH.min, n));

/** R5: the marker after a change; opacity stays within [0.3, 1]. */
export function rearm(m: Marker, change: Partial<Marker>): Marker {
  const next = { ...m, ...change };
  const { strokeWidth, stroke, ...rest } = next;
  return { ...rest, opacity: clamp(next.opacity), ...(strokeWidth === undefined ? {} : { strokeWidth: clampWidth(strokeWidth) }), ...(stroke ? { stroke } : {}) };
}

/** The color a Comment over an uncolored line lays. @testSeam */
export function commentBandColor(lastUsed: Marker | null): string {
  return lastUsed ? lastUsed.color : DEFAULT_MARKER.color;
}
