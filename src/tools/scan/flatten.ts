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
  return quadPin(rectQuad({ left: 0, top: 0, width, height }), quad);
}

/** The transform that carries the points `from` (in an element's own box, transform-origin 0 0) onto
 * `to`: the photo itself follows its page this way, from the corners in it to the paper. */
export function quadPin(from: Quad, to: Quad): { h: Matrix3; css: string } {
  const h = homography(from, to);
  const css = `matrix3d(${[h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, h[8]].join(',')})`;
  return { h, css };
}

export function lerpQuad(from: Quad, to: Quad, t: number): Quad {
  return from.map((p, i) => ({ x: p.x + (to[i].x - p.x) * t, y: p.y + (to[i].y - p.y) * t })) as Quad;
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const span = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** One moment of the flatten, t from 0 to 1: how far the page has travelled from its corners in the
 * photo to its paper, and how much of each layer shows. The photo around the page goes first; the
 * photo's own page carries the move and the made page fades in over it while it travels (the photo's
 * page stays whole beneath until then, so the two never show through each other); the paper itself
 * appears only as the page lands on it. */
export function flattenFrame(t: number): { move: number; surround: number; photoPage: number; page: number; paper: number } {
  const page = span(t, 0.3, 0.75);
  return {
    move: easeInOutCubic(span(t, 0.05, 0.95)),
    surround: 1 - span(t, 0, 0.3),
    photoPage: page < 1 ? 1 : 0,
    page,
    paper: span(t, 0.8, 1),
  };
}