// Edge following. Rough page corners (a brightness guess, a fold cut) land a little off the paper; each side
// is followed along its length as a path through a band of candidate offsets, scoring a bright-to-dark step
// outward, then the corners are where neighbouring followed sides meet. Three passes with a shrinking reach.
// A paper edge has blank margin just inside it and text does not, so a line of text is not mistaken for the
// page edge. Two reaches are tried: a near one that is precise, and a far one for a first guess that starts far
// from the paper (it takes the first consistent edge outward from the text and ignores an edge that does not run
// along most of the side). The one whose two weakest sides have the most edge under them is kept; measured on 22
// book pages: 14 within 3.5% and 19 within 8% of hand-traced corners, against 12 and 14 for the near reach alone (SCAN-75).
// Pure: no DOM, no globals, the input is not modified.
import type { GrayImage, Point, Quad } from '#lib/pageEnhance/quad.ts';
import { PIN_PULL } from './pinPull.ts';

interface Followed {
  /** The corners on the paper, 0 to 1 of the picture, top left, top right, bottom right, bottom left; never outside the picture. */
  quad: Quad;
  /** The edge each side followed on the last pass (top, right, bottom, left), 0 to 1 of the picture. */
  sides: [Point[], Point[], Point[], Point[]];
}

// Pixel constants below were tuned at a long edge of 1536 and are scaled by the picture's size.
const TUNED_EDGE = 1536;
const REACH = 120; // px across a side the near candidate's first pass may look; halves each pass
const FAR_REACH = 260; // px across a side the far candidate's first pass may look
const MIN_REACH = 12; // px: the narrowest reach a later pass keeps
const PASSES = 3;
const POINTS = 24; // points followed per side
const SMOOTH = 1.2; // gray levels charged per px the followed edge moves between neighbouring points
const STAY = 0.02; // gray levels per px (at the tuned size) of leaving the starting side, so no evidence means no move
const ACROSS = 3; // px either side of the edge the step is read at
const RIDGE_ACROSS = 4; // px either side of a thin dark line (a page lying on other pages) it is read at
const ALONG = [-6, 0, 6]; // px along the side the step and ridge are averaged over
const BLANK = 64; // px of ink-free margin a paper edge must have just inside it
const BLANK_STEP = 8; // px between the rows the margin is sampled at
const BLANK_ALONG = [-10, 0, 10]; // px along the side the margin is sampled at
const INK_LO = 4; // detail level (gray levels) at or below which the margin counts as blank
const INK_HI = 10; // detail level at or above which the margin counts as ink
const FIRST_BLUR = 2; // px radius of the two box blurs that smooth the picture the step is read from
const FAR_BLUR = 6; // px radius of the neighbourhood average the fine detail is measured against
const DETAIL_BLUR = 4; // px radius that smooths the fine detail into an ink map
const INNER_GAP = 14; // px an inner edge must lie inside the outer one it is preferred to
const INNER_TRIES = 4; // most inner edges looked for past the outermost one
const COVER = 0.6; // share of a side's points that must show an edge, else the far candidate leaves the side alone
const COVER_MIN = 5; // gray levels of edge at a point for it to count as showing an edge
const INNER_SHARE = 0.35; // an inner edge wins if its mean strength is at least this share of the outer one's
const SCORE_REACH = 10; // px across a side the finished quad is re-followed, to see how much edge lies under it
const OFF_PATH = -1e6; // gain given to offsets a path may not use (inside the lower bound)
const MIN_SPAN = 4; // fewest followed points at a side's end that a corner is fitted from
const ENDS = 0.06; // fraction of a side's length left off each end where its points start
const SPAN = 0.88; // fraction of a side's length the followed points cover
const PARALLEL = 1e-6; // sines of the angle between two sides below which they do not meet

type Pt = [number, number];
interface Gray { w: number; h: number; d: Float32Array }
interface Line { p: Pt; d: Pt }
interface Side { pts: Pt[]; str: number[] }
interface Path extends Side { idx: number[]; cover: number; mean: number }
interface Options { inner: boolean; cover: number } // prefer the first consistent edge outward; least share of the side that must show an edge
interface Candidate { quad: Pt[]; sides: Side[] }
const NEAR: Options = { inner: false, cover: 0 };
const FAR: Options = { inner: true, cover: COVER };
interface Scale { s: number; px: (v: number) => number; offset: (v: number) => number }

