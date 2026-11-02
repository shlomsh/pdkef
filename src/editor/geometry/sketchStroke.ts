// READ-11: the Sketch stroke (the Chisel look) as a pure function of a mark's band rects and a seed from its id, so the
// screen, print and the PDF draw the same path. Every length is a share of the band's height: the shape is the same at any zoom.
import { UNDERLINE_LIFT } from '../model/underlineInk.ts';

/** One line's band in points, top-left origin, y down. Only differences matter: the shape is the same wherever it sits. */
export interface SketchRect { x: number; y: number; w: number; h: number }

/** M, C and Z only, so an SVG `d` and a PDF content stream (m, c, h) draw the same curve. */
export type PathOp = readonly ['M', number, number] | readonly ['C', number, number, number, number, number, number] | readonly ['Z'];

type Pt = readonly [number, number];
type Rng = () => number;

/** A seed from a mark's id (FNV-1a, unsigned 32 bit). */
export function strokeSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise on [0, 1]: `knots` random values in [-1, 1], eased between with a cosine. */
function noise(r: Rng, knots: number): (u: number) => number {
  const n = Math.max(1, Math.round(knots));
  const k = Array.from({ length: n + 1 }, () => r() * 2 - 1);
  return (u) => {
    const x = Math.min(n, Math.max(0, u * n)), i = Math.min(n - 1, Math.floor(x)), f = (1 - Math.cos((x - i) * Math.PI)) / 2;
    return k[i] * (1 - f) + k[i + 1] * f;
  };
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const n2 = (v: number) => Math.round(v * 100) / 100;

/** A closed Catmull-Rom spline through the points, as cubic Beziers. */
function closedCurve(p: readonly Pt[], map: (pt: Pt) => Pt): PathOp[] {
  const q = p.map(map), m = q.length, at = (i: number) => q[(i + m) % m];
  const ops: PathOp[] = [['M', n2(q[0][0]), n2(q[0][1])]];
  for (let i = 0; i < m; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    ops.push(['C', n2(p1[0] + (p2[0] - p0[0]) / 6), n2(p1[1] + (p2[1] - p0[1]) / 6), n2(p2[0] - (p3[0] - p1[0]) / 6), n2(p2[1] - (p3[1] - p1[1]) / 6), n2(p2[0]), n2(p2[1])]);
  }
  ops.push(['Z']);
  return ops;
}

/**
 * A rect in the text's own frame (text runs along +x, its foot is the bottom) and the map from that frame back to the
 * page. Turns match the clean underline: 1 puts the foot on the displayed left, 2 on the top, 3 on the right.
 */
function textFrame(band: SketchRect, turns: number): { rect: SketchRect; map: (pt: Pt) => Pt } {
  const { x, y, w, h } = band;
  switch (turns & 3) {
    case 1: return { rect: { x: 0, y: 0, w: h, h: w }, map: ([a, b]) => [x + w - b, y + a] };
    case 2: return { rect: { x: 0, y: 0, w, h }, map: ([a, b]) => [x + w - a, y + h - b] };
    case 3: return { rect: { x: 0, y: 0, w: h, h: w }, map: ([a, b]) => [x + b, y + h - a] };
    default: return { rect: band, map: (pt) => pt };
  }
}

/**
 * One line's stroke in its own frame: u runs 0 to 1 along it, v from -1 (top edge) to 1 (bottom).
 * `frame(u, v)` maps to the page; the outline is a list of (u, v) points, so the ends can take any shape.
 */
function lineFrame(band: SketchRect, r: Rng) {
  const { x, y, w, h } = band;
  // Ends: a little before the first word, a little more past the last one, as a hand does.
  const o0 = h * (0.08 + r() * 0.2);
  const o1 = h * (0.18 + r() * 0.34);
  const x0 = x - o0, len = w + o0 + o1;
  // The chisel: both ends cut on the same slant (the bottom corner leads at the start, the top one at the end).
  const slant = h * (0.26 + r() * 0.14);
  const half = h * 0.5 * (0.98 + r() * 0.06);
  // The hand: a drift up or down over the line, a slight bow, a slow wander, and a felt edge that is never quite straight.
  const drift = (r() - 0.5) * Math.min(h * 0.2, len * 0.02);
  const bow = (r() - 0.5) * h * 0.09;
  const wander = noise(r, len / (h * 3.2)), wanderAmp = h * 0.04;
  const swell = noise(r, len / (h * 2.4)), swellAmp = 0.05;
  const feltT = noise(r, len / (h * 0.55)), feltB = noise(r, len / (h * 0.55)), feltAmp = h * 0.02;
  const landing = h * 0.7;
  const cy = (u: number) => y + h / 2 + drift * (u - 0.5) + bow * Math.sin(Math.PI * u) + wander(u) * wanderAmp;
  const hw = (u: number) => half * (1 + swell(u) * swellAmp + 0.045 * Math.exp(-(u * len) / landing)); // the pen lands a touch heavier
  const frame = (u: number, v: number): Pt => {
    const c = cy(u), hh = hw(u), felt = v < 0 ? feltT(u) : feltB(u);
    return [x0 + u * len + (-v * slant) / 2, c + v * hh + felt * feltAmp * Math.min(1, Math.abs(v))];
  };
  return { frame, len, h };
}

/** The outline of one stroke in (u, v), clockwise on the page: a slightly full start, the top edge, the end, the bottom edge back. */
function outline(len: number, h: number): Pt[] {
  const step = (h * 0.42) / len, ru = (h * 0.16) / len;
  const pts: Pt[] = [];
  const edge = (from: number, to: number, v: number) => {
    const n = Math.max(2, Math.ceil(Math.abs(to - from) / step));
    for (let i = 0; i <= n; i++) pts.push([from + ((to - from) * i) / n, v]);
  };
  pts.push([ru * 0.25, 0.97], [-0.004, 0.62], [-0.012, 0], [-0.006, -0.62], [ru * 0.25, -0.97]);
  edge(ru, 1 - ru, -1);
  pts.push([1 - ru * 0.25, -0.97], [1.004, -0.6], [1.01, 0], [1.006, 0.62], [1 - ru * 0.25, 0.97]);
  edge(1 - ru, ru, 1);
  return pts;
}

/** A highlight's sketched bands: one path, a subpath per line, filled nonzero so touching lines never double. `turns` is the page's quarter turns. */
export function sketchBands(bands: readonly SketchRect[], seed: number, turns = 0): PathOp[] {
  return bands.flatMap((band, i) => {
    const r = rng(seed ^ Math.imul(i + 1, 0x9e3779b1));
    const { rect, map } = textFrame(band, turns);
    const f = lineFrame(rect, r);
    return closedCurve(outline(f.len, f.h).map(([u, v]) => f.frame(u, v)), map);
  });
}

/** An underline's sketched line under each band, as a filled outline `width` points thick, its centre where the clean line's is. */
export function sketchUnderline(bands: readonly SketchRect[], seed: number, width: number, turns = 0): PathOp[] {
  return bands.flatMap((band, i) => {
    const r = rng(seed ^ Math.imul(i + 1, 0x85ebca6b));
    const { rect: { x, y, w, h }, map } = textFrame(band, turns);
    const o0 = h * (0.04 + r() * 0.12), o1 = h * (0.16 + r() * 0.3);
    const x0 = x - o0, len = w + o0 + o1, base = y + h - UNDERLINE_LIFT - width / 2;
    const drift = (r() - 0.5) * Math.min(h * 0.16, len * 0.012), bow = (r() - 0.5) * h * 0.08;
    const wander = noise(r, len / (h * 2.6)), amp = h * 0.03, swell = noise(r, len / (h * 2));
    const cy = (u: number) => base + drift * (u - 0.5) + bow * Math.sin(Math.PI * u) + wander(u) * amp - 0.12 * h * smooth(0.9, 1, u) ** 2;
    const half = (u: number) => (width / 2) * (1.08 + swell(u) * 0.14) * (1 - 0.5 * smooth(0.82, 1, u)) * (0.75 + 0.25 * smooth(0, 0.05, u));
    const n = Math.max(10, Math.ceil(len / (h * 0.35)));
    const top: Pt[] = [], bot: Pt[] = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n, px = x0 + u * len;
      top.push([px, cy(u) - half(u)]); bot.push([px, cy(u) + half(u)]);
    }
    const cap0: Pt = [x0 - width * 0.45, cy(0)], cap1: Pt = [x0 + len + width * 0.3, cy(1)];
    return closedCurve([cap0, ...top, cap1, ...bot.reverse()], map);
  });
}

/** The ops as an SVG path `d`. */
export function svgPath(ops: readonly PathOp[]): string {
  return ops.map((op) => (op[0] === 'Z' ? 'Z' : op[0] + op.slice(1).join(' '))).join('');
}
