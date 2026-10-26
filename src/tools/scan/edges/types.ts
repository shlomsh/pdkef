import type { GrayImage, Quad } from '../quad.ts';

/** One contract for every edge guess: a small gray copy of the photo in, the page's corners
 * (normalized, ordered by `orderQuad`) out, or null when no page stands out. Pure. */
export type EdgeGuesser = (image: GrayImage) => Quad | null;
