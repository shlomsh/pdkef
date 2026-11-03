// The viewfinder's pure side (SCAN-08): what to draw from the capture state, and where the video frame
// sits on screen. No DOM.
import type { CaptureParams, CaptureState } from '../lib/capture/types.ts';
import type { Hint, LiveView, Rect } from './types.ts';

/** The outline, hold ring and hint for the capture state at time `now` (ms, the same clock as obs.t). */
export function liveView(state: CaptureState, now: number, params?: CaptureParams): LiveView {
  void state; void now; void params;
  throw new Error('liveView: not built yet (SCAN-08 brief A)');
}

/** The hint's words: point, hold, or "Page {count}. Turn the page." */
export function hintText(hint: Hint, count: number, words: { hintPoint: string; hintHold: string; hintTurn: string }): string {
  void hint; void count; void words;
  throw new Error('hintText: not built yet (SCAN-08 brief A)');
}

/** Where the whole video frame lands in a box under object-fit: cover. */
export function coverRect(video: { width: number; height: number }, box: { width: number; height: number }): Rect {
  void video; void box;
  throw new Error('coverRect: not built yet (SCAN-08 brief A)');
}
