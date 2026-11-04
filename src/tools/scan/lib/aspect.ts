// A page's true proportions from its four corners in a photo (SCAN-34). Pure: no DOM.
//
// Zhang and He, "Whiteboard scanning and image enhancement" (2007): with the principal point at the
// photo's centre and square pixels, the homography H = [h1 h2 h3] taking the unit square onto the quad
// is K [w r1, h r2, t] up to scale, K = diag(f, f, 1). r1 and r2 are orthogonal unit vectors, so
//   f^2 = -(h11 h12 + h21 h22) / (h31 h32)          (h1 and h2 are the two vanishing points)
//   w / h = |K^-1 h1| / |K^-1 h2|.
// A near-frontal shot (both pairs of opposite sides nearly parallel) cannot be solved, and there the
// edge-length sizing is already right, so the caller keeps it. With only one pair nearly parallel the
// focal length is still usable when it lands in a phone camera's range: on simulated photos with 2px
// corner noise that beats the edge lengths in every case measured (SCAN-34).
import type { Quad } from './quad';
import { homography } from './homography.ts';

/** Both vanishing points farther than this many long sides from the centre: a near-frontal view. */
const FRONTAL_VANISHING_DISTANCE = 20;
/** Phone cameras: the focal length in pixels is between these multiples of the photo's long side. */
const MIN_FOCAL = 0.5;
const MAX_FOCAL = 3;

/** The page's width / height (top edge over left edge), or null when the corners cannot tell it. */
export function pageAspect(quadPx: Quad, imageWidth: number, imageHeight: number): number | null {
  const long = Math.max(imageWidth, imageHeight);
  if (!(long > 0)) return null;
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;
  // Centred on the principal point and scaled by the long side, so every threshold is unitless.
  const quad = quadPx.map((p) => ({ x: (p.x - cx) / long, y: (p.y - cy) / long })) as Quad;
  let h;
  try {
    h = homography([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], quad);
  } catch {
    // expected: three corners on a line define no perspective; the caller keeps the edge lengths.
    return null;
  }
  const [a1, a2, , b1, b2, , c1, c2] = h;
  // Each vanishing point's distance from the centre is |(a, b)| / |c|; far means parallel sides.
  const far1 = !(Math.abs(c1) * FRONTAL_VANISHING_DISTANCE > Math.hypot(a1, b1));
  const far2 = !(Math.abs(c2) * FRONTAL_VANISHING_DISTANCE > Math.hypot(a2, b2));
  if (far1 && far2) return null;
  const f2 = -(a1 * a2 + b1 * b2) / (c1 * c2);
  // Imaginary (f2 < 0), or a focal length no phone has: the corners do not fit a flat rectangle.
  if (!(f2 >= MIN_FOCAL * MIN_FOCAL && f2 <= MAX_FOCAL * MAX_FOCAL)) return null;
  const ratio = Math.sqrt((a1 * a1 + b1 * b1 + f2 * c1 * c1) / (a2 * a2 + b2 * b2 + f2 * c2 * c2));
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

/** A4, US Letter and US Legal, long side over short side. */
const PAPER_RATIOS = [Math.SQRT2, 11 / 8.5, 14 / 8.5];
const SNAP_TOLERANCE = 0.03;

/** The nearest standard paper ratio (either orientation) when within `tolerance`, else `ratio`. */
export function snapPaper(ratio: number, tolerance = SNAP_TOLERANCE): number {
  let best = ratio;
  let bestError = tolerance;
  for (const paper of PAPER_RATIOS) {
    for (const target of [paper, 1 / paper]) {
      const error = Math.abs(ratio / target - 1);
      if (error <= bestError) {
        best = target;
        bestError = error;
      }
    }
  }
  return best;
}
