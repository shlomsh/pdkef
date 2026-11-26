import { useEffect, useReducer, useRef } from 'preact/hooks';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import type { Pins, Sides } from '../lib/edges/follow.ts';
import { NO_TRACE, shownSides, traceReducer } from '../lib/cornerTrace.ts';
import { pinsKey, quadKey } from '../lib/quad.ts';
import type { ScanPage } from '../state/scanWork.ts';

type TraceRequest = (id: number, quad: Quad, pins?: Pins | null) => Promise<Sides | null>;

/** The page's real border for its current quad and pins, asked for while Fine-tune edges is on; null until it lands. */
export function useCornerTrace(selected: ScanPage, onTrace: TraceRequest | undefined): Sides | null {
  const [state, dispatch] = useReducer(traceReducer, NO_TRACE);
  const seq = useRef(0);
  const key = `${quadKey(selected.quad)}#${pinsKey(selected.pins)}`;
  useEffect(() => {
    // The border is traced only while the person has Fine-tune edges on.
    if (!onTrace || !selected.fine) {
      dispatch({ type: 'cancelled' });
      return;
    }
    seq.current += 1;
    const mine = seq.current;
    dispatch({ type: 'asked', seq: mine });
    const { id, quad, pins } = selected;
    // reason: onTrace never rejects; a trace that fails is reported where it ran and resolves null.
    void onTrace(id, quad, pins).then((sides) => dispatch({ type: 'answered', seq: mine, id, key: `${quadKey(quad)}#${pinsKey(pins)}`, sides }));
    // onTrace is deliberately not a dependency: a new function identity is not a new page or quad.
  }, [selected.id, key, selected.fine]);
  return shownSides(state, selected.id, key, selected.fine);
}
