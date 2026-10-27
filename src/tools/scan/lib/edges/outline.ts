// Edge guess, strategy three: find the page by its outline, not its brightness. Blur, Sobel
// gradient, non-maximum suppression, a Hough transform for the long straight lines, a total-least-
// squares refit of each line, then the best four-sided shape among the lines' intersections, scored
// by how much strong, aligned edge runs along its sides. A dark band printed on the page is still
// inside the outline, which brightness alone can never see. Pure, typed arrays only.
import { isConvexQuad, orderQuad } from '../quad.ts';
import type { GrayImage, Point, Quad } from '../quad.ts';
import { blur3 } from './brightRegion.ts';
import { anglesOk } from './scoredRegions.ts';
import type { EdgeGuesser } from './types.ts';

const THETA_BINS = 360; // oriented: a line keeps the direction of its gradient, so 0..360 degrees
const RHO_STEP = 2;
const VOTE_SPREAD = 8; // each edge pixel votes for its gradient direction +- this many bins
const MAX_LINES = 20;
const VOTE_WEIGHT = 8;
const MIN_LINE_VOTES = 0.5; // of the image's short side
const DEDUP_DEG = 5;
const DEDUP_RHO = 6;
const FIT_RADIUS = 2.5;
const FIT_ALIGN = Math.cos((15 * Math.PI) / 180);
const SUPPORT_ALIGN = Math.cos((25 * Math.PI) / 180);
const MIN_SIDE_SUPPORT = 0.4;
const CONTRAST_SPAN = 5; // pixels either side of a side, to compare what is inside with what is outside
const FULL_CONTRAST = 25; // gray levels of inside-vs-outside difference that count as a real boundary
const MIN_QUAD_AREA = 0.1;
const FRAME_MARGIN = 0.02;
const OUT_MARGIN = 0.03;
const RAD = Math.PI / 180;

export interface EdgeMap {
  width: number;
  height: number;
  /** The blurred gray values the gradients came from. */
  gray: Float32Array;
  /** 1 where the pixel is a thin, strong edge. */
  edge: Uint8Array;
  /** Indices of the edge pixels, so line fitting walks thousands of pixels, not the whole image. */
  list: Int32Array;
  mag: Float32Array;
  /** Unit gradient direction per pixel (meaningful where `edge` is 1). */
  ux: Float32Array;
  uy: Float32Array;
  /** Gradient strength that counts as a strong edge (line votes weigh by it). */
  ref: number;
  /** Gradient strength at which an edge fully supports a side: far lower, a faint edge still is one. */
  supportRef: number;
}

interface Line { nx: number; ny: number; rho: number; votes: number }
export interface OutlineGuess { quad: Quad; support: number; score: number }

export function buildEdgeMap(image: GrayImage): EdgeMap {
  const { width: w, height: h } = image;
  const g = blur3(blur3(image.data, w, h), w, h);
  const n = w * h;
  const mag = new Float32Array(n);
  const ux = new Float32Array(n);
  const uy = new Float32Array(n);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
      const gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      if (m > 0) { ux[i] = gx / m; uy[i] = gy / m; }
    }
  }
  // p99 of the gradient strength sets the floor for what counts as an edge at all.
  const hist = new Uint32Array(2048);
  for (let i = 0; i < n; i += 1) hist[Math.min(2047, mag[i] | 0)] += 1;
  const pct = (p: number) => { let c = 0; for (let b = 0; b < 2048; b += 1) { c += hist[b]; if (c >= p * n) return b; } return 2047; };
  const floor = Math.max(14, 0.12 * pct(0.99));
  const edge = new Uint8Array(n);
  const strengths: number[] = [];
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const m = mag[i];
      if (m < floor) continue;
      // Compare along the gradient direction, snapped to one of four neighbour pairs.
      const ax = Math.abs(ux[i]);
      const ay = Math.abs(uy[i]);
      let d: number;
      if (ay < 0.38) d = 1;
      else if (ax < 0.38) d = w;
      else d = (ux[i] > 0) === (uy[i] > 0) ? w + 1 : w - 1;
      if (m >= mag[i - d] && m > mag[i + d]) { edge[i] = 1; strengths.push(m); }
    }
  }
  const list = new Int32Array(strengths.length);
  for (let i = 0, k = 0; i < n; i += 1) if (edge[i]) list[k++] = i;
  strengths.sort((a, b) => a - b);
  const top = strengths.length ? strengths[Math.floor(strengths.length * 0.98)] : floor;
  return { width: w, height: h, gray: g, edge, list, mag, ux, uy, ref: 0.5 * top, supportRef: Math.max(floor, 0.15 * top) };
}

