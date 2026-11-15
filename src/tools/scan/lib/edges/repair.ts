// Repair of a first corner guess by edge following, for photos only (SCAN-75). Pure: no DOM.
import type { GrayImage, Quad } from '#lib/pageEnhance/quad.ts';
import { isPagelike } from '../quad.ts';
import { followEdges } from './follow.ts';

/** How much more page-shaped (degrees off a right angle, at the worst corner) the followed outline must be to replace the guess. */
const REPAIR_DROP = 5;

/** The largest distance of a corner's angle from a right angle, in degrees, measured in the picture's own pixels. */
function irregularity(quad: Quad, width: number, height: number): number {
  let worst = 0;
  for (let i = 0; i < 4; i += 1) {
    const p = quad[i];
    const a = quad[(i + 1) % 4];
    const b = quad[(i + 3) % 4];
    const ax = (a.x - p.x) * width;
    const ay = (a.y - p.y) * height;
    const bx = (b.x - p.x) * width;
    const by = (b.y - p.y) * height;
    const angle = (Math.atan2(Math.abs(ax * by - ay * bx), ax * bx + ay * by) * 180) / Math.PI;
    worst = Math.max(worst, Math.abs(angle - 90));
  }
  return worst;
}

/**
 * The guess, or the guess slid onto the paper's edges when that makes it clearly more page-shaped. Following is a
 * repair here, not a refinement: on a guess that is already page-shaped it is left out, since a sheet printed to its
 * edge has no blank margin for the follower to trust (SCAN-75).
 */
export function repairGuess(guess: Quad, image: GrayImage): Quad {
  const followed = followEdges(image, guess).quad;
  if (!isPagelike(followed)) return guess;
  const drop = irregularity(guess, image.width, image.height) - irregularity(followed, image.width, image.height);
  return drop >= REPAIR_DROP ? followed : guess;
}
