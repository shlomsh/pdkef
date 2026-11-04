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
/** Ridge added to every node, so a grid with no data anywhere near still solves. */
const RIDGE = 1e-9;
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

/** Grid nodes along a line and across the lines. A cell is a sixteenth of the page: a curl spans many,
 * and a crease turns within about one. */
const ALONG = 16;
const ACROSS = 16;
/** How strongly the grid resists bending (its second differences), against how closely it follows the
 * lines (their mean squared residual). Low enough that a crease's turn is followed, high enough that a
 * line's ragged ends are not. */
const STIFFNESS = 2e-4;
/** Holds each row of nodes to a zero mean: a bend that only shifts whole lines up or down is the lines'
 * own heights, which the per-line offsets carry. */
const GAUGE = 1;

/**
 * Cholesky on a symmetric positive definite n x n system held row-major in `a`, every entry of which
 * further than `band` from the diagonal is zero; in place, null when it is not one. The factor stays
 * inside the band, so the work is n band^2 rather than n^3 / 6 (SCAN-21); `band` n - 1 is the plain
 * dense solve.
 */
function solveSpd(a: Float64Array, b: Float64Array, n: number, band = n - 1): Float64Array | null {
  for (let j = 0; j < n; j += 1) {
    const rj = j * n;
    let diag = a[rj + j];
    for (let k = Math.max(0, j - band); k < j; k += 1) diag -= a[rj + k] ** 2;
    if (!(diag > 1e-18)) return null;
    const l = Math.sqrt(diag);
    a[rj + j] = l;
    for (let i = j + 1, last = Math.min(n - 1, j + band); i <= last; i += 1) {
      const ri = i * n;
      let v = a[ri + j];
      for (let k = Math.max(0, i - band); k < j; k += 1) v -= a[ri + k] * a[rj + k];
      a[ri + j] = v / l;
    }
  }
  const x = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let v = b[i];
    for (let k = Math.max(0, i - band); k < i; k += 1) v -= a[i * n + k] * x[k];
    x[i] = v / a[i * n + i];
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    let v = x[i];
    for (let k = i + 1, last = Math.min(n - 1, i + band); k <= last; k += 1) v -= a[k * n + i] * x[k];
    x[i] = v / a[i * n + i];
  }
  return x;
}

/** How far below the diagonal the lower triangle of a row-major n x n matrix reaches. */
function bandOf(a: Float64Array, n: number): number {
  let band = 0;
  for (let i = 1; i < n; i += 1) {
    for (let k = 0; k < i - band; k += 1) {
      if (a[i * n + k] !== 0) { band = i - k; break; }
    }
  }
  return band;
}

/** The grid and one height per line, as fitted. */
interface Fit { bend: LineBend; offsets: number[] }

/**
 * @testSeam The grid and one height per line that best explain every sample (y observed at x), by least
 * squares with the grid's bending energy as the penalty: each sample reads the grid bilinearly, so it
 * touches four nodes and its line's offset.
 *
 * The normal equations are [G B; B' D], grid nodes first, then the line offsets. An offset couples only
 * to the nodes its own line's samples touch and to no other offset (D is diagonal), so the offsets are
 * eliminated first, leaving S = G - B D^-1 B' (the Schur complement) on the grid alone. With the nodes
 * row-major every coupling in S stays within a few rows of the diagonal (the stencils and the gauge reach
 * two rows, a line the rows it crosses), so S is factored as a band, and each offset follows from the
 * grid (SCAN-21). The same solution as one dense solve of the whole system, to rounding.
 */
