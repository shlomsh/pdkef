export type Layer = 'custom' | 'colors' | 'toolbar' | 'note';
export type KeyAction =
  | { type: 'color'; index: number }
  | { type: 'underline' }
  | { type: 'comment' }
  | { type: 'delete' }
  | { type: 'closeLayer'; layer: Layer | null }
  | { type: 'undo' }
  | { type: 'redo' }
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
    if (k === 'z') return { type: e.shiftKey ? 'redo' : 'undo' };
    if (k === 'y') return { type: 'redo' };
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