const scaleFor = (image: GrayImage): Scale => {
  const s = Math.max(image.width, image.height) / TUNED_EDGE;
  return { s, px: (v) => Math.max(1, Math.round(v * s)), offset: (v) => Math.round(v * s) };
};

/** Box blur of radius r, edges clamped. */
function boxBlur({ w, h, d }: Gray, r: number): Gray {
  const tmp = new Float32Array(d.length);
  const out = new Float32Array(d.length);
  for (let y = 0; y < h; y += 1) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x += 1) acc += d[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x += 1) {
      tmp[row + x] = acc / (2 * r + 1);
      acc += d[row + Math.min(w - 1, x + r + 1)] - d[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x += 1) {
    let acc = 0;
    for (let y = -r; y <= r; y += 1) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y += 1) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return { w, h, d: out };
}

/** The picture smoothed by two box blurs, the gray both the follower and the trace read their steps from. */
function smoothGray(image: GrayImage, sc: Scale): { img: Gray; gray: Gray } {
  const { width: w, height: h } = image;
  const img: Gray = { w, h, d: Float32Array.from(image.data) };
  const r1 = sc.px(FIRST_BLUR);
  return { img, gray: boxBlur(boxBlur(img, r1), r1) };
}

/** The two maps the follower reads: the smoothed picture, and how much fine detail (text) lies around each pixel. */
function buildMaps(image: GrayImage, sc: Scale): { gray: Gray; ink: Gray } {
  const { width: w, height: h } = image;
  const { img, gray } = smoothGray(image, sc);
  const far = boxBlur(img, sc.px(FAR_BLUR));
  const dev: Gray = { w, h, d: img.d.map((v, i) => Math.abs(v - far.d[i])) };
  return { gray, ink: boxBlur(dev, sc.px(DETAIL_BLUR)) };
}

/** The edge strength at (x, y) for a side running along t with inward normal n: the bright-to-dark step or thin dark
 * line there, counted only where the margin just inside is blank. */
function edgeGain(gray: Gray, ink: Gray, t: Pt, n: Pt, sc: Scale): (x: number, y: number) => number {
  const { w, h, d } = gray;
  const clampX = (x: number): number => Math.min(w - 1, Math.max(0, Math.round(x)));
  const clampY = (y: number): number => Math.min(h - 1, Math.max(0, Math.round(y)));
  const inkAt = (x: number, y: number): number => ink.d[clampY(y) * w + clampX(x)];
  const at = (x: number, y: number): number => d[clampY(y) * w + clampX(x)];
  const across = sc.px(ACROSS);
  const ridgeAcross = sc.px(RIDGE_ACROSS);
  const along = ALONG.map(sc.offset);
  const blank = sc.px(BLANK);
  const blankStep = sc.px(BLANK_STEP);
  const blankAlong = BLANK_ALONG.map(sc.offset);
  return (x: number, y: number): number => {
    let s = 0;
    for (const u of along) {
      const px = x + t[0] * u; const py = y + t[1] * u;
      s += at(px + across * n[0], py + across * n[1]) - at(px - across * n[0], py - across * n[1]);
    }
    s /= along.length;
    let g = Math.max(0, s); // only edges with the page side brighter than the far side
    let r = 0;
    for (const u of along) {
      const px = x + t[0] * u; const py = y + t[1] * u;
      r += Math.min(at(px + ridgeAcross * n[0], py + ridgeAcross * n[1]), at(px - ridgeAcross * n[0], py - ridgeAcross * n[1])) - at(px, py);
    }
    g = Math.max(g, r / along.length);
    if (g > 0) {
      let m = 0; let c = 0;
      for (let v = blankStep; v <= blank; v += blankStep) {
        for (const u of blankAlong) { m += inkAt(x + t[0] * u + n[0] * v, y + t[1] * u + n[1] * v); c += 1; }
      }
      g *= Math.min(1, Math.max(0, 1 - (m / c - INK_LO) / (INK_HI - INK_LO)));
    }
    return g;
  };
}

/** For every offset o, min over p of cost[p] + SMOOTH*|o-p| and the p that gives it: two sweeps (distance transform). */
function minPlus(cost: Float64Array): { m: Float64Array; arg: Int32Array } {
  const O = cost.length;
  const m = Float64Array.from(cost);
  const arg = Int32Array.from({ length: O }, (_, i) => i);
  for (let o = 1; o < O; o += 1) if (m[o - 1] + SMOOTH < m[o]) { m[o] = m[o - 1] + SMOOTH; arg[o] = arg[o - 1]; }
  for (let o = O - 2; o >= 0; o -= 1) if (m[o + 1] + SMOOTH < m[o]) { m[o] = m[o + 1] + SMOOTH; arg[o] = arg[o + 1]; }
  return { m, arg };
}

