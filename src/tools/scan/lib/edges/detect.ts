import { buildEdgeMap, faintOutline, outlineFromMap, scoreQuad, WEAK_SCORE } from './outline.ts';
import { guessByScoredRegions } from './scoredRegions.ts';
import type { GrayImage, Quad } from '../quad.ts';

/**
 * The live camera's page finder. `confidence` is 0..1 and 0 exactly when there is no quad.
 * `lowContrast` says the page was found only by its faint edges (a light page on a light surface),
 * where a darker surface would help.
 */
interface Detection { quad: Quad | null; confidence: number; lowContrast: boolean }

/** The edge score (support squared, weighed by the root of the page's area) that counts as a certain
 * page. Every corpus page, however tilted or low in contrast, scores 0.53 to 0.70 on it. */
const FULL_SCORE = 0.6;

/**
 * Confidence at or above this is trusted without asking the brightness strategy (0.8 of FULL_SCORE).
 * @testSeam The test pins found pages at this confidence; the camera reads `confidence`, not the threshold.
 */
export const CONFIDENT = 0.8;

/** Same margin as guessCorners: the outline must clearly beat the brightness guess to replace it. */
const OUTLINE_MARGIN = 1.05;

const confidenceOf = (score: number): number => Math.min(1, Math.max(0, score / FULL_SCORE));

const NONE: Detection = { quad: null, confidence: 0, lowContrast: false };

/** guessCorners (index.ts) for a video frame: the outline strategy first (about 16 ms of the 42 ms),
 * the faint outline when the outline is weak or finds nothing, and the brightness strategy only when
 * neither found a page with confidence. The confidence is the winning quad's edge score over FULL_SCORE,
 * capped at 1. A guess with no edge support at all is no page: null, not a quad with confidence 0.
 */
export function detectPage(image: GrayImage): Detection {
  const map = buildEdgeMap(image);
  const outline = outlineFromMap(map);
  if (outline && confidenceOf(outline.score) >= CONFIDENT) return { quad: outline.quad, confidence: confidenceOf(outline.score), lowContrast: false };
  if (!outline || outline.score < WEAK_SCORE) {
    const faint = faintOutline(map);
    if (faint) return { quad: faint.quad, confidence: confidenceOf(faint.score), lowContrast: true };
  }
  const bright = guessByScoredRegions(image);
  const brightScore = bright ? scoreQuad(map, bright) : 0;
  if (outline && outline.score > OUTLINE_MARGIN * brightScore) return { quad: outline.quad, confidence: confidenceOf(outline.score), lowContrast: false };
  if (bright && brightScore > 0) return { quad: bright, confidence: confidenceOf(brightScore), lowContrast: false };
  return NONE;
}
