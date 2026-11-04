import { describe, expect, it } from 'vitest';
import type { Point, Quad } from './quad';
import { pageAspect, snapPaper } from './aspect';
import { warpSize, warpSizeFor } from './warp';

const W = 2000;
const H = 1500;
const deg = (d: number) => (d * Math.PI) / 180;

/**
 * A `ratio`:1 page photographed by a pinhole camera (focal `focal` x the long side, principal point at
 * the centre): turned `spin` in its own plane, tilted `tilt` away from the camera, the camera rolled
 * `roll`, the page `shift` off the optical axis. Corners top-left, top-right, bottom-right, bottom-left.
 */
function photograph(ratio: number, { focal, tilt, spin = 0, roll = 0, shift = { x: 0, y: 0 } }: {
  focal: number; tilt: number; spin?: number; roll?: number; shift?: Point;
}): Quad {
  const f = focal * Math.max(W, H);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => {
    let x = (sx * ratio) / 2;
    let y = sy / 2;
    [x, y] = [x * Math.cos(deg(spin)) - y * Math.sin(deg(spin)), x * Math.sin(deg(spin)) + y * Math.cos(deg(spin))];
    // Tilt about the camera's x axis: the page's far half recedes.
    let z = y * Math.sin(deg(tilt));
    y *= Math.cos(deg(tilt));
    [x, y] = [x * Math.cos(deg(roll)) - y * Math.sin(deg(roll)), x * Math.sin(deg(roll)) + y * Math.cos(deg(roll))];
    x += shift.x;
    y += shift.y;
    z += 2.5;
    return { x: W / 2 + (f * x) / z, y: H / 2 + (f * y) / z };
  }) as Quad;
}

/** The quad whose sides meet at vanishing points v1 (top/bottom) and v2 (left/right), in pixels. */
function quadFromVanishing(v1: Point, v2: Point): Quad {
  const o = { x: W / 2 - 300, y: H / 2 - 200 };
  const k = 0.08;
  const h1 = [k * v1.x, k * v1.y, k];
  const h2 = [k * v2.x, k * v2.y, k];
  const at = (s: number, t: number) => {
    const w = s * h1[2] + t * h2[2] + 1;
    return { x: (s * h1[0] + t * h2[0] + o.x) / w, y: (s * h1[1] + t * h2[1] + o.y) / w };
  };
  return [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
}

const PAPERS = { A4: Math.SQRT2, 'A4 portrait': 1 / Math.SQRT2, Letter: 11 / 8.5, square: 1, '2:1': 2 };

describe('pageAspect', () => {
  for (const [name, ratio] of Object.entries(PAPERS)) {
    for (const focal of [0.8, 1.5]) {
      for (const tilt of [10, 25, 40]) {
        it(`recovers ${name} within 2% at focal ${focal}, tilt ${tilt} degrees, turned and off-axis`, () => {
          const quad = photograph(ratio, { focal, tilt, spin: 20, roll: -8, shift: { x: 0.15, y: -0.1 } });
          const aspect = pageAspect(quad, W, H);
          expect(aspect).not.toBeNull();
          expect(Math.abs((aspect as number) / ratio - 1)).toBeLessThan(0.02);
        });
      }
    }
  }

  it('recovers the ratio from a portrait photo too', () => {
    // A landscape photo mirrored across its diagonal into a portrait one: the ratio is the page's own.
    const quad = photograph(1 / Math.SQRT2, { focal: 1, tilt: 30, spin: 25, roll: 5 }).map((p) => ({ x: p.y, y: p.x })) as Quad;
    expect(pageAspect(quad, H, W)).toBeCloseTo(1 / Math.SQRT2, 3);
  });

  it('beats the edge lengths where they are worst: a strong tilt', () => {
    const quad = photograph(Math.SQRT2, { focal: 1, tilt: 40, spin: 30 });
    const { width, height } = warpSize(quad, 1e6);
    expect(Math.abs(width / height / Math.SQRT2 - 1)).toBeGreaterThan(0.1);
    expect(pageAspect(quad, W, H)).toBeCloseTo(Math.SQRT2, 3);
  });

  it('matches the edge lengths for a frontal view, where they are already right', () => {
    for (const spin of [0, 20]) {
      const quad = photograph(Math.SQRT2, { focal: 1, tilt: 0, spin, shift: { x: 0.2, y: 0.1 } });
      const { width, height } = warpSize(quad, 1e6);
      expect(pageAspect(quad, W, H)).toBeCloseTo(width / height, 2);
      expect(pageAspect(quad, W, H)).toBeCloseTo(Math.SQRT2, 2);
    }
  });

  it('stays within 2% for a view a degree or two off frontal', () => {
    for (const tilt of [0.5, 1, 2]) {
      const aspect = pageAspect(photograph(Math.SQRT2, { focal: 1, tilt, spin: 20 }), W, H);
      expect(Math.abs((aspect as number) / Math.SQRT2 - 1)).toBeLessThan(0.02);
    }
  });

  // Tilted back with the page square to the camera: top and bottom stay parallel, so the focal length
  // cannot be solved and the assumed phone focal stands in for it.
  for (const [name, ratio] of Object.entries({ A4: Math.SQRT2, 'A4 portrait': 1 / Math.SQRT2, Letter: 11 / 8.5 })) {
    for (const focal of [0.65, 0.75, 0.9]) {
      it(`recovers ${name} within 3% tilted back square to a camera of focal ${focal}`, () => {
        // Up to 25 degrees; at 40 a 0.65 or 0.9 camera is 6-7% off the assumed 0.75 (still beats edges).
        for (const tilt of [10, 20, 25]) {
          const quad = photograph(ratio, { focal, tilt, shift: { x: 0.1, y: 0.05 } });
          expect(quad[0].y).toBeCloseTo(quad[1].y, 6); // the top edge really is level
          const { width, height } = warpSize(quad, 1e6);
          const aspect = pageAspect(quad, W, H) as number;
          expect(Math.abs(aspect / ratio - 1)).toBeLessThan(0.03);
          if (tilt >= 25) expect(Math.abs(width / height / ratio - 1)).toBeGreaterThan(0.05);
        }
      });
    }
  }

  it('falls back to the assumed focal length when the corners imply none a phone has', () => {
    const cases = {
      // Both vanishing points on the same side of the centre: an imaginary focal length.
      imaginary: quadFromVanishing({ x: W / 2 + 3000, y: H / 2 + 400 }, { x: W / 2 + 3000, y: H / 2 - 400 }),
      telephoto: quadFromVanishing({ x: W / 2 + 6000, y: H / 2 }, { x: W / 2 - 30000, y: H / 2 + 3000 }), // f ~ 6.7
      fisheye: quadFromVanishing({ x: W / 2 + 1200, y: H / 2 }, { x: W / 2 - 300, y: H / 2 + 1200 }), // f^2 < 0.25
    };
    for (const quad of Object.values(cases)) {
      const aspect = pageAspect(quad, W, H);
      expect(aspect).not.toBeNull();
      expect(Number.isFinite(aspect)).toBe(true);
    }
  });

  it('returns null for a ratio no page has', () => {
    expect(pageAspect(photograph(12, { focal: 1, tilt: 20, spin: 10 }), W, H)).toBeNull();
    expect(pageAspect(photograph(1 / 12, { focal: 1, tilt: 0 }), W, H)).toBeNull();
    expect(pageAspect(photograph(6, { focal: 1, tilt: 20, spin: 10 }), W, H)).toBeCloseTo(6, 2);
  });

  it('returns null for corners with no perspective at all', () => {
    const line: Quad = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }];
    expect(pageAspect(line, W, H)).toBeNull();
    expect(pageAspect(photograph(1, { focal: 1, tilt: 20, spin: 10 }), 0, 0)).toBeNull();
  });
});

