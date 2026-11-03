// The live camera's shutter decision. One frame observation in, the next state and, on the one
// frame that fires, the smoothed quad to take. Pure: no DOM, no timers; time is obs.t.
//
//   searching --good, sharp page--> locked --still--> holding --holdMs AND focus settled settleMs--> FIRE
//   holding/locked --jitter, jump, blur, dropped frame--> locked / searching (hold and settle restart)
//   holding stays holding while focus is still rising or has dropped: the settle restarts, the hold does not
//   FIRE --> waitingForChange --page gone leaveMs, or hash differs--> searching
import type { Point, Quad } from '../quad.ts';
import { hashDistance } from './hash.ts';
import {
  DEFAULT_CAPTURE_PARAMS,
  type CaptureParams,
  type CaptureState,
  type CaptureStep,
  type FrameObservation,
} from './types.ts';

export const INITIAL_CAPTURE_STATE: CaptureState = {
  phase: 'searching',
  smoothed: null,
  holdSince: null,
  lastCaptureHash: null,
  lastT: null,
  prevQuad: null,
  lostSince: null,
  focusAnchor: null,
  settledSince: null,
};

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const maxCornerDistance = (a: Quad, b: Quad) => Math.max(...a.map((p, i) => dist(p, b[i])));
const blend = (old: Quad, next: Quad, alpha: number): Quad =>
  old.map((p, i) => ({ x: p.x + (next[i].x - p.x) * alpha, y: p.y + (next[i].y - p.y) * alpha })) as Quad;

export function stepCapture(
  state: CaptureState,
  obs: FrameObservation,
  params: CaptureParams = DEFAULT_CAPTURE_PARAMS,
): CaptureStep {
  const good = obs.quad !== null && obs.confidence >= params.minConfidence && obs.area >= params.minArea;
  const base: CaptureState = { ...state, lastT: obs.t, prevQuad: good ? obs.quad : null };
  let current = state;

  if (state.phase === 'waitingForChange') {
    if (!good) {
      const lostSince = state.lostSince ?? obs.t;
      if (obs.t - lostSince >= params.leaveMs) {
        current = { ...INITIAL_CAPTURE_STATE, lastCaptureHash: state.lastCaptureHash };
        return { state: { ...current, lastT: obs.t }, capture: null };
      }
      return { state: { ...base, lostSince }, capture: null };
    }
    const differs = state.lastCaptureHash !== null && hashDistance(obs.hash, state.lastCaptureHash) > params.changeDistance;
    if (!differs) return { state: { ...base, lostSince: null }, capture: null };
    // A different page in front of the camera: carry on as if searching, with this frame.
    current = { ...INITIAL_CAPTURE_STATE, lastCaptureHash: state.lastCaptureHash };
  }

  if (!good || !obs.quad) {
    return { state: { ...current, phase: 'searching', smoothed: null, holdSince: null, focusAnchor: null, settledSince: null, lastT: obs.t, prevQuad: null }, capture: null };
  }

  const dropped = current.lastT !== null && obs.t - current.lastT > params.maxGapMs;
  const jumped = current.smoothed !== null && maxCornerDistance(current.smoothed, obs.quad) > params.jumpThreshold;
  const restart = current.smoothed === null || dropped || jumped;
  const smoothed = restart ? obs.quad : blend(current.smoothed as Quad, obs.quad, params.smoothingAlpha);
  const jittery = current.prevQuad !== null && maxCornerDistance(current.prevQuad, obs.quad) > params.jitterThreshold;
  const sharp = obs.sharpness >= params.minSharpness;
  const next = { ...current, smoothed, lastT: obs.t, prevQuad: obs.quad, lostSince: null };

  if (!sharp) return { state: { ...next, phase: 'searching', holdSince: null, focusAnchor: null, settledSince: null }, capture: null };
  if (restart || jittery) return { state: { ...next, phase: 'locked', holdSince: null, focusAnchor: null, settledSince: null }, capture: null };

  const holdSince = current.holdSince ?? current.lastT ?? obs.t;
  // Settled: every frame since the anchor sits within settleRatio of it, either way. Leaving that band starts a new
  // window from this frame, so a slow climb keeps waiting and one stray frame costs one window, not the shot.
  const anchor = current.focusAnchor;
  const moved = anchor === null || obs.focus < anchor * params.settleRatio || obs.focus * params.settleRatio > anchor;
  const focusAnchor = moved ? obs.focus : anchor;
  const settledSince = moved ? obs.t : (current.settledSince as number);
  if (obs.t - holdSince >= params.holdMs && obs.t - settledSince >= params.settleMs) {
    return { state: { ...next, phase: 'waitingForChange', holdSince: null, focusAnchor: null, settledSince: null, lastCaptureHash: obs.hash }, capture: smoothed };
  }
  return { state: { ...next, phase: 'holding', holdSince, focusAnchor, settledSince }, capture: null };
}

/** A shot the shutter took by hand: wait for the page to change, so auto does not take it again. */
export function markTaken(state: CaptureState, hash: string): CaptureState {
  return { ...state, phase: 'waitingForChange', lastCaptureHash: hash, holdSince: null, focusAnchor: null, settledSince: null, lostSince: null };
}
