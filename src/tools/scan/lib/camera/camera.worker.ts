// Observes each camera frame off the main thread (SCAN-08).
import { observeFrame } from '../capture/observe.ts';

self.onmessage = (e: MessageEvent<{ t: number; width: number; height: number; buffer: ArrayBuffer }>) => {
  const { t, width, height, buffer } = e.data;
  self.postMessage(observeFrame({ width, height, data: new Uint8ClampedArray(buffer) }, t));
};
