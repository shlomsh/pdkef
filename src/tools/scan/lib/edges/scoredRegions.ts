// Edge guess, strategy two: try several brightness cuts, clean each mask with an opening, fit the
// best four-corner shape to each large bright blob and keep the blob that fills its quad best.
// A white page on a busy floor merges with bright clutter at the Otsu cut but separates at a
// brighter one; the score picks whichever cut leaves a clean, page-sized quadrilateral. Pure.
import { isConvexQuad, orderQuad } from '../quad.ts';
import type { GrayImage, Point, Quad } from '../quad.ts';
import { blur3, otsu } from './brightRegion.ts';
import type { EdgeGuesser } from './types.ts';

const OFFSETS = [0, 15, 30, 45, 60, 75, -15];
const MIN_COMPONENT = 0.08;
const MIN_QUAD_AREA = 0.1;
const MIN_FILL = 0.8;
const FRAME_MARGIN = 0.02;
const PER_MASK = 3;
const MAX_HULL = 80;
const TIE = 0.95;
const MIN_ANGLE = 50;
const MAX_ANGLE = 130;

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convex hull by monotone chain; collinear points dropped. Counter-clockwise in math axes. */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const build = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...build(pts), ...build([...pts].reverse())];
}

/** Drop the vertices that change the shape least until at most `max` remain. */
function simplify(hull: Point[], max: number): Point[] {
  const h = [...hull];
  while (h.length > max) {
    let best = 0;
    let bestArea = Infinity;
    for (let i = 0; i < h.length; i += 1) {
      const a = Math.abs(cross(h[(i + h.length - 1) % h.length], h[i], h[(i + 1) % h.length]));
      if (a < bestArea) { bestArea = a; best = i; }
    }
    h.splice(best, 1);
  }
  return h;
}

const triArea = (a: Point, b: Point, c: Point) => Math.abs(cross(a, b, c)) / 2;

/** The four hull vertices whose quadrilateral has the largest area, in hull order. */
export function maxAreaQuad(hullIn: Point[]): Point[] | null {
  const hull = hullIn.length > MAX_HULL ? simplify(hullIn, MAX_HULL) : hullIn;
  const m = hull.length;
  if (m < 4) return null;
  let bestArea = 0;
  let best: Point[] | null = null;
  for (let i = 0; i < m; i += 1) {
    for (let j = i + 2; j < m; j += 1) {
      let a1 = 0; let k1 = -1;
      for (let k = i + 1; k < j; k += 1) { const t = triArea(hull[i], hull[k], hull[j]); if (t > a1) { a1 = t; k1 = k; } }
      let a2 = 0; let k2 = -1;
      for (let k = j + 1; k < m + i; k += 1) { const t = triArea(hull[i], hull[k % m], hull[j]); if (t > a2) { a2 = t; k2 = k % m; } }
      if (k1 >= 0 && k2 >= 0 && a1 + a2 > bestArea) { bestArea = a1 + a2; best = [hull[i], hull[k1], hull[j], hull[k2]]; }
    }
  }
  return best;
}

/** Every interior angle of the (pixel-space) quad lies within 50..130 degrees. */
export function anglesOk(quad: Quad): boolean {
  for (let i = 0; i < 4; i += 1) {
    const p = quad[i];
    const a = quad[(i + 3) % 4];
    const b = quad[(i + 1) % 4];
    const v1x = a.x - p.x; const v1y = a.y - p.y; const v2x = b.x - p.x; const v2y = b.y - p.y;
    const len = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
    if (len === 0) return false;
    const deg = (Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / len))) * 180) / Math.PI;
    if (deg < MIN_ANGLE || deg > MAX_ANGLE) return false;
  }
  return true;
}

function polygonArea(q: Point[]): number {
  let twice = 0;
  for (let i = 0; i < q.length; i += 1) { const a = q[i]; const b = q[(i + 1) % q.length]; twice += a.x * b.y - b.x * a.y; }
  return Math.abs(twice) / 2;
}

/** 3x3 erosion (outside the frame counts as set, so a page at the edge is not eaten). */
function erode(src: Uint8Array, w: number, h: number, tmp: Uint8Array, out: Uint8Array): void {
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      tmp[i] = src[i] & (x > 0 ? src[i - 1] : 1) & (x < w - 1 ? src[i + 1] : 1);
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      out[i] = tmp[i] & (y > 0 ? tmp[i - w] : 1) & (y < h - 1 ? tmp[i + w] : 1);
    }
  }
}

