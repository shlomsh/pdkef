import { useCallback, useState } from 'preact/hooks';

/** Whether the primary pointer is a finger. Read when asked. */
export const coarsePointer = () => Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);

/**
 * Whether the marker is in the hand, for every pointer: a file opens armed, a click or tap on its button
 * puts it down or picks it up again, and it stays armed after each mark (reading is many marks in a row).
 * Put down, the page does nothing marker-like. With a finger, only a sideways start on a line marks (R52),
 * so reading still scrolls. READ-07 later replaces the finger's side with long-press and drag.
 */
export function useMarkerArming() {
  const [armed, setArmed] = useState(true);
  const arm = useCallback(() => setArmed(true), []);
  const disarm = useCallback(() => setArmed(false), []);
  return { armed, arm, disarm };
}
