import { useCallback, useState } from 'preact/hooks';

const coarsePointer = () => Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);

/**
 * READ-03 on touch (R50): a file opens with the marker in the hand, and a tap on its button puts it down or
 * picks it up again. Only a sideways start on a line marks (R52), so reading with a finger still scrolls. A
 * fine pointer never reads this; its marker is always armed (R1). READ-07 later replaces it with long-press
 * and drag.
 */
export function useTouchArming() {
  const [armed, setArmed] = useState(coarsePointer);
  const arm = useCallback(() => setArmed(true), []);
  const disarm = useCallback(() => setArmed(false), []);
  return { armed, arm, disarm };
}
