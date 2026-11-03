// The viewfinder's pure side (SCAN-08): what to draw from the capture state, and where the video frame
// sits on screen. No DOM.
import { formatMessage } from '#lib/text/formatMessage.ts';
import { DEFAULT_CAPTURE_PARAMS, type CaptureParams, type CaptureState } from '../capture/types.ts';
import type { Hint, LiveView, Rect } from './types.ts';

/** The ring stops short of full while the machine is still holding: full means the shot has been taken. */
const RING_WHILE_WAITING = 0.95;

/** The outline, hold ring and hint for the capture state at time `now` (ms, the same clock as obs.t). */
export function liveView(state: CaptureState, now: number, params: CaptureParams = DEFAULT_CAPTURE_PARAMS): LiveView {
  const { phase, smoothed, holdSince } = state;
  const hint: Hint = phase === 'searching' ? 'point' : phase === 'waitingForChange' ? 'turn' : 'hold';
  const hold = phase === 'holding' && holdSince !== null ? Math.min(RING_WHILE_WAITING, Math.max(0, (now - holdSince) / params.holdMs)) : 0;
  return { quad: smoothed, locked: hint === 'hold', hold, hint };
}

/** The hint's words: point, hold, or "Page {count}. Turn the page." */
export function hintText(hint: Hint, count: number, words: { hintPoint: string; hintHold: string; hintTurn: string }): string {
  if (hint === 'point') return words.hintPoint;
  if (hint === 'hold') return words.hintHold;
  return formatMessage(words.hintTurn, { count });
}

/** Where the whole video frame lands in a box under object-fit: cover. */
export function coverRect(video: { width: number; height: number }, box: { width: number; height: number }): Rect {
  if (!video.width || !video.height) return { x: 0, y: 0, width: box.width, height: box.height };
  const scale = Math.max(box.width / video.width, box.height / video.height);
  const width = video.width * scale;
  const height = video.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}