describe('snapPaper', () => {
  it('snaps to A4, Letter and Legal in either orientation within 3%', () => {
    expect(snapPaper(1.39)).toBe(Math.SQRT2);
    expect(snapPaper(1 / 1.44)).toBe(1 / Math.SQRT2);
    expect(snapPaper(1.27)).toBe(11 / 8.5);
    expect(snapPaper(8.5 / 11 + 0.01)).toBeCloseTo(8.5 / 11, 12);
    expect(snapPaper(1.62)).toBe(14 / 8.5);
    expect(snapPaper(8.5 / 14 - 0.01)).toBeCloseTo(8.5 / 14, 12);
  });

  it('leaves a ratio more than 3% from every paper alone', () => {
    for (const ratio of [1, 1.5, 2, 1.36, 1 / 1.36, 1.2, 1.75]) expect(snapPaper(ratio)).toBe(ratio);
    expect(snapPaper(Math.SQRT2 * 1.031)).toBe(Math.SQRT2 * 1.031);
    expect(snapPaper(Math.SQRT2 * 1.029)).toBe(Math.SQRT2);
  });

  it('picks the nearer paper when two are within the tolerance', () => {
    expect(snapPaper(1.35, 0.06)).toBe(11 / 8.5);
    expect(snapPaper(1.36, 0.06)).toBe(Math.SQRT2);
  });
});

describe('warpSizeFor', () => {
  const quad = photograph(Math.SQRT2, { focal: 1, tilt: 35, spin: 15 });

  it('is warpSize exactly without an aspect', () => {
    expect(warpSizeFor(quad, 4000, null)).toEqual(warpSize(quad, 4000));
    expect(warpSizeFor(quad, 300, null)).toEqual(warpSize(quad, 300));
  });

  it('keeps the long edge warpSize gives and takes the short one from the aspect', () => {
    const plain = warpSize(quad, 4000);
    const long = Math.max(plain.width, plain.height);
    expect(warpSizeFor(quad, 4000, Math.SQRT2)).toEqual({ width: long, height: Math.round(long / Math.SQRT2) });
    expect(warpSizeFor(quad, 4000, 1 / Math.SQRT2)).toEqual({ width: Math.round(long / Math.SQRT2), height: long });
  });

  it('caps the long edge', () => {
    expect(warpSizeFor(quad, 1000, 2)).toEqual({ width: 1000, height: 500 });
  });
});