function dilate(src: Uint8Array, w: number, h: number, tmp: Uint8Array, out: Uint8Array): void {
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      tmp[i] = src[i] | (x > 0 ? src[i - 1] : 0) | (x < w - 1 ? src[i + 1] : 0);
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      out[i] = tmp[i] | (y > 0 ? tmp[i - w] : 0) | (y < h - 1 ? tmp[i + w] : 0);
    }
  }
}

function open(mask: Uint8Array, w: number, h: number): Uint8Array {
  let a: Uint8Array = mask;
  let b: Uint8Array = new Uint8Array(w * h);
  const tmp = new Uint8Array(w * h);
  for (let it = 0; it < 2; it += 1) { erode(a, w, h, tmp, b); [a, b] = [b, a]; if (it === 0) b = new Uint8Array(w * h); }
  for (let it = 0; it < 2; it += 1) { dilate(a, w, h, tmp, b); [a, b] = [b, a]; if (it === 0) b = new Uint8Array(w * h); }
  return a;
}

/** 4-connected labels (1-based) and each label's pixel count. */
function label(mask: Uint8Array, w: number, h: number): { labels: Int32Array; sizes: number[] } {
  const n = w * h;
  const labels = new Int32Array(n);
  const stack = new Int32Array(n);
  const sizes = [0];
  for (let s = 0; s < n; s += 1) {
    if (!mask[s] || labels[s]) continue;
    const id = sizes.length;
    let sp = 0; let size = 0;
    stack[sp++] = s; labels[s] = id;
    while (sp > 0) {
      const p = stack[--sp];
      size += 1;
      const x = p % w;
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = id; stack[sp++] = p + 1; }
      if (p >= w && mask[p - w] && !labels[p - w]) { labels[p - w] = id; stack[sp++] = p - w; }
      if (p < n - w && mask[p + w] && !labels[p + w]) { labels[p + w] = id; stack[sp++] = p + w; }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

/** Pixel-corner points of each row's leftmost and rightmost pixel of one component. */
function rowExtremes(labels: Int32Array, id: number, w: number, h: number): Point[] {
  const pts: Point[] = [];
  for (let y = 0; y < h; y += 1) {
    let l = -1; let r = -1;
    for (let x = 0; x < w; x += 1) if (labels[y * w + x] === id) { if (l < 0) l = x; r = x; }
    if (l < 0) continue;
    pts.push({ x: l, y }, { x: l, y: y + 1 }, { x: r + 1, y }, { x: r + 1, y: y + 1 });
  }
  return pts;
}

export const guessByScoredRegions: EdgeGuesser = (image: GrayImage): Quad | null => {
  const { width: w, height: h } = image;
  if (w < 8 || h < 8) return null;
  const n = w * h;
  const blurred = blur3(blur3(image.data, w, h), w, h);
  const base = otsu(blurred);
  if (base < 0) return null;

  const candidates: { score: number; fill: number; quad: Quad }[] = [];
  for (const off of OFFSETS) {
    const t = base + off;
    if (t < 1 || t > 254) continue;
    const raw = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) raw[i] = blurred[i] > t ? 1 : 0;
    const { labels, sizes } = label(open(raw, w, h), w, h);
    const ids = sizes.map((s, id) => id).filter((id) => id > 0 && sizes[id] >= MIN_COMPONENT * n)
      .sort((a, b) => sizes[b] - sizes[a]).slice(0, PER_MASK);
    for (const id of ids) {
      const quadPx = maxAreaQuad(convexHull(rowExtremes(labels, id, w, h)));
      if (!quadPx) continue;
      const quad = orderQuad(quadPx);
      const area = polygonArea(quad);
      if (area < MIN_QUAD_AREA * n || !isConvexQuad(quad) || !anglesOk(quad)) continue;
      // Symmetric: a blob bulging out of its quad (a patch glued to the page) is as bad as a dented one.
      const fill = Math.min(sizes[id], area) / Math.max(sizes[id], area);
      if (fill < MIN_FILL) continue;
      const norm = quad.map((p) => ({ x: p.x / w, y: p.y / h })) as Quad;
      const frame = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
      if (norm.every((p, i) => Math.abs(p.x - frame[i].x) <= FRAME_MARGIN && Math.abs(p.y - frame[i].y) <= FRAME_MARGIN)) continue;
      const score = fill ** 3 * Math.sqrt(area / n);
      candidates.push({ score, fill, quad: norm });
    }
  }
  if (candidates.length === 0) return null;
  // Scores that are nearly tied say the same page was cut at several brightness levels; the cleanest
  // quad of those (highest fill) hugs the page, where the top score tends to favour the biggest blob.
  const top = Math.max(...candidates.map((c) => c.score));
  const close = candidates.filter((c) => c.score >= TIE * top);
  return close.reduce((a, b) => (b.fill > a.fill ? b : a)).quad;
};
