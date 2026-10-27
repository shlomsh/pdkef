/**
 * Fill mode (SNG-15): what a tap or a finger hovering near the page reaches for.
 *
 * SNG-14 measured this on Shlomi's iPhone: a flat 10 px tolerance missed a printed line
 * about 9 px tall, and a tap regularly lands on the printed label sitting above a field
 * rather than on the field itself. So reach is generous upward, into that label, and
 * tighter downward, past the writing line - see docs/sign-fill-mode.md, "Taps" and
 * "Hints".
 */
import type { PagePoint, ReachTarget } from './fillTypes.ts';

/** Tuning for {@link reachTarget}. Screen pixels throughout, and a multiple of the target's own height. */
export interface ReachOptions {
  /** Flat reach on every side, and the floor `labelReach`/`belowReach` can't shrink below. */
  reachPx?: number;
  /** Multiplies the target's height for the reach upward, into its printed label. */
  labelReach?: number;
  /** Multiplies the target's height for the reach downward, past its writing line. */
  belowReach?: number;
}

const DEFAULT_REACH_PX = 22;
const DEFAULT_LABEL_REACH = 1.5;
const DEFAULT_BELOW_REACH = 0.75;

/** How far `value` sits outside `[min, max]`, or 0 when it already falls inside. */
function outsideBy(value: number, min: number, max: number): number {
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}

/**
 * The single target a tap at `point` reaches for, or null when nothing is close enough.
 *
 * Distances are measured in screen pixels, not page percent, via `pxPerPercent`: a
 * finger's precision is a physical size that doesn't shrink when the page is zoomed in,
 * so the same flat `reachPx` budget applies at any zoom (SNG-16's camera changes the
 * zoom, not this). `labelReach` and `belowReach` scale with each target's own height
 * instead, so a tall field reaches further than a one-line one in absolute terms, but
 * never less than the flat floor.
 *
 * Scoring weighs a downward distance 2.5x a same-sized upward one, so of two candidates
 * an equal raw distance apart, the one approached from above - the one whose printed
 * label was actually tapped - wins. That is what keeps two stacked rows apart: a tap in
 * the gap between them reaches for the row below, not the one it just left.
 */
export function reachTarget(
  point: PagePoint,
  targets: ReachTarget[],
  pxPerPercent: { x: number; y: number },
  options?: ReachOptions,
): ReachTarget | null {
  const { reachPx = DEFAULT_REACH_PX, labelReach = DEFAULT_LABEL_REACH, belowReach = DEFAULT_BELOW_REACH } = options ?? {};
  const pointPx = { x: point.x * pxPerPercent.x, y: point.y * pxPerPercent.y };

  let best: ReachTarget | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    if (target.pageIndex !== point.pageIndex) continue;
    const { box } = target;
    const left = box.left * pxPerPercent.x;
    const top = box.top * pxPerPercent.y;
    const heightPx = box.height * pxPerPercent.y;

    const dx = outsideBy(pointPx.x, left, left + box.width * pxPerPercent.x);
    if (dx > reachPx) continue;

    const above = pointPx.y < top;
    const dy = outsideBy(pointPx.y, top, top + heightPx);
    const reach = Math.max(reachPx, (above ? labelReach : belowReach) * heightPx);
    if (dy > reach) continue;

    const score = (above ? dy : dy * 2.5) + dx;
    if (score < bestScore) {
      bestScore = score;
      best = target;
    }
  }
  return best;
}
