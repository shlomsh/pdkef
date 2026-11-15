// Corners for a PDF sheet that sit on the paper's edge. The plan (pageEnhance) reaches out from the text by a margin and is never far
// off; edge following then slides each side of it onto the paper's edge. Measured on 22 book pages, 12 land within 3.5% of the
// hand-traced corners, against none for the plan alone (SCAN-75).
import type { GrayImage, Quad } from '#lib/pageEnhance/quad.ts';
import { followEdges } from './edges/follow.ts';
import { FULL_QUAD, isPagelike } from './quad.ts';

/** The whole picture, to the corner: what the plan gives a sheet it found nothing to straighten on. */
export const isFullQuad = (quad: Quad): boolean => quad.every((p, i) => p.x === FULL_QUAD[i].x && p.y === FULL_QUAD[i].y);

/** The planned corners pulled onto the paper's edge. When what comes back is not a page (a dent, a sliver), the plan stays whole. */
export function onThePaper(planned: Quad, gray: GrayImage): Quad {
  const followed = followEdges(gray, planned).quad;
  return isPagelike(followed) ? followed : planned;
}
