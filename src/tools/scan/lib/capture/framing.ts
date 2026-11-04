// Is a page framed? One answer for the hint (guidance.ts) and the auto shutter (captureMachine.ts), so they never disagree.
import type { Quad } from '#lib/pageEnhance/quad.ts';
import type { FrameObservation } from './types.ts';

/** A corner this close to the frame's edge (normalized), or past it, is cut off. @testSeam */
export const onEdge = (quad: Quad, margin: number) =>
  quad.some((p) => p.x <= margin || p.y <= margin || p.x >= 1 - margin || p.y >= 1 - margin);

/** A found page is cut off: a corner on the edge, or paper carrying on past a side to the frame's edge (obs.cutOff). */
export const isCutOff = (obs: FrameObservation, margin: number) =>
  (obs.quad !== null && onEdge(obs.quad, margin)) || obs.cutOff === true;