/** Starting from the best path, look up to INNER_TRIES times for one lying at least `gap` offsets further into the page
 * (`best` takes the per-point lower bound), and take it while it shows an edge on COVER of its points and its mean
 * strength is at least INNER_SHARE of the current one's; stop at the first that does not. */
function preferInner<P extends { idx: number[]; cover: number; mean: number }>(first: P, O: number, gap: number, best: (lo: number[]) => P): P {
  let path = first;
  for (let i = 0; i < INNER_TRIES; i += 1) {
    const lo = path.idx.map((v) => v + gap);
    if (lo.some((v) => v >= O)) break;
    const inn = best(lo);
    if (inn.cover >= COVER && inn.mean >= Math.max(COVER_MIN, INNER_SHARE * path.mean)) path = inn; else break;
  }
  return path;
}

/** Follow one side from a to b (pixels, clockwise so the normal points into the page) through a band of
 * `reach` px either way: the path of offsets with the most edge, smooth from point to point. With `inner` on,
 * an edge further into the page is preferred when it is as consistent; a side with less than `cover` of
 * its points on an edge is left where it started. */
function followSide(gray: Gray, ink: Gray, a: Pt, b: Pt, reach: number, sc: Scale, opt: Options): Side {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const t: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const n: Pt = [-t[1], t[0]];
  const O = 2 * reach + 1;
  const stay = STAY / sc.s;
  const base = (k: number): Pt => {
    const f = ENDS + SPAN * (k / (POINTS - 1));
    return [a[0] + t[0] * len * f, a[1] + t[1] * len * f];
  };
  const gainAt = edgeGain(gray, ink, t, n, sc);
  const gains: Float64Array[] = [];
  for (let k = 0; k < POINTS; k += 1) {
    const [bx, by] = base(k);
    const g = new Float64Array(O);
    for (let o = 0; o < O; o += 1) g[o] = gainAt(bx + n[0] * (o - reach), by + n[1] * (o - reach)) - stay * Math.abs(o - reach);
    gains.push(g);
  }
  /** The best smooth path, each point k at an offset index of at least lo[k] (offsets grow into the page). */
  const best = (lo: number[] | null): Path => {
    let cost = new Float64Array(O);
    const back: (Int32Array | null)[] = [];
    for (let k = 0; k < POINTS; k += 1) {
      const g = lo ? gains[k].map((v, o) => (o >= lo[k] ? v : OFF_PATH)) : gains[k];
      if (k === 0) {
        for (let o = 0; o < O; o += 1) cost[o] = -g[o];
        back.push(null);
        continue;
      }
      const next = new Float64Array(O).fill(Infinity);
      const from = new Int32Array(O);
      const { m, arg } = minPlus(cost);
      for (let o = 0; o < O; o += 1) { next[o] = m[o] - g[o]; from[o] = arg[o]; }
      back.push(from);
      cost = next;
    }
    let o = 0;
    for (let i = 1; i < O; i += 1) if (cost[i] < cost[o]) o = i;
    const pts: Pt[] = new Array(POINTS);
    const str: number[] = new Array(POINTS);
    const idx: number[] = new Array(POINTS);
    for (let k = POINTS - 1; k >= 0; k -= 1) {
      const [bx, by] = base(k);
      pts[k] = [bx + n[0] * (o - reach), by + n[1] * (o - reach)];
      str[k] = gains[k][o] + stay * Math.abs(o - reach); // the edge itself, without the stay charge
      idx[k] = o;
      if (k > 0) o = (back[k] as Int32Array)[o];
    }
    return { pts, str, idx, cover: str.filter((v) => v >= COVER_MIN).length / POINTS, mean: str.reduce((p, q) => p + q, 0) / POINTS };
  };
  let path = best(null);
  if (path.cover < opt.cover) return { pts: Array.from({ length: POINTS }, (_, k) => base(k)), str: new Array(POINTS).fill(0) };
  if (opt.inner) path = preferInner(path, O, sc.px(INNER_GAP), best);
  return { pts: path.pts, str: path.str };
}

