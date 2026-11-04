// A page's true proportions from its four corners in a photo (SCAN-34). Pure: no DOM.
//
// Zhang and He, "Whiteboard scanning and image enhancement" (2007): with the principal point at the
// photo's centre and square pixels, the homography H = [h1 h2 h3] taking the unit square onto the quad
// is K [w r1, h r2, t] up to scale, K = diag(f, f, 1). r1 and r2 are orthogonal unit vectors, so
//   f^2 = -(h11 h12 + h21 h22) / (h31 h32)          (h1 and h2 are the two vanishing points)
//   w / h = |K^-1 h1| / |K^-1 h2|.
// When f cannot be solved reliably (a pair of opposite sides nearly parallel, as when the phone tilts
// back with the page square to it, or a focal length no phone has) the ratio uses ASSUMED_FOCAL
// instead. Frontal, both c terms vanish and that is the plain edge-length ratio.
import type { Quad } from './quad';
import { homography } from './homography.ts';

/**
 * A vanishing point farther than this many long sides from the centre leaves f to noise. Simulated
 * phone photos (true focal 0.65-0.9, 2px corner noise): past 25 the assumed focal's 90th-percentile
 * error is lower than the solved one's (2.5% vs 2.8% at 25-50, 1.7% vs 4.8% beyond 50); nearer, solved wins.
 */
const FAR_VANISHING_DISTANCE = 25;
/** Phone cameras: the focal length in pixels is between these multiples of the photo's long side. */
const MIN_FOCAL = 0.5;
const MAX_FOCAL = 3;
/**
 * A phone's main camera when the corners cannot tell: 24-26mm in 35mm terms (iPhone; most Android
 * mains are 23-27mm). 35mm-equivalent is quoted against the 43.3mm diagonal, whose 4:3 frame has a
 * 34.6mm long side, so f is 24/34.6 to 26/34.6 = 0.69 to 0.75 x the long side; a 16:9 photo is a
 * crop of that frame with the same long side.
 */
const ASSUMED_FOCAL = 0.75;
/** No page we scan is longer than this to one, receipts included. */
const MAX_RATIO = 8;

/** The page's width / height (top edge over left edge), or null for corners with no perspective. */
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
  const far1 = !(Math.abs(c1) * FAR_VANISHING_DISTANCE > Math.hypot(a1, b1));
  const far2 = !(Math.abs(c2) * FAR_VANISHING_DISTANCE > Math.hypot(a2, b2));
  const solved = far1 || far2 ? NaN : -(a1 * a2 + b1 * b2) / (c1 * c2);
  // Unreliable (a far vanishing point), imaginary (f2 < 0), or a focal length no phone has.
  const f2 = solved >= MIN_FOCAL * MIN_FOCAL && solved <= MAX_FOCAL * MAX_FOCAL ? solved : ASSUMED_FOCAL * ASSUMED_FOCAL;
  const ratio = Math.sqrt((a1 * a1 + b1 * b1 + f2 * c1 * c1) / (a2 * a2 + b2 * b2 + f2 * c2 * c2));
  return ratio >= 1 / MAX_RATIO && ratio <= MAX_RATIO ? ratio : null;
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
