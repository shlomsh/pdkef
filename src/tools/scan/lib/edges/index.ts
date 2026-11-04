import { buildEdgeMap, faintOutline, outlineFromMap, scoreQuad, WEAK_SCORE } from './outline.ts';
import { guessByScoredRegions } from './scoredRegions.ts';
import type { GrayImage, Quad } from '../quad.ts';
import type { EdgeGuesser } from './types.ts';

export type { EdgeGuesser } from './types.ts';

/** The outline must beat the brightness guess by this factor to replace it: when both are about as
 * good, the brightness guess (the one every earlier photo was tuned on) stands. */
const OUTLINE_MARGIN = 1.05;

/** Three strategies, one answer. The outline (outline.ts) finds any page by its straight edges,
 * including one with a dark printed band that brightness cuts off; brightness (scoredRegions.ts) finds a
 * light page on a dark table. When both find something, the one with stronger edge support along its
 * sides, weighed by area, wins. When the outline is weak or finds nothing, the faint outline is asked
 * first: a white page on a white table, whose sides are a step of a few gray levels or a thin shadow,
 * and whose find stands without the brightness guess (which can only offer the whole table there). */
export const guessCorners: EdgeGuesser = (image: GrayImage): Quad | null => {
  const map = buildEdgeMap(image);
  const outline = outlineFromMap(map);
  if (!outline || outline.score < WEAK_SCORE) {
    const faint = faintOutline(map);
    if (faint) return faint.quad;
  }
  const bright = guessByScoredRegions(image);
  if (!outline) return bright;
  if (!bright) return outline.quad;
  return outline.score > OUTLINE_MARGIN * scoreQuad(map, bright) ? outline.quad : bright;
};
