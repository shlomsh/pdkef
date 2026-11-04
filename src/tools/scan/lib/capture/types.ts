// The contract of the live-capture decision logic (docs/scan-next.md, SCAN-07):
// frame observations in, at most one "capture" event out. Pure: no DOM, no timers.
import type { Quad } from '../quad.ts';

/** One analysed camera frame. */
export interface FrameObservation {
  /** ms, monotonic, supplied by the caller. */
  t: number;
  /** Normalized; null = no page. */
  quad: Quad | null;
  /** 0..1. */
  confidence: number;
  /** Laplacian variance inside the quad. */
  sharpness: number;
  /** Normalized quad area, 0..1. */
  area: number;
  /** 16 hex chars, 64-bit average hash of the frame's page region. */
  hash: string;
  /** focusMeasure of the centre crop; 0 when there is no crop. */
  focus: number;
  // The guidance's signals (SCAN-24, lib/capture/pageSignals.ts). Optional: the capture machine never reads them,
  // and a recorded sequence without them gets the plain hints.
  /** 0..1, how far the page's border steps in brightness from what it lies on; absent without a page or a view past it. */
  contrast?: number;
  /** 0..1, the shorter over the longer of each pair of opposite sides, the smaller pair; 1 is seen straight on. */
  keystone?: number;
  /** 0..1, the 20th-percentile brightness of the whole frame: high when nothing dark is in view. */
  light?: number;
}

/** `duplicate` (SCAN-23): a page that matches one already taken is in view; nothing fires until it changes. */
export type CapturePhase = 'searching' | 'locked' | 'holding' | 'waitingForChange' | 'duplicate';

export interface CaptureState {
  phase: CapturePhase;
  /** Corners smoothed across frames; null when no page is being followed. */
  smoothed: Quad | null;
  /** When the current still-and-sharp stretch began; null when not holding. */
  holdSince: number | null;
  /** Hash of the page taken last; the same page is not taken twice. */
  lastCaptureHash: string | null;
  /** t of the previous frame, to spot dropped frames. */
  lastT: number | null;
  /** The previous frame's raw quad, to measure jitter. */
  prevQuad: Quad | null;
  /** Since when the page has been missing (waitingForChange only). */
  lostSince: number | null;
  /** The focus at the start of the settle window; null when not holding. */
  focusAnchor: number | null;
  /** Since when focus has been settled in this hold; null when not holding. */
  settledSince: number | null;
}

/** First guesses, to be tuned on recorded sequences (SCAN-05). */
export interface CaptureParams {
  /** Lowest detector confidence that counts as a page. */
  minConfidence: number;
  /** Smallest normalized quad area worth taking. */
  minArea: number;
  /** Lowest Laplacian variance that counts as in focus. */
  minSharpness: number;
  /** How long the page must stay still and sharp before the shot. */
  holdMs: number;
  /** A frame's focus must stay within this fraction of the hold's best, and not improve past it, to count as settled. */
  settleRatio: number;
  /** How long focus must stay settled before the shot. */
  settleMs: number;
  /** Largest corner movement (normalized, per frame) that still counts as still. */
  jitterThreshold: number;
  /** A corner farther than this from its smoothed place is a new page position: smoothing and hold restart. */
  jumpThreshold: number;
  /** Weight of the newest frame in the per-corner moving average, 0..1. */
  smoothingAlpha: number;
  /** A gap between frames longer than this interrupts the hold. */
  maxGapMs: number;
  /** The page must be missing this long to re-arm after a shot. */
  leaveMs: number;
  /** A hash this many bits away from the last shot's is a different page. */
  changeDistance: number;
}

export const DEFAULT_CAPTURE_PARAMS: CaptureParams = {
  minConfidence: 0.6,
  minArea: 0.2,
  minSharpness: 100,
  holdMs: 800,
  settleRatio: 0.8,
  settleMs: 400,
  jitterThreshold: 0.01,
  jumpThreshold: 0.12,
  smoothingAlpha: 0.5,
  maxGapMs: 250,
  leaveMs: 800,
  changeDistance: 12,
};

/** capture = the smoothed quad to take, on the one frame that fires; null otherwise. */
export interface CaptureStep {
  state: CaptureState;
  capture: Quad | null;
}
