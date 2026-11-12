import type { GrayImage, Point } from './quad.ts';

/** One text line traced along its own curve, in the image's pixels. `at(x)` is the line's centre height at x. */
interface TracedLine { left: Point; right: Point; at: (x: number) => number }

// Every pixel size below is a share of the sheet's height: the constants were tuned on photos 1536 px tall.
/** Dark marks taller than this are drawings or shadows, not letters. */
const GLYPH_MAX = 0.022;
/** Half-size of the box max that closes the gaps inside letters when estimating the paper. */
const BG_DILATE_R = 0.002;
/** Half-size of the box mean that smooths the paper estimate. */
const BG_SMOOTH_R = 0.01;
/** Ink is a pixel darker than this share of the paper around it. */
const INK_RATIO = 0.72;
/** Smallest ink speck kept, in pixels (a count, not a length). */
const MIN_SPECK = 3;
/** Words on a line are joined across gaps up to this wide. */
const CLOSE_WIDTH = 0.0124;
/** A line is at least this tall... */
const LINE_MIN_H = 0.0039;
/** ...and its ink in a column is between these two thicknesses (two lines run together above, a drawing too). */
const THICK_MIN = 0.0033;
const THICK_MAX = 0.017;
/** A sample further than this from the first fit is left out of the second. */
const RESIDUAL = 0.004;
/** Columns are sampled this far apart. */
const COLUMN_STEP = 0.002;
/** Lines this close above or below one another are neighbours for the stroke-of-a-drawing check. */
const NEIGHBOUR = 0.104;
/** Pieces of one line are joined when one ends within this of the other's start, or overlaps it by up to... */
const JOIN_OVERLAP = 0.01;
const JOIN_GAP = 0.052;
/** Two lines must overlap by at least this many pixels to count as duplicates. */
const DUP_OVERLAP = 0.013;
/** Row pitch assumed when too few full-width lines exist to measure it. */
const PITCH_FALLBACK = 0.02;
/** Full-width lines span this share of the sheet's width. */
const FULL = 0.5;

/** A line's polynomial runs in u = x / width, constant term first, always four coefficients. */
interface Piece { p: number[]; x0: number; x1: number; xs: number[]; ys: number[] }

interface Labels { n: number; label: Int32Array; x0: Int32Array; y0: Int32Array; x1: Int32Array; y1: Int32Array; area: Int32Array }

/** Max then mean over square windows with the given half-size, edges clamped. */
function paperEstimate(gray: GrayImage, rMax: number, rMean: number): Float32Array {
  const { width: w, height: h, data } = gray;
  const slide = (src: ArrayLike<number>, r: number, max: boolean): Float32Array => {
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    const pass = (from: ArrayLike<number>, to: Float32Array, len: number, lines: number, stride: number, step: number) => {
      const sum = new Float64Array(len + 1);
      for (let l = 0; l < lines; l += 1) {
        const base = l * stride;
        if (!max) for (let i = 0; i < len; i += 1) sum[i + 1] = sum[i] + from[base + i * step];
        for (let i = 0; i < len; i += 1) {
          const a = Math.max(0, i - r);
          const b = Math.min(len - 1, i + r);
          if (max) {
            let m = 0;
            for (let k = a; k <= b; k += 1) m = Math.max(m, from[base + k * step]);
            to[base + i * step] = m;
          } else to[base + i * step] = (sum[b + 1] - sum[a]) / (b - a + 1);
        }
      }
    };
    pass(src, tmp, w, h, w, 1);
    pass(tmp, out, h, w, 1, w);
    return out;
  };
  return slide(slide(data, rMax, true), rMean, false);
}

/** 8-connected components of a 0/1 mask, with each one's bounding box and area. */
function components(mask: Uint8Array, w: number, h: number): Labels {
  const prov = new Int32Array(w * h);
  const parent: number[] = [0];
  const find = (a: number): number => {
    while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
    return a;
  };
  const join = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (!mask[i]) continue;
      let l = 0;
      for (const [dx, dy] of [[-1, 0], [-1, -1], [0, -1], [1, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0) continue;
        const n = prov[ny * w + nx];
        if (!n) continue;
        if (!l) l = n; else join(l, n);
      }
      if (!l) { l = parent.length; parent.push(l); }
      prov[i] = l;
    }
  }
  const ids = new Int32Array(parent.length);
  let n = 1;
  for (let k = 1; k < parent.length; k += 1) if (find(k) === k) ids[k] = n++;
  const label = new Int32Array(w * h);
  const x0 = new Int32Array(n).fill(w);
  const y0 = new Int32Array(n).fill(h);
  const x1 = new Int32Array(n).fill(-1);
  const y1 = new Int32Array(n).fill(-1);
  const area = new Int32Array(n);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = prov[y * w + x];
      if (!p) continue;
      const c = ids[find(p)];
      label[y * w + x] = c;
      if (x < x0[c]) x0[c] = x;
      if (x > x1[c]) x1[c] = x;
      if (y < y0[c]) y0[c] = y;
      if (y > y1[c]) y1[c] = y;
      area[c] += 1;
    }
  }
  return { n, label, x0, y0, x1, y1, area };
}

