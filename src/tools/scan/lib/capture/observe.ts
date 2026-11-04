// One analysed camera frame for the capture machine (SCAN-08). Pure: gray pixels and a time in, the
// observation stepCapture reads out. Runs in the camera worker.
import type { GrayImage } from '../quad.ts';
import { detectPage } from '../edges/detect.ts';
import { averageHash } from './hash.ts';
import { borderContrast, keystone, lightFloor } from './pageSignals.ts';
import { focusMeasure, quadArea, sharpness } from './sharpness.ts';
import type { FrameObservation } from './types.ts';

/** detectPage, then sharpness, area and hash of what it found. With no page: quad null, confidence 0,
 * sharpness and area 0, and the hash of the whole frame. `focus` is focusMeasure of the centre patch, 0 without one.
 * The guidance signals (SCAN-24): `light` always, `contrast` and `keystone` with a page (contrast left out when no
 * point of the page's border has a view outside it). */
export function observeFrame(image: GrayImage, t: number, patch: GrayImage | null): FrameObservation {
  const focus = patch ? focusMeasure(patch) : 0;
  const light = lightFloor(image);
  const { quad, confidence } = detectPage(image);
  if (!quad) return { t, quad: null, confidence: 0, sharpness: 0, area: 0, hash: averageHash(image, null), focus, light };
  const contrast = borderContrast(image, quad) ?? undefined;
  return {
    t, quad, confidence, sharpness: sharpness(image, quad), area: quadArea(quad), hash: averageHash(image, quad), focus,
    light, contrast, keystone: keystone(quad, image.width, image.height),
  };
}
