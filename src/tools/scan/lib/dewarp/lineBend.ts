// Measures how the text lines of an already-flattened scanned page curve (SCAN-17). It finds the ink,
// joins characters into line blobs, follows each blob's centre across the page and fits one shared
// bend (the LineBend basis) plus a free height per line. Returns null unless the page clearly bends.
// Pure: no DOM.

import type { GrayImage } from '../quad.ts';
import { pageMasks, type PageMasks } from './ink.ts';
import { bendAt, type LineBend } from './types.ts';

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
/** Samples either side in the running median that finds a line's baseline. */
const BASELINE_WINDOW = 3;
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
/** A line counts toward the shared lean when it spans at least this share of the width... */
const LEAN_SPAN = 0.3;
/** ...and follows its own straight line to within the median line's RMS, or this (normalized). */
const LEAN_RMS = 0.001;
/** A bend is applied only when it leaves less than this share of the lines' own wobble unexplained. */
const MAX_UNEXPLAINED = 0.5;

/** One point on a line: `y` across it, observed at `x` along it, both 0..1. */
export interface Sample { line: number; x: number; y: number }

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
  const bottom = new Int32Array(w);
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
    // Each sampled column's lowest ink: the baseline. The centre of the column's ink would not do: a
    // label joined to its underline centres mid-letter over the label and on the rule beyond it, the
    // same step on every row of a form, which a shared bend fits as a wave across a flat page.
    for (let x = minX; x <= maxX; x += 1) bottom[x] = -1;
    for (let k = 0; k < tail; k += 1) {
      const x = queue[k] % w;
      if (x % step !== 0) continue;
      const y = (queue[k] - x) / w;
      if (y > bottom[x]) bottom[x] = y;
    }
    const raw: number[] = [];
    const xs: number[] = [];
    for (let x = minX; x <= maxX; x += 1) if (bottom[x] >= 0) { xs.push(x); raw.push(bottom[x]); }
    // A running median drops the descenders (g, p, y) that reach below the baseline here and there.
    const samples: Sample[] = xs.map((x, k) => {
      const window = raw.slice(Math.max(0, k - BASELINE_WINDOW), k + BASELINE_WINDOW + 1).sort((a, b) => a - b);
      return { line: 0, x: (x + 0.5) / w, y: (window[window.length >> 1] + 0.5) / h };
    });
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

/** @testSeam The rows alone, their shared lean left to the corners: what the tests measure a page by. */
export function findLineBend(gray: GrayImage): LineBend | null {
  return finishBend(lineFit(pageMasks(gray)), 0);
}

/** The rows' fit before its lean is settled (see finishBend), or null when there are no clear rows.
 * The vertical rules are left out: a form's grid would otherwise join every row into one shape. */
export function lineFit({ ink, rules, width: w, height: h }: PageMasks): FittedBend | null {
  if (w < 16 || h < 16) return null;
  const rows = new Uint8Array(ink.length);
  for (let i = 0; i < ink.length; i += 1) rows[i] = ink[i] & (rules[i] ^ 1);
  return fitBend(lineSamples(smear(rows, w, h), w, h), MIN_LINES);
}

/** A fit through a page's lines, its lean still in it. `lean` is the slope (normalized, y per x) the
 * lines share, the median of their own; the bend's lean that differs down the page is a fan.
 * `explained`: the fit follows the lines' own wobble well enough to be applied as a bend. */
export interface FittedBend { bend: LineBend; lean: number; explained: boolean }

/**
 * One shared bend through every line's samples (each `y` observed at `x`), with a free height per
 * line, robust to a stray line, and null unless there are enough lines over enough of the page.
 */