/** Dark marks the size of letters: ink against the paper around it, minus drawings and specks. */
function inkOf(gray: GrayImage): Uint8Array {
  const { width: w, height: h, data } = gray;
  const bg = paperEstimate(gray, Math.max(1, Math.round(BG_DILATE_R * h)), Math.max(1, Math.round(BG_SMOOTH_R * h)));
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i += 1) ink[i] = data[i] / Math.max(bg[i], 1) < INK_RATIO ? 1 : 0;
  const c = components(ink, w, h);
  const limit = GLYPH_MAX * h;
  const keep = new Uint8Array(c.n);
  for (let k = 1; k < c.n; k += 1) keep[k] = c.y1[k] - c.y0[k] + 1 < limit && c.area[k] >= MIN_SPECK ? 1 : 0;
  for (let i = 0; i < ink.length; i += 1) ink[i] = keep[c.label[i]];
  return ink;
}

/** Fills the background gaps shorter than `k` along each row: a horizontal close with a 1 x k bar. */
function closeRows(ink: Uint8Array, w: number, h: number, k: number): Uint8Array {
  const out = ink.slice();
  for (let y = 0; y < h; y += 1) {
    let last = -1;
    for (let x = 0; x < w; x += 1) {
      if (!ink[y * w + x]) continue;
      if (last >= 0 && x - last - 1 < k) out.fill(1, y * w + last, y * w + x);
      last = x;
    }
  }
  return out;
}

/** Least squares through the points by the normal equations; the degree drops if the system is singular. */
function polyfit(us: number[], ys: number[], degree: number): number[] {
  for (let d = degree; d >= 0; d -= 1) {
    const n = d + 1;
    const m: number[][] = Array.from({ length: n }, () => new Array(n + 1).fill(0));
    for (let s = 0; s < us.length; s += 1) {
      const pw = [1];
      for (let k = 1; k < 2 * n; k += 1) pw.push(pw[k - 1] * us[s]);
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) m[r][c] += pw[r + c];
        m[r][n] += pw[r] * ys[s];
      }
    }
    const sol = solve(m, n);
    if (sol) return [...sol, 0, 0, 0, 0].slice(0, 4);
  }
  return [0, 0, 0, 0];
}

