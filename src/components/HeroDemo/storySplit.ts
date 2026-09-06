/**
 * How the hero demo's one scroll span is divided between its two stories.
 *
 *   0 .............. SIGN_END           the permission slip, start to sent
 *   SIGN_END ....... CROSSFADE_START    dwell on the finished document
 *   CROSSFADE_START  CROSSFADE_END      dissolve to the inbox
 *   CROSSFADE_END .. 1                  the utility bill, start to sent
 *
 * The dwell is the point of these numbers. The first story used to finish at
 * 0.57 with the dissolve starting at 0.58, so the completed, signed document -
 * the one frame the whole story exists to arrive at - held for 1% of the span
 * before it began disappearing. Measured against the current tour height, the
 * split now gives the sign story 484svh (it had 485, so its pacing is
 * unchanged), the dwell 80svh (it had 8), the dissolve 52svh (34) and the bill
 * story 324svh (315).
 *
 * These are fractions of the tour's travel, which is set in index.astro
 * (`.home-tour` height, currently one stage plus 940svh). Change that height
 * and these fractions silently re-time both stories, so re-derive them against
 * it - the svh figures above are how.
 *
 * Its own module because ScrollDriver.tsx maps a scroll position *forward* to a
 * per-track progress and e2e/demo/heroDemoHelpers.js maps a per-track fraction
 * *back* to a scroll position. Those two have to agree, and the helper had the
 * old 0.57 / 0.62 / 0.37 copied into it as literals - so retiming the demo left
 * every scroll-driven demo test scrolling to the wrong place, with nothing
 * naming the cause.
 */
export const SIGN_END = 0.515;
export const CROSSFADE_START = 0.6;
export const CROSSFADE_END = 0.655;

/** Global tour progress for `fraction` through the given track. The inverse of
 * the local-progress maps in ScrollDriver.tsx's update(). */
export function trackProgress(key: 'sign' | 'blur', fraction: number): number {
  return key === 'sign'
    ? fraction * SIGN_END
    : CROSSFADE_END + fraction * (1 - CROSSFADE_END);
}