export function fitBend(found: Sample[][], minLines: number): FittedBend | null {
  let lines = found;
  if (lines.length < minLines) return null;
  let result = fit(lines);
  if (!result) return null;

  const rms = lines.map((s, k) => lineRms(s, result!.offsets[k], result!.bend));
  const median = [...rms].sort((p, q) => p - q)[Math.floor(rms.length / 2)];
  lines = lines.filter((_, k) => rms[k] <= OUTLIER_FACTOR * median && rms[k] <= OUTLIER_RMS);
  if (lines.length < minLines) return null;
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
  // A fit that leaves much of the lines' own wobble unexplained is no bend to apply, but its lean still
  // says how level the lines are (straight rows have no wobble to explain).
  const explained = Math.sqrt(resid / count) <= MAX_UNEXPLAINED * Math.sqrt(wobble / count);

  let x0 = 1; let x1 = 0; let y0 = 1; let y1 = 0;
  for (const line of lines) for (const p of line) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const bend: LineBend = { c: [...result.bend.c], box: { x0, x1, y0, y1 } };
  return { bend, lean: medianSlope(lines), explained };
}

/** The lines' shared lean: the median of each line's own least-squares slope, taken over the lines
 * that are straight on their own and run across a good part of the page. A polynomial's slope at one
 * point swings with noise at the ends of ragged lines; and a form's cell, where a label, a handwritten
 * value and the cell's rule join into one shape, slopes wherever the handwriting goes. */
function medianSlope(lines: Sample[][]): number {
  const own = lines.map((line) => {
    const mx = line.reduce((t, p) => t + p.x, 0) / line.length;
    const my = line.reduce((t, p) => t + p.y, 0) / line.length;
    let num = 0;
    let den = 0;
    for (const p of line) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
    const slope = den > 0 ? num / den : 0;
    let sq = 0;
    for (const p of line) sq += (p.y - my - slope * (p.x - mx)) ** 2;
    return { slope, rms: Math.sqrt(sq / line.length), span: line[line.length - 1].x - line[0].x };
  });
  const rmsCut = Math.max(LEAN_RMS, median(own.map((l) => l.rms)));
  const clean = own.filter((l) => l.span >= LEAN_SPAN && l.rms <= rmsCut);
  return median((clean.length ? clean : own).map((l) => l.slope));
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

/** The bend's straight part across where its lines are, at their middle height: the least-squares
 * slope of bendAt over the box's width. Over the box, not 0..1: bendAt holds still outside it. */
function leanAt(bend: LineBend): number {
  const { x0, x1, y0, y1 } = bend.box!;
  const y = (y0 + y1) / 2;
  const n = 17;
  const xm = (x0 + x1) / 2;
  let num = 0;
  let den = 0;
  for (let k = 0; k < n; k += 1) {
    const x = x0 + ((x1 - x0) * k) / (n - 1);
    num += (x - xm) * bendAt(bend, x, y);
    den += (x - xm) ** 2;
  }
  return den > 0 ? num / den : 0;
}

/**
 * The bend to apply, its lean at the lines' middle set to `keep` (normalized, as `lean`): 0 leaves the
 * lines' lean as the corners made it, `lean` straightens it too. A fit that does not explain the lines'
 * wobble applies its lean alone. Null unless the result clearly moves something, judged as it will be
 * applied, inside the box its lines cover, so a blank margin cannot carry an extrapolated bend.
 */
export function finishBend(fitted: FittedBend | null, keep: number): LineBend | null {
  if (!fitted) return null;
  const c = fitted.explained ? [...fitted.bend.c] : new Array<number>(9).fill(0);
  // c[0] multiplies (x - 1/2) alone, so this sets the bend's own slope at the lines' middle to `keep`.
  c[0] += keep - (fitted.explained ? leanAt(fitted.bend) : 0);
  const bend: LineBend = { c, box: fitted.bend.box };
  const grid = 9;
  let maxBend = 0;
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) maxBend = Math.max(maxBend, Math.abs(bendAt(bend, gx / (grid - 1), gy / (grid - 1))));
  }
  if (maxBend < MIN_BEND || maxBend > MAX_BEND) return null;
  return bend;
}
