// Folded corners: a pinned sheet curls a corner away, so a flattened page shows a dark triangle of
// table there, and the Document look turns it solid black. A lifted edge shows the same table as a thin
// sliver along that edge. The page's corners are right; both are painted in the paper's colour before
// any look is applied, so every look is fixed. Pure: no DOM.
import { type RgbaImage } from '#lib/pageEnhance/quad.ts';
import { documentGrey } from './filters.ts';
import { eachMark } from './marks.ts';

/** Grey under which the Document look calls a pixel dark. */
const DARK = 128;
/** Smallest mark taken for a fold, as a share of the page: below this it is a speck. */
const MIN_AREA = 0.00006;
/** Largest mark taken for a fold, as a share of the page: a bigger dark area is real print or a band. */
const MAX_AREA = 0.03;
/** How near a page edge a mark must come to touch it, as a share of the short side. */
const REACH = 0.02;
/** A fold's two legs are within this ratio of each other; longer and thinner is a rule along one edge. */
const MAX_LEAN = 6;
/** How far into the page an edge sliver reaches, at most, as a share of the short side. */
const SLIVER_DEPTH = 0.015;
/** A sliver is at least this many times longer than it is deep; a squarer mark on an edge is print. */
const SLIVER_LEAN = 5;
/** Shortest sliver, as a share of its edge: shorter is a tick. */
const SLIVER_LENGTH = 0.02;
/** Longest sliver, as a share of its edge: a mark that runs further is a printed band. */
const SLIVER_REACH = 0.5;
/** A lifted edge tapers, so a sliver fills at most this share of its box; print of even depth fills it. */
const SLIVER_FILL = 0.8;
/** How far from an edge, in pixels, a sliver may start. */
const ON_EDGE = 1;
/** How much of the corner triangle the mark must fill. */
const MIN_FILL = 0.8;
/** How much of the mark may lie outside the triangle: a fold is a clean wedge, a block of print is not. */
const MAX_SPILL = 0.1;
/** Marks this small (share of the page) skip the spill test: a tiny corner block is never print. */
const TINY_AREA = 0.0005;
/** How far the paint reaches past the mark, as a share of the short side: the mark's soft edge. */
const GROW = 0.006;
/** How far the paper is read around the paint, as a share of the short side: past the fold's own bright rim. */
const RING = 0.06;
/** Grey a pixel needs to count as clean paper in the ring. */
const PAPER = 250;
/** Fewest ring pixels worth fitting a plane to; fewer take the ring's mean colour. */
const MIN_FIT = 64;
/** The paint stays between these shares of the ring's values: a bright highlight along the fold is not paper. */
const RANGE = [0.1, 0.9];

interface Box { minX: number; minY: number; maxX: number; maxY: number }
type Corner = { right: boolean; bottom: boolean };
const CORNERS: Corner[] = [
  { right: false, bottom: false }, { right: true, bottom: false },
  { right: false, bottom: true }, { right: true, bottom: true },
];

/** The corner whose triangle this mark fills cleanly, or null. */
function foldedCorner(pixels: Int32Array, box: Box, width: number, height: number): Corner | null {
  const area = pixels.length;
  const page = width * height;
  const reach = REACH * Math.min(width, height);
  for (const c of CORNERS) {
    const nearX = c.right ? box.maxX >= width - 1 - reach : box.minX <= reach;
    const nearY = c.bottom ? box.maxY >= height - 1 - reach : box.minY <= reach;
    if (!nearX || !nearY) continue;
    const legX = c.right ? width - box.minX : box.maxX + 1;
    const legY = c.bottom ? height - box.minY : box.maxY + 1;
    if (Math.max(legX, legY) > MAX_LEAN * Math.min(legX, legY)) continue;
    let inside = 0;
    for (const i of pixels) {
      const x = i % width;
      const dx = c.right ? width - 1 - x : x;
      const dy = c.bottom ? height - 1 - (i - x) / width : (i - x) / width;
      if (dx / legX + dy / legY <= 1) inside += 1;
    }
    const fill = inside / ((legX * legY) / 2);
    const spill = 1 - inside / area;
    if (fill >= MIN_FILL && (spill <= MAX_SPILL || area <= TINY_AREA * page)) return c;
  }
  return null;
}

/** True for a long thin tapering mark lying along one page edge: table past a lifted edge. */
function edgeSliver(area: number, box: Box, width: number, height: number): boolean {
  const limit = SLIVER_DEPTH * Math.min(width, height);
  const sliver = (depth: number, length: number, edge: number) =>
    depth <= limit && length >= SLIVER_LEAN * depth &&
    length >= SLIVER_LENGTH * edge && length <= SLIVER_REACH * edge &&
    area <= SLIVER_FILL * depth * length;
  const wide = box.maxX - box.minX + 1;
  const tall = box.maxY - box.minY + 1;
  const onSide = box.minX <= ON_EDGE || box.maxX >= width - 1 - ON_EDGE;
  const onEnd = box.minY <= ON_EDGE || box.maxY >= height - 1 - ON_EDGE;
  return (onSide && sliver(wide, tall, height)) || (onEnd && sliver(tall, wide, width));
}