export function fit(lines: Sample[][]): Fit | null {
  const nodes = ALONG * ACROSS;
  const count = lines.length;
  const s = new Float64Array(nodes * nodes);
  const rhs = new Float64Array(nodes);
  // Per line: its offset's diagonal and right-hand side, and its column of B (nonzero where `near`).
  const diag = new Float64Array(count);
  const own = new Float64Array(count);
  const columns = lines.map(() => new Float64Array(nodes));
  const near = lines.map(() => new Uint8Array(nodes));
  const total = lines.reduce((t, l) => t + l.length, 0);
  const wData = 1 / total;
  const idx = [0, 0, 0, 0];
  const w = [0, 0, 0, 0];
  lines.forEach((samples, line) => {
    const column = columns[line];
    const touched = near[line];
    for (const p of samples) {
      const gx = Math.min(1, Math.max(0, p.x)) * (ALONG - 1);
      const gy = Math.min(1, Math.max(0, p.y)) * (ACROSS - 1);
      const i = Math.min(ALONG - 2, Math.floor(gx));
      const j = Math.min(ACROSS - 2, Math.floor(gy));
      const tx = gx - i;
      const ty = gy - j;
      const k = j * ALONG + i;
      idx[0] = k; idx[1] = k + 1; idx[2] = k + ALONG; idx[3] = k + ALONG + 1;
      w[0] = (1 - tx) * (1 - ty); w[1] = tx * (1 - ty); w[2] = (1 - tx) * ty; w[3] = tx * ty;
      for (let r = 0; r < 4; r += 1) {
        for (let c = 0; c < 4; c += 1) s[idx[r] * nodes + idx[c]] += wData * w[r] * w[c];
        rhs[idx[r]] += wData * w[r] * p.y;
        column[idx[r]] += wData * w[r];
        touched[idx[r]] = 1;
      }
      diag[line] += wData;
      own[line] += wData * p.y;
    }
  });
  // Bending energy: every run of three nodes along either direction, (d0 - 2 d1 + d2)^2.
  const stencil = (k0: number, k1: number, k2: number) => {
    const ks = [k0, k1, k2];
    const cs = [1, -2, 1];
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) s[ks[r] * nodes + ks[c]] += STIFFNESS * cs[r] * cs[c];
  };
  for (let j = 0; j < ACROSS; j += 1) for (let i = 1; i < ALONG - 1; i += 1) stencil(j * ALONG + i - 1, j * ALONG + i, j * ALONG + i + 1);
  for (let i = 0; i < ALONG; i += 1) for (let j = 1; j < ACROSS - 1; j += 1) stencil((j - 1) * ALONG + i, j * ALONG + i, (j + 1) * ALONG + i);
  for (let j = 0; j < ACROSS; j += 1) {
    for (let r = 0; r < ALONG; r += 1) for (let c = 0; c < ALONG; c += 1) s[(j * ALONG + r) * nodes + j * ALONG + c] += GAUGE;
  }
  for (let k = 0; k < nodes; k += 1) s[k * nodes + k] += RIDGE;
  // Each line's offset eliminated: b b' / d off the nodes it touches, and b own / d off their right-hand side.
  const touchedBy = near.map((touched) => {
    const ks: number[] = [];
    touched.forEach((t, k) => { if (t) ks.push(k); });
    return ks;
  });
  touchedBy.forEach((ks, line) => {
    const column = columns[line];
    for (const r of ks) {
      const scaled = column[r] / diag[line];
      rhs[r] -= scaled * own[line];
      for (const c of ks) s[r * nodes + c] -= scaled * column[c];
    }
  });
  const d = solveSpd(s, rhs, nodes, bandOf(s, nodes));
  if (!d) return null;
  const offsets = touchedBy.map((ks, line) => {
    let v = own[line];
    for (const k of ks) v -= columns[line][k] * d[k];
    return v / diag[line];
  });
  return { bend: { nx: ALONG, ny: ACROSS, d: Array.from(d) }, offsets };
}

function lineRms(samples: Sample[], offset: number, bend: LineBend): number {
  let s = 0;
  for (const p of samples) { const r = p.y - offset - bendAt(bend, p.x, p.y); s += r * r; }
  return Math.sqrt(s / samples.length);
}

