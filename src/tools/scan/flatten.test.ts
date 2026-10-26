import { describe, expect, it } from 'vitest';
import { cornerPin, easeOutCubic, lerpQuad, rectQuad } from './flatten.ts';
import { applyHomography } from './homography.ts';
import type { Quad } from './quad.ts';

const QUAD: Quad = [{ x: 30, y: 20 }, { x: 250, y: 40 }, { x: 230, y: 300 }, { x: 10, y: 280 }];

describe('cornerPin', () => {
  it('maps the element box corners onto the quad', () => {
    const { h } = cornerPin(200, 260, QUAD);
    const box: Quad = rectQuad({ left: 0, top: 0, width: 200, height: 260 });
    box.forEach((corner, i) => {
      const p = applyHomography(h, corner);
      expect(p.x).toBeCloseTo(QUAD[i].x, 6);
      expect(p.y).toBeCloseTo(QUAD[i].y, 6);
    });
  });

  it('writes the same map as a CSS matrix3d, column-major', () => {
    const { h, css } = cornerPin(200, 260, QUAD);
    const v = css.replace('matrix3d(', '').replace(')', '').split(',').map(Number);
    expect(v).toHaveLength(16);
    expect([v[0], v[1], v[3], v[4], v[5], v[7], v[12], v[13], v[15]]).toEqual([h[0], h[3], h[6], h[1], h[4], h[7], h[2], h[5], h[8]]);
    expect([v[10], v[2], v[6], v[8], v[9], v[11], v[14]]).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });

  it('is the identity for a box pinned to itself', () => {
    const { css } = cornerPin(100, 50, rectQuad({ left: 0, top: 0, width: 100, height: 50 }));
    const v = css.replace('matrix3d(', '').replace(')', '').split(',').map(Number);
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1].forEach((want, i) => expect(v[i]).toBeCloseTo(want, 9));
  });
});

describe('lerpQuad and easeOutCubic', () => {
  it('runs from one quad to the other', () => {
    const to = rectQuad({ left: 0, top: 0, width: 100, height: 100 });
    expect(lerpQuad(QUAD, to, 0)).toEqual(QUAD);
    expect(lerpQuad(QUAD, to, 1)).toEqual(to);
    expect(lerpQuad(QUAD, to, 0.5)[0]).toEqual({ x: 15, y: 10 });
  });

  it('eases out, from 0 to 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