/** Least-squares line through points, as a point and a unit direction. */
function fitLine(pts: Pt[]): Line {
  const n = pts.length;
  let mx = 0; let my = 0;
  for (const [x, y] of pts) { mx += x / n; my += y / n; }
  let sxx = 0; let sxy = 0; let syy = 0;
  for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { p: [mx, my], d: [Math.cos(th), Math.sin(th)] };
}

function meet(l1: Line, l2: Line): Pt | null {
  const den = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0];
  if (Math.abs(den) < PARALLEL) return null;
  const s = ((l2.p[0] - l1.p[0]) * l2.d[1] - (l2.p[1] - l1.p[1]) * l2.d[0]) / den;
  return [l1.p[0] + l1.d[0] * s, l1.p[1] + l1.d[1] * s];
}

/** One pass: follow the four sides, then each corner is where the two sides' ends nearest it meet. */
function refine(gray: Gray, ink: Gray, quad: Pt[], reach: number, sc: Scale, opt: Options): Candidate {
  const sides = [0, 1, 2, 3].map((s) => followSide(gray, ink, quad[s], quad[(s + 1) % 4], reach, sc, opt));
  const third = Math.max(MIN_SPAN, Math.round(POINTS / 3));
  const out = quad.map((c, i): Pt => {
    const prev = sides[(i + 3) % 4];
    const here = sides[i];
    return meet(fitLine(prev.pts.slice(-third)), fitLine(here.pts.slice(0, third))) ?? c;
  });
  return { quad: out, sides };
}

const clampTo = (W: number, H: number) => ([x, y]: Pt): Pt => [Math.min(W, Math.max(0, x)), Math.min(H, Math.max(0, y))];

/** Three passes from `start` (pixels) with a shrinking reach; the found corners are kept inside the picture. */
function follow(gray: Gray, ink: Gray, start: Pt[], firstReach: number, opt: Options, sc: Scale, W: number, H: number): Candidate {
  const minReach = sc.px(MIN_REACH);
  let quad = start;
  let sides: Side[] = [];
  for (let p = 0; p < PASSES; p += 1) {
    ({ quad, sides } = refine(gray, ink, quad, Math.max(minReach, Math.round(firstReach / 2 ** p)), sc, opt));
  }
  return { quad: quad.map(clampTo(W, H)), sides };
}

/** How much edge lies under a finished quad: each side's coverage and mean strength, for `farIsBetter`. */
function support(gray: Gray, ink: Gray, quad: Pt[], sc: Scale): { covers: number[]; means: number[] } {
  const sides = [0, 1, 2, 3].map((s) => followSide(gray, ink, quad[s], quad[(s + 1) % 4], sc.px(SCORE_REACH), sc, NEAR));
  const covers = sides.map((s) => s.str.filter((v) => v >= COVER_MIN).length / POINTS);
  const means = sides.map((s) => s.str.reduce((p, q) => p + q, 0) / POINTS);
  return { covers, means };
}

const twoWeakest = (covers: number[]) => [...covers].sort((p, q) => p - q).slice(0, 2).reduce((p, q) => p + q, 0);
const total = (v: number[]) => v.reduce((p, q) => p + q, 0);

/** Whether the far candidate is the better supported: by its two weakest sides' coverage, then by total strength. @testSeam */
export function farIsBetter(nearCovers: number[], nearMeans: number[], farCovers: number[], farMeans: number[]): boolean {
  const n = twoWeakest(nearCovers);
  const f = twoWeakest(farCovers);
  return f > n || (f === n && total(farMeans) > total(nearMeans));
}

/** Pulls rough page corners onto the paper's edge. Pure: no DOM, no globals, the input image is not modified. */
export function followEdges(image: GrayImage, start: Quad): Followed {
  const { width: W, height: H } = image;
  const sc = scaleFor(image);
  const { gray, ink } = buildMaps(image, sc);
  const rough = start.map((p): Pt => [p.x * W, p.y * H]);
  const near = follow(gray, ink, rough, sc.px(REACH), NEAR, sc, W, H);
  const far = follow(gray, ink, rough.map(clampTo(W, H)), sc.px(FAR_REACH), FAR, sc, W, H);
  const sn = support(gray, ink, near.quad, sc);
  const sf = support(gray, ink, far.quad, sc);
  const farWins = farIsBetter(sn.covers, sn.means, sf.covers, sf.means);
  const { quad, sides } = farWins ? far : near;
  const norm = ([x, y]: Pt): Point => ({ x: x / W, y: y / H });
  return {
    quad: quad.map(norm) as Quad,
    sides: sides.map((s) => s.pts.map(norm)) as [Point[], Point[], Point[], Point[]],
  };
}

