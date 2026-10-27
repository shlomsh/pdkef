import { describe, expect, it } from 'vitest';
import { inkFromRaster, otsuThreshold, mergeCollinear } from './rasterInk.js';
import { findCombRuns, findCheckboxes } from './formGrid.js';

/**
 * Synthetic scans: a page described as rectangles in points, rendered to a gray raster at 4 pixels
 * per point (288 dpi), optionally rotated. The module is judged on shapes it can be told the answer
 * to, independent of any real scan.
 */
const PAGE = { pageWidthPts: 200, pageHeightPts: 150 };
const PX_PER_PT = 4;
const WIDTH = PAGE.pageWidthPts * PX_PER_PT;
const HEIGHT = PAGE.pageHeightPts * PX_PER_PT;

/** A thin rule or wall as a rect, y measured down from the top of the page, in points. */
const hRule = (y, x0, x1) => ({ x: x0, y: y - 0.5, width: x1 - x0, height: 1 });
const vRule = (x, y0, y1) => ({ x: x - 0.5, y: y0, width: 1, height: y1 - y0 });
const box = (x, y, side) => [
  hRule(y, x, x + side), hRule(y + side, x, x + side), vRule(x, y, y + side), vRule(x + side, y, y + side),
].map((rect) => ({ ...rect }));

const FORM = [
  hRule(40, 20, 180),
  hRule(100, 20, 120),
  ...box(30, 60, 8),
  // A comb: six cells at a 12 point pitch, a 12 point tall tooth at every boundary, rails top and bottom.
  hRule(120, 30, 102), hRule(132, 30, 102),
  ...Array.from({ length: 7 }, (_, i) => vRule(30 + 12 * i, 120, 132)),
];

/** Gray raster of `shapes`, rotated so a level rule gets slope tan(degrees) in pixel space. */
function render(shapes, { degrees = 0, ink = 0, paper = 255 } = {}) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const data = new Uint8Array(WIDTH * HEIGHT).fill(paper);
  for (let py = 0; py < HEIGHT; py += 1) {
    for (let px = 0; px < WIDTH; px += 1) {
      const dx = px - cx;
      const dy = py - cy;
      const x = (cx + dx * cos + dy * sin) / PX_PER_PT;
      const y = (cy - dx * sin + dy * cos) / PX_PER_PT;
      if (shapes.some((s) => x >= s.x && x < s.x + s.width && y >= s.y && y < s.y + s.height)) {
        data[py * WIDTH + px] = ink;
      }
    }
  }
  return { data, width: WIDTH, height: HEIGHT };
}

/** Deterministic specks (a seeded generator, so a failure reproduces). */
function speckle(raster, share, seed = 7) {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = 0; i < raster.data.length; i += 1) if (next() < share) raster.data[i] = 0;
  return raster;
}

/** Page y (up) of a rule drawn `y` points down from the top. */
const up = (y) => PAGE.pageHeightPts - y;
const near = (list, value, pick, tolerance = 1) => list.filter((item) => Math.abs(pick(item) - value) <= tolerance);

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

  it('finds the comb teeth as verticals and the existing comb detector reads them', () => {
    const teeth = near(ink.verticals, 0, () => 0, Infinity).filter((v) => v.y1 - v.y0 > 9 && v.y1 - v.y0 < 15);
    expect(teeth).toHaveLength(7);
    const [run] = findCombRuns(ink);
    expect(run.cells).toBe(6);
    expect(run.pitch).toBeCloseTo(12, 0);
    expect(run.left).toBeCloseTo(30, 0);
  });

  it('recovers the checkbox as a square rect that findCheckboxes accepts, and does not turn it into rules', () => {
    expect(ink.rects).toHaveLength(1);
    const [rect] = ink.rects;
    expect(rect.width).toBeCloseTo(9, 0);
    expect(rect.height).toBeCloseTo(9, 0);
    expect(rect.x).toBeCloseTo(29.5, 0);
    expect(rect.y).toBeCloseTo(up(68.5), 0);
    expect(findCheckboxes(ink)).toHaveLength(1);
    expect(near(ink.horizontals, up(60), (rule) => rule.y, 2)).toHaveLength(0);
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

  it('keeps the comb and the checkbox', () => {
    expect(findCombRuns(ink)[0]?.cells).toBe(6);
    expect(findCheckboxes(ink)).toHaveLength(1);
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
