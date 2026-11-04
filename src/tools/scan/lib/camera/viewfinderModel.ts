// The viewfinder's pure side (SCAN-08): what to draw from the capture state, and where the video frame
// sits on screen. No DOM.
import { formatMessage } from '#lib/text/formatMessage.ts';
import { DEFAULT_CAPTURE_PARAMS, type CaptureParams, type CaptureState, type FrameObservation } from '../capture/types.ts';
import { INITIAL_GUIDANCE, stepGuidance, type Guidance } from '../capture/guidance.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import type { Hint, LiveView, Rect } from './types.ts';

/** The ring stops short of full while the machine is still holding: full means the shot has been taken. */
const RING_WHILE_WAITING = 0.95;

/** The outline, hold ring and hint for the capture state at time `now` (ms, the same clock as obs.t). The hint is
 * the guidance's when there is one (SCAN-24), else the phase's own: point, hold or turn.
 * @testSeam The camera calls nextView; the tests read the phase's own view through this. */
export function liveView(state: CaptureState, now: number, params: CaptureParams = DEFAULT_CAPTURE_PARAMS, guidance: Guidance | null = null): LiveView {
  const { phase, smoothed, holdSince } = state;
  const own: Hint = phase === 'searching' ? 'point' : phase === 'waitingForChange' ? 'turn' : 'hold';
  const hold = phase === 'holding' && holdSince !== null ? Math.min(RING_WHILE_WAITING, Math.max(0, (now - holdSince) / params.holdMs)) : 0;
  return { quad: smoothed, locked: own === 'hold', hold, hint: guidance?.hint ?? own, spoken: guidance?.spoken ?? null, guidance: guidance ?? INITIAL_GUIDANCE };
}

/** The view after one more frame: the capture state the machine reached on `obs`, and the guidance stepped on from
 * the previous view's. A state updater, so frames never read a stale view. `view` is the part of the video frame
 * `obs` was analysed on (visibleShare); the outline comes back across the whole frame, where the overlay draws it. */
export function nextView(previous: LiveView, state: CaptureState, obs: FrameObservation, view: Rect = WHOLE_FRAME): LiveView {
  const next = liveView(state, obs.t, DEFAULT_CAPTURE_PARAMS, stepGuidance(previous.guidance, obs, state.phase));
  return next.quad ? { ...next, quad: toFrame(next.quad, view) } : next;
}

/** The whole video frame, 0..1. */
export const WHOLE_FRAME: Rect = { x: 0, y: 0, width: 1, height: 1 };

/** The part of the video frame that is on screen under object-fit: cover, as 0..1 of the frame. */
export function visibleShare(video: { width: number; height: number }, box: { width: number; height: number }): Rect {
  if (!video.width || !video.height || !box.width || !box.height) return WHOLE_FRAME;
  const cover = coverRect(video, box);
  const width = Math.min(1, box.width / cover.width);
  const height = Math.min(1, box.height / cover.height);
  return { x: Math.max(0, -cover.x / cover.width), y: Math.max(0, -cover.y / cover.height), width, height };
}

/** A quad across the view (0..1 of what is on screen) as a quad across the whole frame. */
export function toFrame(quad: Quad, view: Rect): Quad {
  const [a, b, c, d] = quad.map((p) => ({ x: view.x + p.x * view.width, y: view.y + p.y * view.height }));
  return [a, b, c, d];
}

/** The words for each hint, from ScanMessages. */
interface HintWords {
  hintPoint: string;
  hintHold: string;
  hintTurn: string;
  hintDuplicate: string;
  hintFit: string;
  hintCloser: string;
  hintContrast: string;
  hintFlatter: string;
}

const HINT_KEYS: Record<Hint, keyof HintWords> = {
  point: 'hintPoint',
  hold: 'hintHold',
  turn: 'hintTurn',
  duplicate: 'hintDuplicate',
  fit: 'hintFit',
  closer: 'hintCloser',
  contrast: 'hintContrast',
  flatter: 'hintFlatter',
};

/** The hint's words, with the page count filled in where they take one ("Page {count}. Turn the page."). */
export function hintText(hint: Hint, count: number, words: HintWords): string {
  return formatMessage(words[HINT_KEYS[hint]], { count });
}

/** Where the whole video frame lands in a box under object-fit: cover. */
export function coverRect(video: { width: number; height: number }, box: { width: number; height: number }): Rect {
  if (!video.width || !video.height) return { x: 0, y: 0, width: box.width, height: box.height };
  const scale = Math.max(box.width / video.width, box.height / video.height);
  const width = video.width * scale;
  const height = video.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}
