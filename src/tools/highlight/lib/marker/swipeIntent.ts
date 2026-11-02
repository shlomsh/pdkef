import type { ReadingDirection } from '#lib/pageLayout/bands.ts';

type SwipeIntent = 'wait' | 'mark' | 'scroll';

/** Screen px a finger must travel before its direction is read. */
const TOUCH_DECIDE_PX = 10;

/** How many times longer the sideways travel must be than the vertical for a press to be a mark. */
const SIDEWAYS_RATIO = 2;

/** What a touch press means from its travel so far: undecided, a mark (clearly sideways), or a scroll. */
export function swipeIntent(dx: number, dy: number): SwipeIntent {
  if (Math.hypot(dx, dy) < TOUCH_DECIDE_PX) return 'wait';
  return sidewaysEnough(dx, dy) ? 'mark' : 'scroll';
}

/** A move at least twice as sideways as it is vertical: the direction a mark starts in. */
export function sidewaysEnough(dx: number, dy: number): boolean {
  return Math.abs(dx) >= SIDEWAYS_RATIO * Math.abs(dy);
}

/** Two fingers navigate (pinch, pan) and never mark: any touch event with a second finger down is one. */
export function isMultiTouch(event: Event): boolean {
  return ((event as TouchEvent).touches?.length ?? 0) > 1;
}

/** Screen px a move must travel sideways before it names a reading direction. */
const GESTURE_DIRECTION_PX = 8;

/**
 * @testSeam The reading direction a move shows: leftward is rtl, rightward ltr, once it is more sideways than vertical.
 * Not `sidewaysEnough`: a mouse dragged straight to a point lower down the passage leans that far down.
 */
export function gestureDirection(dx: number, dy: number): ReadingDirection | undefined {
  if (Math.abs(dx) < GESTURE_DIRECTION_PX || Math.abs(dx) <= Math.abs(dy)) return undefined;
  return dx < 0 ? 'rtl' : 'ltr';
}

/**
 * The direction a swipe reads, asked with the pointer's screen offset from the press: the text answer when there is
 * one, else the first sideways direction seen (kept), until then the fallback.
 */
export function directionLatch(text: ReadingDirection | undefined, fallback: ReadingDirection): (dx: number, dy: number) => ReadingDirection {
  let seen: ReadingDirection | undefined;
  return (dx, dy) => {
    if (text) return text;
    seen ??= gestureDirection(dx, dy);
    return seen ?? fallback;
  };
}
