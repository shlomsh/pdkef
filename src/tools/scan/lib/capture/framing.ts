// Is a page framed? One answer for the hint (guidance.ts) and the auto shutter (captureMachine.ts), so they never disagree.
import type { Quad } from '#lib/pageEnhance/quad.ts';

/** A corner this close to the frame's edge (normalized), or past it, is cut off. */
export const onEdge = (quad: Quad, margin: number) =>
  quad.some((p) => p.x <= margin || p.y <= margin || p.x >= 1 - margin || p.y >= 1 - margin);
