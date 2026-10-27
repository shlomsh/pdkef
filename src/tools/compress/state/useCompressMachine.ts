import { useRef, useState } from 'preact/hooks';
import type { MutableRef } from 'preact/hooks';
import { transition, initialCompressState, type CompressEvent, type CompressState } from './compressMachine.ts';

/**
 * Holds the compress machine with one source of truth: the current state lives in a single ref. `send`
 * computes the next state, stores it at once (so a callback that runs before the next render reads it
 * synchronously through `read`) and forces a render when something changed.
 */
export function useCompressMachine() {
  const stateRef = useRef<CompressState>(initialCompressState);
  const [, force] = useState(0);
  const apiRef = useRef<{
    send: (event: CompressEvent) => void;
    read: () => CompressState;
    runTokenRef: MutableRef<number>;
  } | null>(null);
  if (!apiRef.current) {
    apiRef.current = {
      send: (event) => {
        const next = transition(stateRef.current, event);
        if (next === stateRef.current) return;
        stateRef.current = next;
        force((n) => n + 1);
      },
      read: () => stateRef.current,
      // The run token as the ref useComparePreviews asks for: a live view of the machine, not a copy.
      runTokenRef: { get current() { return stateRef.current.runToken; }, set current(_: number) {} } as MutableRef<number>,
    };
  }
  return { state: stateRef.current, ...apiRef.current };
}