/** The same physical line, whichever way it faces (a thin stripe gives two opposite edges). */
function sameLine(a: Line, b: Line): boolean {
  const dot = a.nx * b.nx + a.ny * b.ny;
  const angle = Math.acos(Math.min(1, Math.abs(dot))) / RAD;
  return angle < DEDUP_DEG && Math.abs(dot > 0 ? a.rho - b.rho : a.rho + b.rho) < DEDUP_RHO;
}

function findLines(map: EdgeMap): Line[] {
  const { width: w, height: h, list, ux, uy, mag, ref } = map;
  const diag = Math.hypot(w, h);
  const rhoBins = Math.ceil((2 * diag) / RHO_STEP) + 1;
  const acc = new Uint16Array(THETA_BINS * rhoBins);
  const cos = new Float32Array(THETA_BINS);
  const sin = new Float32Array(THETA_BINS);
  for (let t = 0; t < THETA_BINS; t += 1) { cos[t] = Math.cos(t * RAD); sin[t] = Math.sin(t * RAD); }
  for (let k = 0; k < list.length; k += 1) {
    {
      const i = list[k];
      const x = i % w;
      const y = (i - x) / w;
      // Strong edges outvote weak ones, so a page's outline beats a floor's grout lines.
      const weight = Math.max(1, Math.round(VOTE_WEIGHT * Math.min(1, mag[i] / ref) ** 2));
      const centre = Math.round(((Math.atan2(uy[i], ux[i]) / RAD) + 360) % 360);
      for (let k = -VOTE_SPREAD; k <= VOTE_SPREAD; k += 1) {
        const t = (centre + k + THETA_BINS) % THETA_BINS;
        const r = Math.round((x * cos[t] + y * sin[t] + diag) / RHO_STEP);
        acc[t * rhoBins + r] += weight;
      }
    }
  }
  // A line's pixels straddle neighbouring rho bins, so rank each cell by itself plus its two rho neighbours.
  for (let t = 0; t < THETA_BINS; t += 1) {
    const row = t * rhoBins;
    let before = acc[row];
    for (let r = 1; r < rhoBins - 1; r += 1) {
      const here = acc[row + r];
      acc[row + r] = before + here + acc[row + r + 1];
      before = here;
    }
  }
  const minVotes = Math.max(10, MIN_LINE_VOTES * Math.min(w, h) * 2);
  const cells: { t: number; r: number; v: number }[] = [];
  for (let t = 0; t < THETA_BINS; t += 1) {
    const prev = ((t + THETA_BINS - 1) % THETA_BINS) * rhoBins;
    const next = ((t + 1) % THETA_BINS) * rhoBins;
    for (let r = 1; r < rhoBins - 1; r += 1) {
      const v = acc[t * rhoBins + r];
      if (v < minVotes) continue;
      if (v >= acc[prev + r] && v > acc[next + r] && v >= acc[t * rhoBins + r - 1] && v > acc[t * rhoBins + r + 1]) cells.push({ t, r, v });
    }
  }
  cells.sort((a, b) => b.v - a.v);
  const lines: Line[] = [];
  for (const c of cells) {
    if (lines.length >= MAX_LINES) break;
    const fit = refit(map, { nx: cos[c.t], ny: sin[c.t], rho: c.r * RHO_STEP - diag, votes: c.v });
    if (fit && !lines.some((l) => sameLine(l, fit))) lines.push(fit);
  }
  return lines;
}

