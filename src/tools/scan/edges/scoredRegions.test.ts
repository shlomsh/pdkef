import { describe, expect, it } from 'vitest';
import type { Quad } from '../quad.ts';
import { corpus } from './corpus.ts';
import { anglesOk, convexHull, guessByScoredRegions, maxAreaQuad } from './scoredRegions.ts';
import { addNoise, solid } from './testImages.ts';

const P = (x: number, y: number) => ({ x, y });

describe('convexHull', () => {
  it('keeps only the outline of a square with interior and edge points', () => {
    const hull = convexHull([P(0, 0), P(10, 0), P(10, 10), P(0, 10), P(5, 5), P(5, 0), P(2, 7)]);
    expect(hull).toHaveLength(4);
    expect(hull.map((p) => `${p.x},${p.y}`).sort()).toEqual(['0,0', '0,10', '10,0', '10,10']);
  });
});

describe('maxAreaQuad', () => {
  it('picks the four corners of a hexagon with two shallow bumps', () => {
    const hull = convexHull([P(0, 0), P(50, -1), P(100, 0), P(100, 100), P(50, 101), P(0, 100)]);
    const q = maxAreaQuad(hull)!;
    expect(q.map((p) => `${p.x},${p.y}`).sort()).toEqual(['0,0', '0,100', '100,0', '100,100']);
  });
  it('is null below four vertices', () => {
    expect(maxAreaQuad([P(0, 0), P(1, 0), P(0, 1)])).toBeNull();
  });
});

describe('anglesOk', () => {
  it('accepts a rectangle and rejects a sliver and a near-degenerate wedge', () => {
    expect(anglesOk([P(0, 0), P(100, 0), P(100, 150), P(0, 150)])).toBe(true);
    expect(anglesOk([P(0, 0), P(200, 0), P(230, 20), P(30, 20)])).toBe(false);
    expect(anglesOk([P(0, 0), P(100, 0), P(100, 100), P(95, 20)] as Quad)).toBe(false);
  });
});

describe('guessByScoredRegions', () => {
  it('returns null for a uniform image and for pure noise', () => {
    expect(guessByScoredRegions(solid(320, 240, 128))).toBeNull();
    const img = solid(320, 240, 128);
    addNoise(img, 60, 5);
    expect(guessByScoredRegions(img)).toBeNull();
  });
  it('times the corpus (informational)', () => {
    const times = corpus.map((c) => { const t = performance.now(); guessByScoredRegions(c.image); return performance.now() - t; });
    console.log(`scoredRegions ms per image: ${times.map((t) => t.toFixed(1)).join(' ')}`);
    for (const t of times) expect(Number.isFinite(t) && t > 0).toBe(true);
  });
});
