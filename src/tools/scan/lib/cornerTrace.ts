import type { Sides } from './edges/follow.ts';

/** What the corners view keeps of the border trace: the request it is waiting on and the last answer that landed. */
interface TraceState {
  /** The number of the request whose answer may still land; null when none is wanted (Fine-tune edges is off). */
  current: number | null;
  /** The answer, with the page and the quad-and-pins key it was computed for. */
  traced: { id: number; key: string; sides: Sides } | null;
}

type TraceAction =
  | { type: 'asked'; seq: number }
  | { type: 'cancelled' }
  | { type: 'answered'; seq: number; id: number; key: string; sides: Sides | null };

export const NO_TRACE: TraceState = { current: null, traced: null };

/** A newer request makes any older one's answer stale; an answer for a request that is no longer wanted, or a
 * trace that failed (null), changes nothing. */
export function traceReducer(state: TraceState, action: TraceAction): TraceState {
  if (action.type === 'asked') return { ...state, current: action.seq };
  if (action.type === 'cancelled') return { ...state, current: null };
  if (action.seq !== state.current || !action.sides) return state;
  return { ...state, traced: { id: action.id, key: action.key, sides: action.sides } };
}

/** The traced sides to show: only with Fine-tune edges on, and only for the page and the quad-and-pins key they were computed for. */
export function shownSides(state: TraceState, id: number, key: string, fine: boolean): Sides | null {
  const { traced } = state;
  return fine && traced && traced.id === id && traced.key === key ? traced.sides : null;
}