/** Re-fit a Hough line to the aligned edge pixels near it (total least squares), twice. */
function refit(map: EdgeMap, start: Line): Line | null {
  const { width: w, list, ux, uy } = map;
  let line = start;
  for (let pass = 0; pass < 2; pass += 1) {
    let n = 0; let sx = 0; let sy = 0;
    const xs: number[] = []; const ys: number[] = [];
    for (let k = 0; k < list.length; k += 1) {
      const i = list[k];
      const x = i % w;
      const y = (i - x) / w;
      if (Math.abs(x * line.nx + y * line.ny - line.rho) > FIT_RADIUS) continue;
      if (ux[i] * line.nx + uy[i] * line.ny < FIT_ALIGN) continue;
      xs.push(x); ys.push(y); sx += x; sy += y; n += 1;
    }
    if (n < 8) return pass === 0 ? null : line;
    const mx = sx / n; const my = sy / n;
    let sxx = 0; let syy = 0; let sxy = 0;
    for (let k = 0; k < n; k += 1) { const dx = xs[k] - mx; const dy = ys[k] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    // The line's direction is the principal axis; its normal is perpendicular, facing as before.
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let nx = -Math.sin(ang); let ny = Math.cos(ang);
    if (nx * line.nx + ny * line.ny < 0) { nx = -nx; ny = -ny; }
    line = { nx, ny, rho: mx * nx + my * ny, votes: n };
  }
  return line;
}

function intersect(a: Line, b: Line): Point | null {
  const det = a.nx * b.ny - a.ny * b.nx;
  if (Math.abs(det) < 0.2) return null; // within ~12 degrees of parallel
  return { x: (a.rho * b.ny - b.rho * a.ny) / det, y: (a.nx * b.rho - b.nx * a.rho) / det };
}

/** Fraction (0..1) of a side that has a strong edge running along it, strength-weighted. */
function sideSupport(map: EdgeMap, a: Point, b: Point, centre: Point): number {
  const { width: w, height: h, edge, mag, ux, uy, gray, supportRef: ref } = map;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1) return 0;
  const dx = (b.x - a.x) / len; const dy = (b.y - a.y) / len;
  // Gradient of a straight edge is perpendicular to it.
  let nx = -dy; let ny = dx;
  if ((centre.x - a.x) * nx + (centre.y - a.y) * ny < 0) { nx = -nx; ny = -ny; } // facing inward
  const steps = Math.max(1, Math.floor(len / 2));
  let sum = 0; let inFrame = 0; let diff = 0; let diffN = 0;
  for (let s = 0; s <= steps; s += 1) {
    const x = Math.round(a.x + ((b.x - a.x) * s) / steps);
    const y = Math.round(a.y + ((b.y - a.y) * s) / steps);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    inFrame += 1;
    const ix = Math.round(x + nx * CONTRAST_SPAN); const iy = Math.round(y + ny * CONTRAST_SPAN);
    const ox = Math.round(x - nx * CONTRAST_SPAN); const oy = Math.round(y - ny * CONTRAST_SPAN);
    if (ix >= 0 && iy >= 0 && ix < w && iy < h && ox >= 0 && oy >= 0 && ox < w && oy < h) { diff += gray[iy * w + ix] - gray[oy * w + ox]; diffN += 1; }
    let best = 0;
    for (let yy = y - 1; yy <= y + 1; yy += 1) {
      for (let xx = x - 1; xx <= x + 1; xx += 1) {
        const i = yy * w + xx;
        if (!edge[i] || Math.abs(ux[i] * nx + uy[i] * ny) < SUPPORT_ALIGN) continue;
        const v = Math.min(1, mag[i] / ref);
        if (v > best) best = v;
      }
    }
    sum += best;
  }
  if (inFrame < steps / 2 || diffN === 0) return 0;
  // A boundary has a different brightness on its two sides on average; a grout line in a floor does not.
  return (sum / inFrame) * Math.min(1, Math.abs(diff / diffN) / FULL_CONTRAST);
}

const centroid = (q: Point[]): Point => ({ x: q.reduce((s, p) => s + p.x, 0) / q.length, y: q.reduce((s, p) => s + p.y, 0) / q.length });

function polygonArea(q: Point[]): number {
  let twice = 0;
  for (let i = 0; i < q.length; i += 1) { const a = q[i]; const b = q[(i + 1) % q.length]; twice += a.x * b.y - b.x * a.y; }
  return Math.abs(twice) / 2;
}