/** @testSeam The rows alone, their shared lean left to the corners: what the tests measure a page by. */
export function findLineBend(gray: GrayImage): LineBend | null {
  return finishBend(lineFit(pageMasks(gray)), false);
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
 * clean, wide lines share (the median of their own), or null when no line is both: it gates squaring
 * and stands in for a fit that does not explain its lines, nothing else. `explained`: the fit follows
 * the lines' own wobble well enough to be applied as a bend. */
export interface FittedBend { bend: LineBend; lean: number | null; explained: boolean }

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

  // Wobble is how far the lines stray from their own straight lines: a tilt is no bend, and on a page
  // the corners left a little turned, counting it would let the grid's fit to pixel noise pass as one.
  let resid = 0;
  let wobble = 0;
  let count = 0;
  lines.forEach((s, k) => {
    const straight = ownLine(s);
    for (const p of s) {
      const r = p.y - result!.offsets[k] - bendAt(result!.bend, p.x, p.y);
      resid += r * r;
      wobble += (p.y - straight.at(p.x)) ** 2;
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
  const bend: LineBend = { ...result.bend, box: { x0, x1, y0, y1 } };
  return { bend, lean: medianSlope(lines), explained };
}

/** The lines' shared lean: the median of each line's own least-squares slope, taken over the lines
 * that are straight on their own and run across a good part of the page. A polynomial's slope at one
 * point swings with noise at the ends of ragged lines; and a form's cell, where a label, a handwritten
 * value and the cell's rule join into one shape, slopes wherever the handwriting goes. */
function medianSlope(lines: Sample[][]): number | null {
  const own = lines.map(ownLine);
  const rmsCut = Math.max(LEAN_RMS, median(own.map((l) => l.rms)));
  const clean = own.filter((l) => l.span >= LEAN_SPAN && l.rms <= rmsCut);
  return clean.length ? median(clean.map((l) => l.slope)) : null;
}

/** A line's own least-squares straight line: its slope, how far it strays from it, how far it runs. */
function ownLine(line: Sample[]): { slope: number; rms: number; span: number; at: (x: number) => number } {
  const mx = line.reduce((t, p) => t + p.x, 0) / line.length;
  const my = line.reduce((t, p) => t + p.y, 0) / line.length;
  let num = 0;
  let den = 0;
  for (const p of line) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  const slope = den > 0 ? num / den : 0;
  let sq = 0;
  for (const p of line) sq += (p.y - my - slope * (p.x - mx)) ** 2;
  return { slope, rms: Math.sqrt(sq / line.length), span: line[line.length - 1].x - line[0].x, at: (x) => my + slope * (x - mx) };
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

/** The bend's own shared tilt: its least-squares slope across the box, averaged over the box's height.
 * Bilinear reading reproduces a plane exactly, so taking `slope * (x - mid)` off every node removes
 * exactly this much tilt and nothing else. */
function fieldLean(bend: LineBend): number {
  const { x0, x1, y0, y1 } = bend.box!;
  const xm = (x0 + x1) / 2;
  let num = 0;
  let den = 0;
  for (let r = 0; r < 9; r += 1) {
    const y = y0 + ((y1 - y0) * r) / 8;
    for (let k = 0; k < 17; k += 1) {
      const x = x0 + ((x1 - x0) * k) / 16;
      num += (x - xm) * bendAt(bend, x, y);
      den += (x - xm) ** 2;
    }
  }
  return den > 0 ? num / den : 0;
}

/** The bend's mean over the box its lines cover. */
function boxMean(bend: LineBend): number {
  const { x0, x1, y0, y1 } = bend.box!;
  let sum = 0;
  for (let r = 0; r < 9; r += 1) for (let k = 0; k < 17; k += 1) sum += bendAt(bend, x0 + ((x1 - x0) * k) / 16, y0 + ((y1 - y0) * r) / 8);
  return sum / (9 * 17);
}

/**
 * The bend to apply. `square`: straighten the lines' shared tilt too (the fit's own, as fitted);
 * otherwise that tilt is taken out and stays as the corners made it. A fit that does not explain its
 * lines' wobble applies a tilt alone, from the clean lines, and only when squaring. Null unless the
 * result clearly moves something, judged as it will be applied, inside the box its lines cover.
 */
export function finishBend(fitted: FittedBend | null, square: boolean): LineBend | null {
  if (!fitted) return null;
  const { nx, ny, box } = fitted.bend;
  const xm = (box!.x0 + box!.x1) / 2;
  const plane = (slope: number) => Array.from({ length: nx * ny }, (_, k) => slope * ((k % nx) / (nx - 1) - xm));
  let d: number[];
  if (fitted.explained) {
    const tilt = square ? 0 : fieldLean(fitted.bend);
    const off = plane(tilt);
    d = fitted.bend.d.map((v, k) => v - off[k]);
  } else {
    if (!square || fitted.lean === null) return null;
    d = plane(fitted.lean);
  }
  // Nor any shift of the whole box: the lines' own heights carry that, and the grid's gauge holds its
  // mean over the full page, not over where the lines are.
  const mean = boxMean({ nx, ny, d, box });
  const bend: LineBend = { nx, ny, d: d.map((v) => v - mean), box };
  const grid = 17;
  let maxBend = 0;
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) maxBend = Math.max(maxBend, Math.abs(bendAt(bend, gx / (grid - 1), gy / (grid - 1))));
  }
  if (maxBend < MIN_BEND || maxBend > MAX_BEND) return null;
  return bend;
}
