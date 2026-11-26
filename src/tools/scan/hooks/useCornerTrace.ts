import { useEffect, useRef, useState } from 'preact/hooks';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import type { Pins, Sides } from '../lib/edges/follow.ts';
import { NO_TRACE, shownSides, traceReducer } from '../lib/cornerTrace.ts';
import { pinsKey, quadKey } from '../lib/quad.ts';
import type { ScanPage } from '../state/scanWork.ts';

type TraceRequest = (id: number, quad: Quad, pins?: Pins | null) => Promise<Sides | null>;

/** The page's real border for its current quad and pins, asked for while Fine-tune edges is on; null until it lands. */
export function useCornerTrace(selected: ScanPage, onTrace: TraceRequest | undefined): Sides | null {
  // The reducer's state lives in a ref; only a landed answer re-renders, as the view did before the trace moved here.
  const trace = useRef(NO_TRACE);
  const [, setTraced] = useState(NO_TRACE.traced);
  const dispatch = (action: Parameters<typeof traceReducer>[1]) => {
    trace.current = traceReducer(trace.current, action);
    setTraced(trace.current.traced);
  };
  const seq = useRef(0);
  const key = `${quadKey(selected.quad)}#${pinsKey(selected.pins)}`;
  useEffect(() => {
    // The border is traced only while the person has Fine-tune edges on.
    if (!onTrace || !selected.fine) return undefined;
    seq.current += 1;
    const mine = seq.current;
    dispatch({ type: 'asked', seq: mine });
    const { id, quad, pins } = selected;
    // reason: onTrace never rejects; a trace that fails is reported where it ran and resolves null.
    void onTrace(id, quad, pins).then((sides) => dispatch({ type: 'answered', seq: mine, id, key: `${quadKey(quad)}#${pinsKey(pins)}`, sides }));
    // A newer page, quad or pins, Fine-tune turned off, or the view leaving: this request's answer must not land.
    return () => dispatch({ type: 'cancelled' });
    // onTrace is deliberately not a dependency: a new function identity is not a new page or quad.
  }, [selected.id, key, selected.fine]);
  return shownSides(trace.current, selected.id, key, selected.fine);
}