/** Gaussian elimination with partial pivoting on an n x (n+1) augmented matrix; null when singular. */
function solve(m: number[][], n: number): number[] | null {
  for (let c = 0; c < n; c += 1) {
    let best = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(m[r][c]) > Math.abs(m[best][c])) best = r;
    if (Math.abs(m[best][c]) < 1e-12) return null;
    [m[c], m[best]] = [m[best], m[c]];
    for (let r = c + 1; r < n; r += 1) {
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k += 1) m[r][k] -= f * m[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = m[r][n];
    for (let k = r + 1; k < n; k += 1) s -= m[r][k] * x[k];
    x[r] = s / m[r][r];
  }
  return x;
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const range = (v: number[]): number => Math.max(...v) - Math.min(...v);

const poly = (p: number[], u: number): number => p[0] + u * (p[1] + u * (p[2] + u * p[3]));

/** A line's slope dy/dx at u, given the polynomial runs in u = x / width. */
const slope = (p: number[], u: number, w: number): number => (p[1] + u * (2 * p[2] + u * 3 * p[3])) / w;

/** One polynomial through all the samples; a longer line may bend more. */
function fitPiece(xs: number[], ys: number[], w: number, h: number): number[] {
  const span = range(xs);
  const degree = span > 0.195 * h ? 3 : span > 0.117 * h ? 2 : 1;
  return polyfit(xs.map((x) => x / w), ys, degree);
}

/** Each text line as a polynomial y(x) over its x range, from the glyph-sized ink. */
function textLines(ink: Uint8Array, w: number, h: number): Piece[] {
  const closeK = Math.max(3, 2 * Math.round(CLOSE_WIDTH * h / 2) + 1);
  const closed = closeRows(ink, w, h, closeK);
  const c = components(closed, w, h);
  const step = Math.max(1, Math.round(COLUMN_STEP * h));
  const pieces: Piece[] = [];
  for (let i = 1; i < c.n; i += 1) {
    const x = c.x0[i];
    const y = c.y0[i];
    const cw = c.x1[i] - x + 1;
    const ch = c.y1[i] - y + 1;
    if (cw < 0.1 * w || ch < LINE_MIN_H * h || ch > 0.25 * w) continue;
    const xs: number[] = [];
    const ys: number[] = [];
    const th: number[] = [];
    for (let cx = 0; cx < cw; cx += step) {
      const rows: number[] = [];
      for (let r = 0; r < ch; r += 1) {
        const at = (y + r) * w + x + cx;
        if (c.label[at] === i && ink[at]) rows.push(r);
      }
      if (!rows.length) continue;
      xs.push(x + cx);
      ys.push(y + median(rows));
      th.push(rows[rows.length - 1] - rows[0]);
    }
    if (xs.length < 8) continue;
    const thick = median(th);
    if (thick > THICK_MAX * h || thick < THICK_MIN * h) continue;
    const degree = cw > FULL * w ? 3 : cw > 0.3 * w ? 2 : 1;
    const us = xs.map((v) => v / w);
    let p = polyfit(us, ys, degree);
    const ok = xs.map((_, k) => Math.abs(poly(p, us[k]) - ys[k]) < RESIDUAL * h);
    const good = ok.filter(Boolean).length;
    if (good >= 6) p = polyfit(us.filter((_, k) => ok[k]), ys.filter((_, k) => ok[k]), degree);
    if (good / ok.length < 0.6) continue; // not one line of text: a drawing, a shadow
    pieces.push({ p, x0: x, x1: x + cw, xs, ys });
  }
  return pieces;
}

/** Drops pieces whose slope disagrees with their neighbours: a stroke of a drawing can pass for a line. */
function alongNeighbours(pieces: Piece[], w: number, h: number): Piece[] {
  const mid = (L: Piece) => poly(L.p, (L.x0 + L.x1) / 2 / w);
  const mids = pieces.map(mid);
  return pieces.filter((L, i) => {
    const xc = (L.x0 + L.x1) / 2;
    const own = slope(L.p, xc / w, w);
    const near: number[] = [];
    pieces.forEach((K, j) => {
      if (j !== i && Math.abs(mids[j] - mids[i]) < NEIGHBOUR * h && K.x0 <= xc && xc <= K.x1) near.push(slope(K.p, xc / w, w));
    });
    return near.length < 2 || Math.abs(own - median(near)) < 0.06;
  });
}

/** Joins the pieces of one curved line, drops duplicates, and drops short labels sitting in blank space. */
function tidy(input: Piece[], w: number, h: number): Piece[] {
  const lines = [...input];
  const at = (L: Piece, x: number) => poly(L.p, x / w);
  const midOf = (L: Piece) => at(L, (L.x0 + L.x1) / 2);
  const full = lines.filter((L) => L.x1 - L.x0 > FULL * w);
  const mids = full.map(midOf).sort((a, b) => a - b);
  const gaps = mids.slice(1).map((m, i) => m - mids[i]);
  const pitch = mids.length > 3 ? median(gaps) : PITCH_FALLBACK * h;
  for (let merged = true; merged;) {
    merged = false;
    for (let a = 0; a < lines.length && !merged; a += 1) {
      for (let b = 0; b < lines.length; b += 1) {
        const A = lines[a];
        const B = lines[b];
        if (a === b || A.x1 > B.x0 + JOIN_OVERLAP * h || B.x0 - A.x1 > JOIN_GAP * h) continue;
        const gap = (A.x1 + B.x0) / 2;
        if (Math.abs(at(A, gap) - at(B, gap)) >= 0.3 * pitch) continue;
        const xs = [...A.xs, ...B.xs];
        const ys = [...A.ys, ...B.ys];
        lines[a] = { p: fitPiece(xs, ys, w, h), x0: A.x0, x1: Math.max(A.x1, B.x1), xs, ys };
        lines.splice(b, 1);
        merged = true;
        break;
      }
    }
  }
  const drop = new Set<Piece>();
  lines.forEach((A, a) => lines.forEach((B, b) => {
    const lo = Math.max(A.x0, B.x0);
    const hi = Math.min(A.x1, B.x1);
    if (a < b && hi - lo > DUP_OVERLAP * h && Math.abs(at(A, (lo + hi) / 2) - at(B, (lo + hi) / 2)) < 0.6 * pitch) {
      drop.add(A.x1 - A.x0 < B.x1 - B.x0 ? A : B);
    }
  }));
  const kept = lines.filter((L) => !drop.has(L));
  if (!kept.length) return [];
  const top = Math.min(...kept.map(midOf));
  return kept
    .filter((L) => {
      const short = L.x1 - L.x0 < 0.2 * w;
      const near = kept.some((K) => K !== L && Math.abs(midOf(K) - midOf(L)) < 2 * pitch && K.x1 - K.x0 > 0.3 * w);
      return !(short && !near && midOf(L) - top > 1.5 * pitch);
    })
    .sort((a, b) => midOf(a) - midOf(b));
}

/** The text lines of a photographed page, top to bottom. `gray` is a sheet with everything that is not paper already painted as paper. */
export function traceLines(gray: GrayImage): TracedLine[] {
  const { width: w, height: h } = gray;
  const pieces = textLines(inkOf(gray), w, h);
  if (!pieces.length) return [];
  const lines = tidy(alongNeighbours(pieces, w, h), w, h);
  return lines.map((L) => {
    const at = (x: number) => poly(L.p, x / w);
    return { left: { x: L.x0, y: at(L.x0) }, right: { x: L.x1, y: at(L.x1) }, at };
  });
}
