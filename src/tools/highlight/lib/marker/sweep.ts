// R13: a clicked mark sweeps in from its first letter, line by line, like a stroke of the marker.
// Pure timings and keyframes; the caller runs them on the new bands (DOM only, no state per frame).

const MIN_LINE_MS = 110;
const MAX_LINE_MS = 320;
/** Each line takes this much longer per px of its length, up to the cap. */
const MS_PER_PX = 0.3;
/** The next line starts when this share of the one before has been drawn. */
const NEXT_LINE_AT = 0.8;
const EASING = 'cubic-bezier(.3, .7, .3, 1)';

interface SweepPlan {
  /** One per line, in reading order: when it starts and how long it takes, in ms. */
  steps: Array<{ delay: number; duration: number }>;
  frames: Array<{ clipPath: string }>;
  easing: string;
}

/**
 * The sweep of a mark whose lines are `widths` px long, top to bottom. It reveals from the left edge in
 * left to right text and from the right edge in right to left text. Null when there is nothing to
 * draw, or under `prefers-reduced-motion: reduce`.
 */
export function planSweep({ widths, rtl, reducedMotion }: { widths: number[]; rtl: boolean; reducedMotion: boolean }): SweepPlan | null {
  if (reducedMotion || widths.length === 0) return null;
  let delay = 0;
  const steps = widths.map((width) => {
    const duration = Math.round(Math.min(MAX_LINE_MS, MIN_LINE_MS + width * MS_PER_PX));
    const step = { delay: Math.round(delay), duration };
    delay += duration * NEXT_LINE_AT;
    return step;
  });
  const hidden = rtl ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)';
  return { steps, frames: [{ clipPath: hidden }, { clipPath: 'inset(0)' }], easing: EASING };
}
