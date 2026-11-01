// READ-02: the synthetic scans rasterInk.test.js and Sign's rasterInk.detectors.test.js both read.
/**
 * Synthetic scans: a page described as rectangles in points, rendered to a gray raster at 4 pixels
 * per point (288 dpi), optionally rotated. The module is judged on shapes it can be told the answer
 * to, independent of any real scan.
 */
export const PAGE = { pageWidthPts: 200, pageHeightPts: 150 };
const PX_PER_PT = 4;
export const WIDTH = PAGE.pageWidthPts * PX_PER_PT;
export const HEIGHT = PAGE.pageHeightPts * PX_PER_PT;

/** A thin rule or wall as a rect, y measured down from the top of the page, in points. */
const hRule = (y, x0, x1) => ({ x: x0, y: y - 0.5, width: x1 - x0, height: 1 });
const vRule = (x, y0, y1) => ({ x: x - 0.5, y: y0, width: 1, height: y1 - y0 });
const box = (x, y, side) => [
  hRule(y, x, x + side), hRule(y + side, x, x + side), vRule(x, y, y + side), vRule(x + side, y, y + side),
].map((rect) => ({ ...rect }));

export const FORM = [
  hRule(40, 20, 180),
  hRule(100, 20, 120),
  ...box(30, 60, 8),
  // A comb: six cells at a 12 point pitch, a 12 point tall tooth at every boundary, rails top and bottom.
  hRule(120, 30, 102), hRule(132, 30, 102),
  ...Array.from({ length: 7 }, (_, i) => vRule(30 + 12 * i, 120, 132)),
];

/** Gray raster of `shapes`, rotated so a level rule gets slope tan(degrees) in pixel space. */
export function render(shapes, { degrees = 0, ink = 0, paper = 255 } = {}) {
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
export function speckle(raster, share, seed = 7) {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = 0; i < raster.data.length; i += 1) if (next() < share) raster.data[i] = 0;
  return raster;
}

/** Page y (up) of a rule drawn `y` points down from the top. */
export const up = (y) => PAGE.pageHeightPts - y;
export const near = (list, value, pick, tolerance = 1) => list.filter((item) => Math.abs(pick(item) - value) <= tolerance);
