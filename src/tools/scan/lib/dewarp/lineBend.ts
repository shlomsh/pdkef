// Measures how the text lines of an already-flattened scanned page curve (SCAN-17). It finds the ink,
// joins characters into line blobs, follows each blob's centre across the page and fits one shared
// bend (the LineBend basis) plus a free height per line. Returns null unless the page clearly bends.
// Pure: no DOM.

import type { GrayImage } from '../quad.ts';
import { bendAt, type LineBend } from './types.ts';

/** A pixel is ink when it is darker than this share of the paper level around it. */
const INK_RATIO = 0.75;
/** Share of each dimension ignored along every edge (scanner and corner shadows). */
const MARGIN = 0.03;
/** Block size for the local paper level, as a share of the long edge. */
const PAPER_BLOCK = 1 / 40;
/** Horizontal reach of the smear that joins characters and words into a line, as a share of the width. */
const SMEAR = 0.012;
/** A line blob must span at least this share of the image width. */
const MIN_LINE_WIDTH = 0.15;
/** A line blob must be at least this many times wider than its mean thickness. */
const MIN_ASPECT = 8;
/** A line blob's mean thickness may be at most this share of the image height. */
const MAX_THICKNESS = 0.04;
/** Columns sampled along a line, as a share of the width. */
const SAMPLE_STEP = 0.01;
/** Fewest samples a line needs. */
const MIN_SAMPLES = 10;
/** Most lines used in the fit (the widest ones). */
const MAX_LINES = 60;
/** Ridge added to the bend coefficients for stability. */
const RIDGE = 1e-6;
/** A line is dropped when its residual RMS is over this many times the median line RMS. */
const OUTLIER_FACTOR = 3;
/** A line is dropped when its residual RMS (normalized units) is over this. */
const OUTLIER_RMS = 0.004;
/** Fewest lines that must survive. */
const MIN_LINES = 4;
/** The surviving lines must span at least this share of the height. */
const MIN_SPAN = 0.3;
/** Below this the page is flat already (normalized units). */
const MIN_BEND = 0.0015;
/** Above this the fit is implausible (normalized units). */
const MAX_BEND = 0.06;
/** The fit must leave less than this share of the lines' own wobble unexplained. */
const MAX_UNEXPLAINED = 0.5;
/** Curvature (bend minus its best straight-in-x part) below this means a plain tilt, which corners own. */
const MIN_CURVATURE = 0.0015;

interface Sample { line: number; x: number; y: number }

function inkMask(gray: GrayImage): Uint8Array {
  const { width: w, height: h, data } = gray;
  const bs = Math.max(8, Math.round(Math.max(w, h) * PAPER_BLOCK));
  const gw = Math.ceil(w / bs);
  const gh = Math.ceil(h / bs);
  const maxes = new Float32Array(gw * gh);
  for (let y = 0; y < h; y += 1) {
    const row = Math.floor(y / bs) * gw;
    for (let x = 0; x < w; x += 1) {
      const i = row + Math.floor(x / bs);
      if (data[y * w + x] > maxes[i]) maxes[i] = data[y * w + x];
    }
  }
  const paper = new Float32Array(gw * gh);
  for (let by = 0; by < gh; by += 1) {
    for (let bx = 0; bx < gw; bx += 1) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const yy = by + dy;
          const xx = bx + dx;
          if (yy < 0 || yy >= gh || xx < 0 || xx >= gw) continue;
          sum += maxes[yy * gw + xx];
          n += 1;
        }
      }
      paper[by * gw + bx] = sum / n;
    }
  }
  const mask = new Uint8Array(w * h);
  const mx = Math.ceil(w * MARGIN);
  const my = Math.ceil(h * MARGIN);
  for (let y = my; y < h - my; y += 1) {
    const row = Math.floor(y / bs) * gw;
    for (let x = mx; x < w - mx; x += 1) {
      if (data[y * w + x] < INK_RATIO * paper[row + Math.floor(x / bs)]) mask[y * w + x] = 1;
    }
  }
  return mask;
}

