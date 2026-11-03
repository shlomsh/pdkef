// Observes each camera frame off the main thread (SCAN-08).
import { observeFrame } from '../capture/observe.ts';
import type { FrameMessage } from './frameGrab.ts';

self.onmessage = (e: MessageEvent<FrameMessage>) => {
  const { t, width, height, buffer, patch } = e.data;
  const crop = patch ? { width: patch.width, height: patch.height, data: new Uint8ClampedArray(patch.buffer) } : null;
  self.postMessage(observeFrame({ width, height, data: new Uint8ClampedArray(buffer) }, t, crop));
};
