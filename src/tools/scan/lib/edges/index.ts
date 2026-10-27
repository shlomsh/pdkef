import { buildEdgeMap, outlineFromMap, scoreQuad } from './outline.ts';
import { guessByScoredRegions } from './scoredRegions.ts';
import type { GrayImage, Quad } from '../quad.ts';
import type { EdgeGuesser } from './types.ts';

export type { EdgeGuesser } from './types.ts';

/** The outline must beat the brightness guess by this factor to replace it: when both are about as
 * good, the brightness guess (the one every earlier photo was tuned on) stands. */
const OUTLINE_MARGIN = 1.05;

/** Two strategies, one answer. Brightness (scoredRegions.ts) finds a light page on a dark table; the
 * outline (outline.ts) finds any page by its straight edges, including one with a dark printed band
 * that brightness cuts off. When both find something, the one with stronger edge support along its
 * sides, weighed by area, wins. */
export const guessCorners: EdgeGuesser = (image: GrayImage): Quad | null => {
  const bright = guessByScoredRegions(image);
  const map = buildEdgeMap(image);
  const outline = outlineFromMap(map);
  if (!outline) return bright;
  if (!bright) return outline.quad;
  return outline.score > OUTLINE_MARGIN * scoreQuad(map, bright) ? outline.quad : bright;
};