/** A pixel is "line" when there is ink within +-reach of it on its row. */
function smear(mask: Uint8Array, w: number, h: number): Uint8Array {
  const reach = Math.max(1, Math.round(w * SMEAR));
  const out = new Uint8Array(w * h);
  const prefix = new Int32Array(w + 1);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) prefix[x + 1] = prefix[x] + mask[y * w + x];
    for (let x = 0; x < w; x += 1) {
      const lo = Math.max(0, x - reach);
      const hi = Math.min(w, x + reach + 1);
      if (prefix[hi] - prefix[lo] > 0) out[y * w + x] = 1;
    }
  }
  return out;
}

/** Centre-height samples of every text-line component, widest first, at most MAX_LINES lines. */
function lineSamples(blob: Uint8Array, w: number, h: number): Sample[][] {
  const label = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const step = Math.max(1, Math.round(w * SAMPLE_STEP));
  const found: { width: number; samples: Sample[] }[] = [];
  const sum = new Float64Array(w);
  const cnt = new Int32Array(w);
  for (let start = 0; start < blob.length; start += 1) {
    if (!blob[start] || label[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = 1;
    let minX = w;
    let maxX = 0;
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const y = (p - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (x > 0 && blob[p - 1] && !label[p - 1]) { label[p - 1] = 1; queue[tail++] = p - 1; }
      if (x < w - 1 && blob[p + 1] && !label[p + 1]) { label[p + 1] = 1; queue[tail++] = p + 1; }
      if (y > 0 && blob[p - w] && !label[p - w]) { label[p - w] = 1; queue[tail++] = p - w; }
      if (y < h - 1 && blob[p + w] && !label[p + w]) { label[p + w] = 1; queue[tail++] = p + w; }
    }
    const width = maxX - minX + 1;
    const thickness = tail / width;
    if (width < MIN_LINE_WIDTH * w || width / thickness < MIN_ASPECT || thickness > MAX_THICKNESS * h) continue;
    for (let x = minX; x <= maxX; x += 1) { sum[x] = 0; cnt[x] = 0; }
    for (let k = 0; k < tail; k += 1) {
      const x = queue[k] % w;
      if (x % step !== 0) continue;
      sum[x] += (queue[k] - x) / w;
      cnt[x] += 1;
    }
    const samples: Sample[] = [];
    for (let x = minX; x <= maxX; x += 1) {
      if (cnt[x] > 0) samples.push({ line: 0, x: (x + 0.5) / w, y: (sum[x] / cnt[x] + 0.5) / h });
    }
    if (samples.length >= MIN_SAMPLES) found.push({ width, samples });
  }
  found.sort((a, b) => b.width - a.width);
  return found.slice(0, MAX_LINES).map((f) => f.samples);
}

function basis(x: number, y: number): number[] {
  const out: number[] = [];
  let xi = x;
  for (let i = 1; i <= 3; i += 1) {
    const b = xi - 1 / (i + 1);
    out.push(b, b * y, b * y * y);
    xi *= x;
  }
  return out;
}

/** Gaussian elimination with partial pivoting on an n x n system; returns null when singular. */
function solve(a: Float64Array, b: Float64Array, n: number): Float64Array | null {
  for (let col = 0; col < n; col += 1) {
    let best = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(a[r * n + col]) > Math.abs(a[best * n + col])) best = r;
    if (Math.abs(a[best * n + col]) < 1e-12) return null;
    if (best !== col) {
      for (let k = 0; k < n; k += 1) { const t = a[col * n + k]; a[col * n + k] = a[best * n + k]; a[best * n + k] = t; }
      const t = b[col]; b[col] = b[best]; b[best] = t;
    }
    for (let r = col + 1; r < n; r += 1) {
      const f = a[r * n + col] / a[col * n + col];
      if (f === 0) continue;
      for (let k = col; k < n; k += 1) a[r * n + k] -= f * a[col * n + k];
      b[r] -= f * b[col];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = b[r];
    for (let k = r + 1; k < n; k += 1) s -= a[r * n + k] * x[k];
    x[r] = s / a[r * n + r];
  }
  return x;
}

interface Fit { bend: LineBend; offsets: number[] }

function fit(lines: Sample[][]): Fit | null {
  const n = 9 + lines.length;
  const a = new Float64Array(n * n);
  const b = new Float64Array(n);
  lines.forEach((samples, k) => {
    for (const s of samples) {
      const phi = basis(s.x, s.y);
      for (let p = 0; p < 9; p += 1) {
        for (let q = 0; q < 9; q += 1) a[p * n + q] += phi[p] * phi[q];
        a[p * n + 9 + k] += phi[p];
        a[(9 + k) * n + p] += phi[p];
        b[p] += phi[p] * s.y;
      }
      a[(9 + k) * n + 9 + k] += 1;
      b[9 + k] += s.y;
    }
  });
  for (let p = 0; p < 9; p += 1) a[p * n + p] += RIDGE;
  const x = solve(a, b, n);
  if (!x) return null;
  return { bend: { c: Array.from(x.subarray(0, 9)) }, offsets: Array.from(x.subarray(9)) };
}

function lineRms(samples: Sample[], offset: number, bend: LineBend): number {
  let s = 0;
  for (const p of samples) { const r = p.y - offset - bendAt(bend, p.x, p.y); s += r * r; }
  return Math.sqrt(s / samples.length);
}

export function findLineBend(gray: GrayImage): LineBend | null {
  const { width: w, height: h } = gray;
  if (w < 16 || h < 16) return null;
  let lines = lineSamples(smear(inkMask(gray), w, h), w, h);
  if (lines.length < MIN_LINES) return null;
  let result = fit(lines);
  if (!result) return null;

  const rms = lines.map((s, k) => lineRms(s, result!.offsets[k], result!.bend));
  const median = [...rms].sort((p, q) => p - q)[Math.floor(rms.length / 2)];
  lines = lines.filter((_, k) => rms[k] <= OUTLIER_FACTOR * median && rms[k] <= OUTLIER_RMS);
  if (lines.length < MIN_LINES) return null;
  result = fit(lines);
  if (!result) return null;

  const centres = lines.map((s) => s.reduce((t, p) => t + p.y, 0) / s.length);
  if (Math.max(...centres) - Math.min(...centres) < MIN_SPAN) return null;

  let resid = 0;
  let wobble = 0;
  let count = 0;
  lines.forEach((s, k) => {
    for (const p of s) {
      const r = p.y - result!.offsets[k] - bendAt(result!.bend, p.x, p.y);
      resid += r * r;
      wobble += (p.y - centres[k]) ** 2;
      count += 1;
    }
  });
  if (Math.sqrt(resid / count) > MAX_UNEXPLAINED * Math.sqrt(wobble / count)) return null;

  const grid = 9;
  let maxBend = 0;
  let maxCurve = 0;
  for (let gy = 0; gy < grid; gy += 1) {
    const y = gy / (grid - 1);
    const vals: number[] = [];
    for (let gx = 0; gx < grid; gx += 1) vals.push(bendAt(result.bend, gx / (grid - 1), y));
    for (const v of vals) maxBend = Math.max(maxBend, Math.abs(v));
    // Best straight-in-x part of this row, by least squares.
    const mx = 0.5;
    const mv = vals.reduce((t, v) => t + v, 0) / grid;
    let sxy = 0;
    let sxx = 0;
    vals.forEach((v, gx) => { const dx = gx / (grid - 1) - mx; sxy += dx * (v - mv); sxx += dx * dx; });
    const slope = sxy / sxx;
    vals.forEach((v, gx) => { maxCurve = Math.max(maxCurve, Math.abs(v - mv - slope * (gx / (grid - 1) - mx))); });
  }
  if (maxBend < MIN_BEND || maxBend > MAX_BEND) return null;
  if (maxCurve < MIN_CURVATURE) return null;
  return result.bend;
}
