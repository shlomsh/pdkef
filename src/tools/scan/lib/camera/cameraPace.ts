// Whether this phone keeps up with the stream (SCAN-16). Pure. On an iPhone the photo comes at the track's size, so
// the camera runs as big as it can; a phone too slow for that steps down once, and past the smallest size the
// native camera takes over, which gives a full photo one page at a time. Results stay good; features give way.

/** Biggest first. The second keeps a page near 150 dpi on A4 when it fills most of the frame. */
export const CAMERA_SIZES = [
  { width: { ideal: 4096 }, height: { ideal: 3072 } },
  { width: { ideal: 2592 }, height: { ideal: 1944 } },
] as const;

/** Fewer checks a second than this and a page cannot hold still for auto. First guess, until an old phone tries it. */
const MIN_CHECKS_PER_SECOND = 3;
const WINDOW_MS = 1500;

interface PaceState {
  /** The index into CAMERA_SIZES the track runs at. */
  size: number;
  windowStart: number | null;
  checks: number;
  /** True once a verdict stands; nothing changes after it. */
  judged: boolean;
}

type PaceVerdict = 'keep' | 'stepDown' | 'tooSlow';

export const INITIAL_PACE: PaceState = { size: 0, windowStart: null, checks: 0, judged: false };

/** The first photo ends the judging: from there the main thread is busy with the page, not the camera. */
export const stopJudging = (state: PaceState): PaceState => ({ ...state, judged: true });

/** One finished check at time `t`. */
export function stepPace(state: PaceState, t: number): { state: PaceState; verdict: PaceVerdict } {
  if (state.judged) return { state, verdict: 'keep' };
  if (state.windowStart === null) return { state: { ...state, windowStart: t, checks: 0 }, verdict: 'keep' };
  const checks = state.checks + 1;
  const elapsed = t - state.windowStart;
  if (elapsed < WINDOW_MS) return { state: { ...state, checks }, verdict: 'keep' };
  if ((checks * 1000) / elapsed >= MIN_CHECKS_PER_SECOND) return { state: { ...state, checks, judged: true }, verdict: 'keep' };
  if (state.size + 1 < CAMERA_SIZES.length) return { state: { ...state, size: state.size + 1, windowStart: null, checks: 0 }, verdict: 'stepDown' };
  return { state: { ...state, checks, judged: true }, verdict: 'tooSlow' };
}
