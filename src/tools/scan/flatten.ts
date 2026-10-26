// The flatten animation's geometry: the processed page drawn over its photo, corner-pinned to the
// quad the person approved, then carried onto its place on the paper. Pure: CSS strings out, no DOM.
import { homography, type Matrix3 } from './homography.ts';
import type { Quad } from './quad.ts';

interface Rect { left: number; top: number; width: number; height: number }

/** A rectangle's corners, top-left first, clockwise. */
export function rectQuad({ left, top, width, height }: Rect): Quad {
  return [{ x: left, y: top }, { x: left + width, y: top }, { x: left + width, y: top + height }, { x: left, y: top + height }];
}

/** The transform that lays a `width` x `height` box (transform-origin 0 0) onto `quad`, as a matrix
 * and as CSS: matrix3d is column-major, and a 2D homography sits in its x, y and w rows. */
export function cornerPin(width: number, height: number, quad: Quad): { h: Matrix3; css: string } {
  const h = homography(rectQuad({ left: 0, top: 0, width, height }), quad);
  const css = `matrix3d(${[h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, h[8]].join(',')})`;
  return { h, css };
}

export function lerpQuad(from: Quad, to: Quad, t: number): Quad {
  return from.map((p, i) => ({ x: p.x + (to[i].x - p.x) * t, y: p.y + (to[i].y - p.y) * t })) as Quad;
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
