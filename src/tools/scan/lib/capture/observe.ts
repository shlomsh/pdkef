// One analysed camera frame for the capture machine (SCAN-08). Pure: gray pixels and a time in, the
// observation stepCapture reads out. Runs in the camera worker.
import type { GrayImage } from '../quad.ts';
import type { FrameObservation } from './types.ts';

/** detectPage, then sharpness, area and hash of what it found. With no page: quad null, confidence 0,
 * sharpness and area 0, and the hash of the whole frame. */
export function observeFrame(image: GrayImage, t: number): FrameObservation {
  void image; void t;
  throw new Error('observeFrame: not built yet (SCAN-08 brief A)');
}
