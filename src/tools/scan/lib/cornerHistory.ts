import type { Quad } from '#lib/pageEnhance/quad.ts';
import type { Pins } from './edges/follow.ts';

/** A page's corners, the pins placed with them and whether Fine-tune edges is on: what one undo step restores. */
export interface CornerShape { quad: Quad; pins: Pins | null; fine: boolean }
export interface CornerHistory { past: CornerShape[]; future: CornerShape[] }

export const NO_HISTORY: CornerHistory = Object.freeze({ past: [], future: [] }) as CornerHistory;
/** The most steps a page's history keeps. @testSeam */
export const MAX_CORNER_STEPS = 50;

/** After a change: `before` is what the page was. Redo is cleared; the oldest step drops past MAX_CORNER_STEPS. A `before` equal to the last recorded step is still recorded: every committed change is one step. */
export function recorded(history: CornerHistory, before: CornerShape): CornerHistory {
  const past = [...history.past, before];
  return { past: past.length > MAX_CORNER_STEPS ? past.slice(past.length - MAX_CORNER_STEPS) : past, future: [] };
}

/** One step back from `current`: the shape to show and the history after it; null when there is nothing to undo. */
export function undone(history: CornerHistory, current: CornerShape): { history: CornerHistory; shape: CornerShape } | null {
  if (history.past.length === 0) return null;
  const shape = history.past[history.past.length - 1];
  return { shape, history: { past: history.past.slice(0, -1), future: [current, ...history.future] } };
}

/** One step forward again; null when there is nothing to redo. */
export function redone(history: CornerHistory, current: CornerShape): { history: CornerHistory; shape: CornerShape } | null {
  if (history.future.length === 0) return null;
  const [shape, ...future] = history.future;
  return { shape, history: { past: [...history.past, current], future } };
}