/** `mask` grown by `r` pixels each way, square, one axis at a time. */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const across = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx += 1) across[y * w + xx] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!across[y * w + x]) continue;
      for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy += 1) out[yy * w + x] = 1;
    }
  }
  return out;
}

/** Solves the 3x3 system `m` v = `b` by Cramer's rule, or null when the points do not span a plane. */
function solve3(m: number[], b: number[]): number[] | null {
  const det = (a: number[]) =>
    a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  const d = det(m);
  if (Math.abs(d) < 1e-9) return null;
  return [0, 1, 2].map((col) => det(m.map((v, i) => (i % 3 === col ? b[Math.floor(i / 3)] : v))) / d);
}

/** Paint for a mask pixel at (x, y) per channel: the plane through the ring, held inside the ring's usual values. */
function planePaint(ring: { x: number; y: number; rgb: number[] }[]): (x: number, y: number) => number[] {
  const n = ring.length;
  const mean = [0, 0, 0];
  let mx = 0;
  let my = 0;
  for (const p of ring) {
    mx += p.x / n;
    my += p.y / n;
    for (let k = 0; k < 3; k += 1) mean[k] += p.rgb[k] / n;
  }
  const flat = () => mean.map(Math.round);
  if (n < MIN_FIT) return flat;
  // Normal equations on coordinates centred on the ring, so the numbers stay small.
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  const sv = [0, 0, 0], sxv = [0, 0, 0], syv = [0, 0, 0];
  for (const p of ring) {
    const x = p.x - mx;
    const y = p.y - my;
    sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
    for (let k = 0; k < 3; k += 1) { sv[k] += p.rgb[k]; sxv[k] += x * p.rgb[k]; syv[k] += y * p.rgb[k]; }
  }
  const m = [n, sx, sy, sx, sxx, sxy, sy, sxy, syy];
  const fits = [0, 1, 2].map((k) => solve3(m, [sv[k], sxv[k], syv[k]]));
  if (fits.some((f) => f === null)) return flat;
  const sorted = [0, 1, 2].map((k) => Uint8Array.from(ring, (p) => p.rgb[k]).sort());
  const [lo, hi] = RANGE.map((share) => sorted.map((values) => values[Math.floor(share * n)]));
  return (x, y) => fits.map((f, k) => Math.round(Math.min(hi[k], Math.max(lo[k], f![0] + f![1] * (x - mx) + f![2] * (y - my)))));
}

/** Paints one folded mark in the paper around it, into `out`. A mark with no paper around it is left. */
function paintMark(out: Uint8ClampedArray, src: RgbaImage, grey: Uint8ClampedArray, pixels: Int32Array, box: Box): void {
  const { width, height } = src;
  const short = Math.min(width, height);
  const grow = Math.round(GROW * short);
  const far = grow + Math.round(RING * short);
  const x0 = Math.max(0, box.minX - far);
  const y0 = Math.max(0, box.minY - far);
  const w = Math.min(width - 1, box.maxX + far) - x0 + 1;
  const h = Math.min(height - 1, box.maxY + far) - y0 + 1;
  const mark = new Uint8Array(w * h);
  for (const i of pixels) {
    const x = i % width;
    mark[((i - x) / width - y0) * w + (x - x0)] = 1;
  }
  const mask = dilate(mark, w, h, grow);
  const wide = dilate(mask, w, h, far - grow);
  const ring: { x: number; y: number; rgb: number[] }[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const at = (y + y0) * width + x + x0;
      if (!wide[y * w + x] || mask[y * w + x] || grey[at] < PAPER) continue;
      ring.push({ x: x + x0, y: y + y0, rgb: [src.data[at * 4], src.data[at * 4 + 1], src.data[at * 4 + 2]] });
    }
  }
  if (ring.length === 0) return;
  const paint = planePaint(ring);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      const rgb = paint(x + x0, y + y0);
      out.set([rgb[0], rgb[1], rgb[2], 255], ((y + y0) * width + x + x0) * 4);
    }
  }
}

/** The page with every folded corner and edge sliver painted in the paper's colour; the same object when it has none. */
export function fillFoldedCorners(image: RgbaImage): RgbaImage {
  const { width, height } = image;
  const grey = documentGrey(image);
  let out: Uint8ClampedArray | null = null;
  eachMark(grey, width, height, DARK, (pixels) => {
    const box: Box = { minX: width, minY: height, maxX: -1, maxY: -1 };
    for (const i of pixels) {
      const x = i % width;
      const y = (i - x) / width;
      if (x < box.minX) box.minX = x;
      if (x > box.maxX) box.maxX = x;
      if (y < box.minY) box.minY = y;
      if (y > box.maxY) box.maxY = y;
    }
    const share = pixels.length / (width * height);
    if (share < MIN_AREA || share > MAX_AREA) return;
    if (!foldedCorner(pixels, box, width, height) && !edgeSliver(pixels.length, box, width, height)) return;
    out ??= image.data.slice();
    paintMark(out, image, grey, pixels, box);
  });
  return out ? { width, height, data: out } : image;
}
