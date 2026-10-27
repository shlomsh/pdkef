import { describe, expect, it } from 'vitest';
import { clipHalfPlane, easeInOut, peelDistance, peelFrame, type Point } from './peelGeometry.ts';

function parse(clip: string): Point[] {
  return [...clip.matchAll(/(-?[\d.]+)px (-?[\d.]+)px/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

function area(poly: Point[]): number {
  return Math.abs(poly.reduce((sum, [x, y], i) => {
    const [nx, ny] = poly[(i + 1) % poly.length];
    return sum + x * ny - nx * y;
  }, 0)) / 2;
}

function applyMatrix(matrix: string, [x, y]: Point): Point {
  const [a, b, c, d, e, f] = matrix.slice(7, -1).split(',').map(Number);
  return [a * x + c * y + e, b * x + d * y + f];
}

describe('peelFrame', () => {
  it('leaves the object whole before the peel starts', () => {
    const frame = peelFrame(200, 30, 0, 10);
    expect(area(parse(frame.front))).toBeCloseTo(200 * 30);
    expect(area(parse(frame.flap))).toBe(0);
  });

  it('has lifted everything once the fold has travelled the whole distance', () => {
    const d = peelDistance(200, 30, 10);
    const frame = peelFrame(200, 30, d + 0.01, 10);
    expect(area(parse(frame.front))).toBeCloseTo(0);
    expect(area(parse(frame.flap))).toBeCloseTo(200 * 30);
  });

  it('starts at the top-right corner', () => {
    const frame = peelFrame(200, 30, 20, 10);
    const flap = parse(frame.flap);
    expect(flap).toContainEqual([200, 0]);
    expect(flap.every(([x]) => x > 150)).toBe(true);
  });

  it('folds the lifted corner back over the object, keeping the fold line in place', () => {
    const frame = peelFrame(200, 30, 20, 10);
    const [x, y] = applyMatrix(frame.fold, [200, 0]);
    expect(x).toBeLessThan(200);
    expect(y).toBeGreaterThan(0);
    // Points on the fold line (shared by front and flap) do not move.
    const corners = new Set(['0,0', '200,0', '200,30', '0,30']);
    const shared = parse(frame.flap).filter((p) => !corners.has(p.join(',')));
    expect(shared).toHaveLength(2);
    for (const p of shared) {
      const q = applyMatrix(frame.fold, p);
      expect(q[0]).toBeCloseTo(p[0], 0);
      expect(q[1]).toBeCloseTo(p[1], 0);
    }
  });
});

describe('clipHalfPlane', () => {
  it('cuts a square in half along a vertical line', () => {
    const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const right = clipHalfPlane(square, ([x]) => x - 5);
    expect(right).toEqual([[5, 0], [10, 0], [10, 10], [5, 10]]);
  });
});

describe('easeInOut', () => {
  it('runs from 0 to 1 through the middle', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(1)).toBe(1);
  });
});
