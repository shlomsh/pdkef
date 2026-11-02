import { PANEL_COLORS, type Marker } from './markerState.ts';

/** @testSeam */
export type Layer = 'custom' | 'toolbar' | 'note';
export type KeyAction =
  | { type: 'color'; index: number }
  | { type: 'underline' }
  | { type: 'comment' }
  | { type: 'delete' }
  | { type: 'closeLayer'; layer: Layer | null }
  | { type: 'zoom'; dir: 1 | -1 }
  | { type: 'zoomActual' };

interface KeyLike { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }

/** R9: what a keydown means. `layers` is ordered bottom to top. */
export function keyAction(e: KeyLike, ctx: { typing: boolean; layers: Layer[] }): KeyAction | null {
  if (e.key === 'Escape') return { type: 'closeLayer', layer: ctx.layers[ctx.layers.length - 1] ?? null };
  if (ctx.typing) return null;
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.toLowerCase();
  if (mod) {
    if (k === '=' || k === '+') return { type: 'zoom', dir: 1 };
    if (k === '-') return { type: 'zoom', dir: -1 };
    if (k === '0') return { type: 'zoomActual' };
    return null;
  }
  if (!ctx.layers.includes('toolbar')) return null;
  if (/^[1-6]$/.test(e.key)) return { type: 'color', index: Number(e.key) - 1 };
  if (k === 'u') return { type: 'underline' };
  if (k === 'c') return { type: 'comment' };
  if (e.key === 'Delete' || e.key === 'Backspace') return { type: 'delete' };
  return null;
}

/** R9: what a mark's key does to the mark; the toolbar and the touch panel both answer it. */
export function markKeyIntent(action: KeyAction, look: Marker): { change: Partial<Marker> } | { comment: true } | { delete: true } | null {
  if (action.type === 'color') return { change: { color: PANEL_COLORS[action.index].hex } };
  if (action.type === 'underline') return { change: { style: look.style === 'underline' ? 'highlight' : 'underline' } };
  if (action.type === 'comment') return { comment: true };
  if (action.type === 'delete') return { delete: true };
  return null;
}
