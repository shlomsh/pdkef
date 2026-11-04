// How far a page's text rows lean, and the corners that turn them level (PE-04). A half of a book
// spread leans by up to about six degrees; rotating the piece's corners by it costs no new warp.
// Pure: pixels in, numbers out.
import { estimateSkewDegrees } from '../pageLayout/rasterInk.ts';
import { inkMask } from './dewarp/ink.ts';
import type { GrayImage, Quad } from './quad.ts';

/** The most a half of a spread is read to lean, in degrees either way. */
const LEAN_RANGE_DEGREES = 8;

/**
 * The angle a page's text rows lean by, in degrees, y down; 0 when it cannot tell.
 * @testSeam
 */
export function pageLean(gray: GrayImage): number {
  return estimateSkewDegrees(inkMask(gray), gray.width, gray.height, LEAN_RANGE_DEGREES);
}

/**
 * `quad`, 0..1 of a `width` x `height` source, turned by `degrees` about its centre, so applying it levels rows that lean by `degrees`.
 * @testSeam
 */
export function levelQuad(quad: Quad, degrees: number, width: number, height: number): Quad {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = (quad.reduce((sum, p) => sum + p.x, 0) / 4) * width;
  const cy = (quad.reduce((sum, p) => sum + p.y, 0) / 4) * height;
  return quad.map((p) => {
    const dx = p.x * width - cx;
    const dy = p.y * height - cy;
    return { x: (cx + dx * cos - dy * sin) / width, y: (cy + dx * sin + dy * cos) / height };
  }) as Quad;
}
