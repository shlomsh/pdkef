// One analysed camera frame for the capture machine (SCAN-08). Pure: gray pixels and a time in, the
// observation stepCapture reads out. Runs in the camera worker.
import type { GrayImage } from '../quad.ts';
import { detectPage } from '../edges/detect.ts';
import { averageHash } from './hash.ts';
import { quadArea, sharpness } from './sharpness.ts';
import type { FrameObservation } from './types.ts';

/** detectPage, then sharpness, area and hash of what it found. With no page: quad null, confidence 0,
 * sharpness and area 0, and the hash of the whole frame. */
export function observeFrame(image: GrayImage, t: number): FrameObservation {
  const { quad, confidence } = detectPage(image);
  if (!quad) return { t, quad: null, confidence: 0, sharpness: 0, area: 0, hash: averageHash(image, null) };
  return { t, quad, confidence, sharpness: sharpness(image, quad), area: quadArea(quad), hash: averageHash(image, quad) };
}
