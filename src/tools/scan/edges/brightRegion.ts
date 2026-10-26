// Edge guess, strategy one: the page is the largest bright blob. Blur, split bright from dark with
// Otsu, take the biggest 4-connected bright component and read its four extreme corners. Low
// precision on purpose (the person's corners always win); when anything looks off it says null.
import { isConvexQuad, orderQuad } from '../quad.ts';
import type { GrayImage, Quad } from '../quad.ts';
import type { EdgeGuesser } from './types.ts';

const MIN_AREA = 0.15;
const MIN_FILL = 0.85;
const FRAME_MARGIN = 0.02;

function blur3(src: Uint8Array | Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w - 1, x + 1);
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy <= y1; yy += 1) for (let xx = x0; xx <= x1; xx += 1) { sum += src[yy * w + xx]; n += 1; }
      out[y * w + x] = sum / n;
    }
  }
  return out;
}

/** Otsu's threshold over a 256-bin histogram, or -1 when the image has a single level. */
function otsu(values: Float32Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < values.length; i += 1) hist[Math.min(255, Math.max(0, Math.round(values[i])))] += 1;
  const total = values.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t += 1) sumAll += t * hist[t];
  let wB = 0;
  let sumB = 0;
  let best = -1;
  let bestVar = 0;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const diff = sumB / wB - (sumAll - sumB) / wF;
    const v = wB * wF * diff * diff;
    if (v > bestVar) { bestVar = v; best = t; }
  }
  return best;
}

export const guessByBrightRegion: EdgeGuesser = (image: GrayImage): Quad | null => {
  const { width: w, height: h } = image;
  if (w < 8 || h < 8) return null;
  const blurred = blur3(blur3(image.data, w, h), w, h);
  const threshold = otsu(blurred);
  if (threshold < 0) return null;

  const n = w * h;
  const fg = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) fg[i] = blurred[i] > threshold ? 1 : 0;

  // Largest 4-connected component by iterative flood fill.
  const label = new Uint8Array(n);
  const stack = new Int32Array(n);
  let bestStart = -1;
  let bestSize = 0;
  for (let s = 0; s < n; s += 1) {
    if (!fg[s] || label[s]) continue;
    let sp = 0;
    let size = 0;
    stack[sp++] = s;
    label[s] = 1;
    while (sp > 0) {
      const p = stack[--sp];
      size += 1;
      const x = p % w;
      if (x > 0 && fg[p - 1] && !label[p - 1]) { label[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && fg[p + 1] && !label[p + 1]) { label[p + 1] = 1; stack[sp++] = p + 1; }
      if (p >= w && fg[p - w] && !label[p - w]) { label[p - w] = 1; stack[sp++] = p - w; }
      if (p < n - w && fg[p + w] && !label[p + w]) { label[p + w] = 1; stack[sp++] = p + w; }
    }
    if (size > bestSize) { bestSize = size; bestStart = s; }
  }
  if (bestStart < 0 || bestSize < MIN_AREA * n) return null;

  // Re-fill the winner into its own mask, tracking the four extreme projections.
  const inBest = new Uint8Array(n);
  let sp = 0;
  stack[sp++] = bestStart;
  inBest[bestStart] = 1;
  let tl = Infinity; let br = -Infinity; let tr = -Infinity; let bl = Infinity;
  const c = [0, 0, 0, 0]; // tl, tr, br, bl as pixel indexes
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % w;
    const y = (p - x) / w;
    if (x + y < tl) { tl = x + y; c[0] = p; }
    if (x - y > tr) { tr = x - y; c[1] = p; }
    if (x + y > br) { br = x + y; c[2] = p; }
    if (x - y < bl) { bl = x - y; c[3] = p; }
    if (x > 0 && fg[p - 1] && !inBest[p - 1]) { inBest[p - 1] = 1; stack[sp++] = p - 1; }
    if (x < w - 1 && fg[p + 1] && !inBest[p + 1]) { inBest[p + 1] = 1; stack[sp++] = p + 1; }
    if (p >= w && fg[p - w] && !inBest[p - w]) { inBest[p - w] = 1; stack[sp++] = p - w; }
    if (p < n - w && fg[p + w] && !inBest[p + w]) { inBest[p + w] = 1; stack[sp++] = p + w; }
  }

  const quad = orderQuad(c.map((p) => ({ x: ((p % w) + 0.5) / w, y: (Math.floor(p / w) + 0.5) / h })));
  if (!isConvexQuad(quad)) return null;

  // Shoelace area in pixels against the component's pixel count.
  let twice = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    twice += a.x * w * (b.y * h) - b.x * w * (a.y * h);
  }
  const area = Math.abs(twice) / 2;
  if (area < MIN_AREA * n || bestSize < MIN_FILL * area) return null;

  const corners = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const wholeFrame = quad.every((p, i) => Math.abs(p.x - corners[i].x) <= FRAME_MARGIN && Math.abs(p.y - corners[i].y) <= FRAME_MARGIN);
  return wholeFrame ? null : quad;
};
