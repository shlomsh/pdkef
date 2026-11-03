import { buildEdgeMap, outlineFromMap, scoreQuad } from './outline.ts';
import { guessByScoredRegions } from './scoredRegions.ts';
import type { GrayImage, Quad } from '../quad.ts';

/** The live camera's page finder. `confidence` is 0..1 and 0 exactly when there is no quad. */
export interface Detection { quad: Quad | null; confidence: number }

/** The edge score (support squared, weighed by the root of the page's area) that counts as a certain
 * page. Every corpus page, however tilted or low in contrast, scores 0.53 to 0.70 on it. */
const FULL_SCORE = 0.6;

/** Confidence at or above this is trusted without asking the brightness strategy (0.8 of FULL_SCORE). */
export const CONFIDENT = 0.8;

/** Same margin as guessCorners: the outline must clearly beat the brightness guess to replace it. */
const OUTLINE_MARGIN = 1.05;

const confidenceOf = (score: number): number => Math.min(1, Math.max(0, score / FULL_SCORE));

/** guessCorners (index.ts) for a video frame: the outline strategy first (about 16 ms of the 42 ms),
 * and the brightness strategy only when the outline finds nothing or is below CONFIDENT. The
 * confidence is the winning quad's edge score over FULL_SCORE, capped at 1. */
export function detectPage(image: GrayImage): Detection {
  const map = buildEdgeMap(image);
  const outline = outlineFromMap(map);
  if (outline && confidenceOf(outline.score) >= CONFIDENT) return { quad: outline.quad, confidence: confidenceOf(outline.score) };
  const bright = guessByScoredRegions(image);
  const brightScore = bright ? scoreQuad(map, bright) : 0;
  if (outline && outline.score > OUTLINE_MARGIN * brightScore) return { quad: outline.quad, confidence: confidenceOf(outline.score) };
  if (bright) return { quad: bright, confidence: confidenceOf(brightScore) };
  return { quad: null, confidence: 0 };
}
