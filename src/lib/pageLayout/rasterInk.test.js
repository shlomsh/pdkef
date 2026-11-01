import { describe, expect, it } from 'vitest';
import { inkFromRaster, otsuThreshold, mergeCollinear } from './rasterInk.ts';
import { PAGE, WIDTH, HEIGHT, FORM, render, speckle, up, near } from '../../test/support/syntheticScan.js';

describe('inkFromRaster on a clean synthetic form', () => {
  const ink = inkFromRaster(render(FORM), PAGE);

  it('reports skew as zero and returns the collectPageInk shape', () => {
    expect(Math.abs(ink.skewDegrees)).toBeLessThan(0.1);
    expect(Object.keys(ink).sort()).toEqual(['horizontals', 'rects', 'skewDegrees', 'verticals']);
  });

  it('recovers each long rule at its position, in PDF points with y up', () => {
    const [top] = near(ink.horizontals, up(40), (rule) => rule.y, 0.75);
    expect(top.x0).toBeCloseTo(20, 0);
    expect(top.x1).toBeCloseTo(180, 0);
    const [lower] = near(ink.horizontals, up(100), (rule) => rule.y, 0.75);
    expect(lower.x0).toBeCloseTo(20, 0);
    expect(lower.x1).toBeCloseTo(120, 0);
  });
});

describe('inkFromRaster on inputs that are not clean gray', () => {
  it('reads the same ink from an RGBA canvas buffer', () => {
    const gray = render(FORM);
    const rgba = new Uint8ClampedArray(gray.data.length * 4);
    for (let i = 0; i < gray.data.length; i += 1) {
      rgba.set([gray.data[i], gray.data[i], gray.data[i], 255], i * 4);
    }
    const fromGray = inkFromRaster(gray, PAGE);
    const fromRgba = inkFromRaster({ data: rgba, width: WIDTH, height: HEIGHT }, PAGE);
    expect(fromRgba.horizontals).toEqual(fromGray.horizontals);
    expect(fromRgba.verticals).toEqual(fromGray.verticals);
  });

  it('reads white-on-black pages by inverting them', () => {
    const inverted = inkFromRaster(render(FORM, { ink: 255, paper: 0 }), PAGE);
    expect(near(inverted.horizontals, up(40), (rule) => rule.y, 0.75)).toHaveLength(1);
  });

  it('survives light speckle: the rules still come out and no specks are invented', () => {
    const ink = inkFromRaster(speckle(render(FORM), 0.004), PAGE);
    expect(near(ink.horizontals, up(40), (rule) => rule.y, 0.75)).toHaveLength(1);
    expect(near(ink.horizontals, up(100), (rule) => rule.y, 0.75)).toHaveLength(1);
    expect(ink.horizontals.length).toBeLessThanOrEqual(5);
  });
});

describe('inkFromRaster on a slightly rotated scan', () => {
  const degrees = 1;
  const ink = inkFromRaster(render(FORM, { degrees }), PAGE);

  it('measures the skew it undoes', () => {
    expect(ink.skewDegrees).toBeGreaterThan(degrees - 0.2);
    expect(ink.skewDegrees).toBeLessThan(degrees + 0.2);
  });

  it('still finds each rule whole, rather than as pieces of a drifting line', () => {
    const top = near(ink.horizontals, up(40), (rule) => rule.y, 3);
    expect(top).toHaveLength(1);
    expect(top[0].x1 - top[0].x0).toBeGreaterThan(150);
    expect(near(ink.horizontals, up(100), (rule) => rule.y, 3)).toHaveLength(1);
  });

});

describe('inkFromRaster on pages with no ruled structure', () => {
  it('yields nothing for a noise-only page', () => {
    const noise = speckle({ data: new Uint8Array(WIDTH * HEIGHT).fill(255), width: WIDTH, height: HEIGHT }, 0.02, 99);
    const ink = inkFromRaster(noise, PAGE);
    expect(ink.verticals).toEqual([]);
    expect(ink.horizontals).toEqual([]);
    expect(ink.rects).toEqual([]);
  });

  it('yields nothing for a blank page', () => {
    const ink = inkFromRaster({ data: new Uint8Array(WIDTH * HEIGHT).fill(255), width: WIDTH, height: HEIGHT }, PAGE);
    expect(ink).toMatchObject({ verticals: [], horizontals: [], rects: [] });
  });

  it('does not read a filled bar or a round letter as a rule or a box', () => {
    const bar = { x: 20, y: 20, width: 100, height: 6 };
    const ring = [];
    // A hollow disc approximated by rects, round like an "o": no straight sides, empty corners.
    for (let row = 0; row < 32; row += 1) {
      const y = 70 + row * 0.25;
      const half = Math.sqrt(Math.max(0, 1 - ((row - 16) / 16) ** 2)) * 4;
      const inner = Math.max(0, half - 1);
      ring.push({ x: 100 - half, y, width: half - inner, height: 0.25 }, { x: 100 + inner, y, width: half - inner, height: 0.25 });
      if (inner === 0) ring.push({ x: 100 - half, y, width: half * 2, height: 0.25 });
    }
    const ink = inkFromRaster(render([bar, ...ring]), PAGE);
    expect(ink.horizontals).toEqual([]);
    expect(ink.rects).toEqual([]);
  });
});

describe('helpers', () => {
  it('otsuThreshold separates a bimodal histogram', () => {
    const gray = Uint8Array.from([...Array(90).fill(240), ...Array(10).fill(20)]);
    const threshold = otsuThreshold(gray);
    expect(threshold).toBeGreaterThanOrEqual(20);
    expect(threshold).toBeLessThan(240);
  });

  it('mergeCollinear joins close fragments and keeps distant or off-line ones apart', () => {
    const merged = mergeCollinear(
      [
        { pos: 10, a0: 0, a1: 20, thickness: 2 },
        { pos: 10.3, a0: 22, a1: 40, thickness: 2 },
        { pos: 10, a0: 60, a1: 80, thickness: 2 },
        { pos: 30, a0: 0, a1: 20, thickness: 2 },
      ],
      { offset: 1, gap: 4 },
    );
    expect(merged.map(({ pos, a0, a1 }) => [Math.round(pos), a0, a1])).toEqual([
      [10, 0, 40],
      [10, 60, 80],
      [30, 0, 20],
    ]);
  });
});