/** The paper's edge along each side of a page (top, right, bottom, left): TRACE_POINTS points per side, 0 to 1 of the
 * picture, running from the side's first corner toward its second (corners in order top left, top right, bottom
 * right, bottom left), the corners themselves not included. */
export type Sides = [Point[], Point[], Point[], Point[]];

/** A point of a traced side that a person placed by hand: `k` is its index on the side (0 to 14, counted from the
 * side's first corner), `at` is where they put it, 0 to 1 of the picture. */
interface Pin { k: number; at: Point }
/** A person's pins per side (top, right, bottom, left); a side without pins is an empty list. */
export type Pins = [Pin[], Pin[], Pin[], Pin[]];

const TRACE_POINTS = 15; // points traced per side, evenly spaced between its two corners
const TRACE_REACH = 70; // px (tuned size) either side of the straight line a traced point may sit
const TRACE_STEP_FREE = 10; // px (tuned size) a traced edge may move between neighbouring points before the steep charge
const TRACE_STEEP = 4; // gray levels charged per px of a jump beyond the free step, on top of SMOOTH
const TRACE_ACROSS = 2; // px (tuned size) either side of a point the brightness step is read at
const TRACE_ALONG = [-4, 0, 4]; // px (tuned size) along the side the step is averaged over

/** How sharply brightness steps across a side at (x, y), either way round, averaged a little along the side. */
function stepAcross(gray: Gray, t: Pt, n: Pt, sc: Scale): (x: number, y: number) => number {
  const { w, h, d } = gray;
  const at = (x: number, y: number): number => d[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
  const across = sc.px(TRACE_ACROSS);
  const along = TRACE_ALONG.map(sc.offset);
  return (x, y) => {
    let s = 0;
    for (const u of along) {
      const px = x + t[0] * u; const py = y + t[1] * u;
      s += at(px + across * n[0], py + across * n[1]) - at(px - across * n[0], py - across * n[1]);
    }
    return Math.abs(s) / along.length;
  };
}

/**
 * The pinned path `pinnedOffs` with each unpinned point within 3 of a pin moved along by that pin's move: the pin's
 * offset less where the unpinned path `freeOffs` had it, times `PIN_PULL`. A pin on the edge moves nothing else; pins
 * stay; the nearest pin wins (a tie averages); no pull crosses a pin.
 */
function pullTowardPins(pinnedOffs: number[], freeOffs: number[], pinned: Set<number>): number[] {
  if (pinned.size === 0) return pinnedOffs;
  const nearest = (j: number, dir: number): number => {
    for (let d = 1; d <= PIN_PULL.length; d += 1) {
      const k = j + dir * d;
      if (k < 0 || k >= pinnedOffs.length) return 0;
      if (pinned.has(k)) return d;
    }
    return 0;
  };
  // Where point j goes when pulled by the pin d away in direction dir.
  const toward = (j: number, d: number, dir: number): number => {
    const k = j + dir * d;
    const w = PIN_PULL[d - 1];
    return (1 - w) * pinnedOffs[j] + w * (freeOffs[j] + pinnedOffs[k] - freeOffs[k]);
  };
  return pinnedOffs.map((o, j) => {
    if (pinned.has(j)) return o;
    const dl = nearest(j, -1);
    const dr = nearest(j, 1);
    const moved: number[] = [];
    if (dl && (!dr || dl <= dr)) moved.push(toward(j, dl, -1));
    if (dr && (!dl || dr <= dl)) moved.push(toward(j, dr, 1));
    return moved.length ? moved.reduce((a, b) => a + b, 0) / moved.length : o;
  });
}

/** The best smooth path of offsets along one side from a to b, pinned at offset 0 at both corners, as px points; unpinned points within three of a pin then move by a share of that pin's move. */
function traceSide(gain: (x: number, y: number) => number, a: Pt, b: Pt, sc: Scale, pins: Pin[], W: number, H: number): Pt[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const t: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const n: Pt = [-t[1], t[0]];
  const base = (k: number): Pt => {
    const f = (k + 1) / (TRACE_POINTS + 1);
    return [a[0] + t[0] * len * f, a[1] + t[1] * len * f];
  };
  // Pinned points: px offset across the side per point k (the last pin on a k wins); bad pins are ignored, and a pin
  // outside the picture is held at the picture's edge.
  const offsets = new Map<number, number>();
  for (const { k, at } of pins) {
    if (!Number.isInteger(k) || k < 0 || k >= TRACE_POINTS || !Number.isFinite(at.x) || !Number.isFinite(at.y)) continue;
    const [bx, by] = base(k);
    const x = Math.min(1, Math.max(0, at.x)) * W;
    const y = Math.min(1, Math.max(0, at.y)) * H;
    offsets.set(k, Math.round((x - bx) * n[0] + (y - by) * n[1]));
  }
  // A pin stays where the person put it: the side reaches as far as its farthest pin.
  const reach = Math.max(sc.px(TRACE_REACH), ...[...offsets.values()].map(Math.abs));
  const O = 2 * reach + 1;
  const gainRow = (k: number): Float64Array => {
    const [bx, by] = base(k);
    return Float64Array.from({ length: O }, (_, o) => gain(bx + n[0] * (o - reach), by + n[1] * (o - reach)));
  };
  const rows = Array.from({ length: TRACE_POINTS }, (_, k) => gainRow(k));
  const pinned = new Map<number, number>([...offsets].map(([k, d]) => [k, d + reach]));
  const free = sc.px(TRACE_STEP_FREE);
  /** The cost of a jump of `j` px across the side between neighbouring points (a corner counts as a point at offset 0). */
  const step = (j: number): number => SMOOTH * j + (j > free ? TRACE_STEEP * (j - free) : 0);
  /** The best smooth path pinned at offset 0 at both corners and at `fixed`, as offsets. */
  const bestPath = (fixed: Map<number, number>): number[] => {
    let cost = Float64Array.from(rows[0], (g, o) => (fixed.has(0) && fixed.get(0) !== o ? Infinity : step(Math.abs(o - reach)) - g));
    const back: Int32Array[] = [];
    for (let k = 1; k < TRACE_POINTS; k += 1) {
      const g = rows[k];
      const next = new Float64Array(O);
      const from = new Int32Array(O);
      const pin = fixed.get(k);
      for (let o = 0; o < O; o += 1) {
        if (pin !== undefined && pin !== o) { next[o] = Infinity; continue; } // a pinned point has only its own offset
        let m = Infinity; let arg = 0;
        for (let p = 0; p < O; p += 1) {
          const c = cost[p] + step(Math.abs(o - p));
          if (c < m) { m = c; arg = p; }
        }
        next[o] = m - g[o];
        from[o] = arg;
      }
      cost = next;
      back.push(from);
    }
    let o = 0;
    let bestCost = Infinity;
    for (let i = 0; i < O; i += 1) {
      const c = cost[i] + step(Math.abs(i - reach));
      if (c < bestCost) { bestCost = c; o = i; }
    }
    const offs: number[] = new Array(TRACE_POINTS);
    for (let k = TRACE_POINTS - 1; k >= 0; k -= 1) {
      offs[k] = o - reach;
      if (k > 0) o = back[k - 1][o];
    }
    return offs;
  };
  const offs = bestPath(pinned);
  // With pins, the path without them says how far each pin moved the line; its neighbours move by a share of that.
  const pulled = pinned.size ? pullTowardPins(offs, bestPath(new Map()), new Set(offsets.keys())) : offs;
  return pulled.map((off, k): Pt => {
    const [bx, by] = base(k);
    return [bx + n[0] * off, by + n[1] * off];
  });
}

/** The paper's edge along each side of `quad`, whose corners stay exactly where they are: what the corner editor
 * draws so a person sees the page's real, possibly curved, border. Each side follows the strongest edge near the
 * straight line between its corners, leaving and arriving at the corners, with a steep charge for a jump of more than
 * a few px between neighbouring points so it cannot hop to a parallel edge; where there is no edge it is the straight
 * line. A pinned point stays where the person put it, and the unpinned points within three of it move by a share of
 * how far it moved the line (`PIN_PULL`), so the line bends smoothly through it and a pin on the edge moves nothing else. Pure. */
export function traceSides(image: GrayImage, quad: Quad, pins: Pins | null = null): Sides {
  const { width: W, height: H } = image;
  const sc = scaleFor(image);
  const { gray } = smoothGray(image, sc);
  const px = quad.map((p): Pt => [p.x * W, p.y * H]);
  return px.map((a, s) => {
    const b = px[(s + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    return traceSide(stepAcross(gray, t, [-t[1], t[0]], sc), a, b, sc, pins?.[s] ?? [], W, H).map(([x, y]): Point => ({ x: x / W, y: y / H }));
  }) as Sides;
}
