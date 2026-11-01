import { useCallback, useState } from 'preact/hooks';

/**
 * READ-03 on touch: the marker is armed by a tap on its button and put down by Stop, so a swipe scrolls the
 * page until then. A fine pointer never reads this; its marker is always armed (R1). READ-07 later replaces
 * it with long-press and drag.
 */
export function useTouchArming() {
  const [armed, setArmed] = useState(false);
  const arm = useCallback(() => setArmed(true), []);
  const disarm = useCallback(() => setArmed(false), []);
  return { armed, arm, disarm };
}
