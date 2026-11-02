type SwipeIntent = 'wait' | 'mark' | 'scroll';

/** Screen px a finger must travel before its direction is read. */
const TOUCH_DECIDE_PX = 10;

/** How many times longer the sideways travel must be than the vertical for a press to be a mark. */
const SIDEWAYS_RATIO = 2;

/** What a touch press means from its travel so far: undecided, a mark (clearly sideways), or a scroll. */
export function swipeIntent(dx: number, dy: number): SwipeIntent {
  if (Math.hypot(dx, dy) < TOUCH_DECIDE_PX) return 'wait';
  return Math.abs(dx) >= SIDEWAYS_RATIO * Math.abs(dy) ? 'mark' : 'scroll';
}