/** Support (min and mean over the four sides) of a normalized quad, for comparing guesses. */
export function quadSupport(map: EdgeMap, quad: Quad): { min: number; mean: number } {
  const px = quad.map((p) => ({ x: p.x * map.width, y: p.y * map.height }));
  const centre = centroid(px);
  const sides = px.map((p, i) => sideSupport(map, p, px[(i + 1) % 4], centre));
  return { min: Math.min(...sides), mean: sides.reduce((s, v) => s + v, 0) / 4 };
}

/** The score `outlineFromMap` ranks quads by, so any guess can be weighed on the same scale. */
export function scoreQuad(map: EdgeMap, quad: Quad): number {
  const { min, mean } = quadSupport(map, quad);
  if (min < MIN_SIDE_SUPPORT) return 0;
  return mean ** 2 * Math.sqrt(quadAreaFraction(quad, map));
}

function quadAreaFraction(quad: Quad, map: EdgeMap): number {
  return polygonArea(quad.map((p) => ({ x: p.x * map.width, y: p.y * map.height }))) / (map.width * map.height);
}

export function outlineFromMap(map: EdgeMap): OutlineGuess | null {
  const { width: w, height: h } = map;
  if (w < 16 || h < 16) return null;
  const lines = findLines(map);
  const n = lines.length;
  if (n < 4) return null;
  const meets: (Point | null)[][] = lines.map((a) => lines.map((b) => intersect(a, b)));
  let best: OutlineGuess | null = null;
  const cache = new Map<number, number>();
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) for (let k = j + 1; k < n; k += 1) for (let l = k + 1; l < n; l += 1) {
    const set = [i, j, k, l];
    // Three ways to split four lines into two pairs of opposite sides.
    for (const [p0, p1, q0, q1] of [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]]) {
      const a0 = set[p0]; const a1 = set[p1]; const b0 = set[q0]; const b1 = set[q1];
      const c = [meets[a0][b0], meets[a0][b1], meets[a1][b1], meets[a1][b0]];
      if (c.some((p) => !p)) continue;
      const pts = c as Point[];
      if (pts.some((p) => p.x < -OUT_MARGIN * w || p.x > (1 + OUT_MARGIN) * w || p.y < -OUT_MARGIN * h || p.y > (1 + OUT_MARGIN) * h)) continue;
      const ordered = orderQuad(pts);
      const centre = centroid(ordered);
      const area = polygonArea(ordered);
      if (area < MIN_QUAD_AREA * w * h || !isConvexQuad(ordered) || !anglesOk(ordered)) continue;
      const sides: number[] = [];
      let weak = false;
      // Each side is a line cut by its two neighbours; the same side recurs in many candidate quads.
      for (let s = 0; s < 4 && !weak; s += 1) {
        const side = [[a0, b0, b1], [b1, a0, a1], [a1, b1, b0], [b0, a1, a0]][s];
        const key = side[0] * n * n + Math.min(side[1], side[2]) * n + Math.max(side[1], side[2]);
        let v = cache.get(key);
        if (v === undefined) {
          v = sideSupport(map, meets[side[0]][side[1]] as Point, meets[side[0]][side[2]] as Point, centre);
          cache.set(key, v);
        }
        if (v < MIN_SIDE_SUPPORT) weak = true;
        sides.push(v);
      }
      if (weak) continue;
      const support = sides.reduce((s, v) => s + v, 0) / 4;
      const score = support ** 2 * Math.sqrt(area / (w * h));
      if (!best || score > best.score) {
        const norm = ordered.map((pt) => ({ x: Math.min(1, Math.max(0, pt.x / w)), y: Math.min(1, Math.max(0, pt.y / h)) })) as Quad;
        const frame = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
        if (norm.every((pt, f) => Math.abs(pt.x - frame[f].x) <= FRAME_MARGIN && Math.abs(pt.y - frame[f].y) <= FRAME_MARGIN)) continue;
        best = { quad: norm, support, score };
      }
    }
  }
  return best;
}

export const guessByOutline: EdgeGuesser = (image) => outlineFromMap(buildEdgeMap(image))?.quad ?? null;
