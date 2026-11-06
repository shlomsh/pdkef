// READ-13: the staircase around an open mark's bands, before any pencil is applied. Pure geometry, so the shape is tested
// without a drawing library; markOutlinePath.ts turns its strokes into the sketched line.
import { textFrame, type SketchRect } from '#editor/geometry/sketchStroke.ts';

type OutlinePt = readonly [number, number];
export type OutlineStroke = readonly [OutlinePt, OutlinePt];

/**
 * READ-26: shares of the line's height, because a band's foot is already about halfway to the next line, and the white
 * left is a share of the type, not a number of points. Along the text the pad reaches the middle of a word gap; above and
 * below it barely clears the band. The wobble is what rough.js may stray, at worst about 1.7 times this. The overrun
 * is the hand-drawn part: a stroke along the text runs this far past its corners, where it only crosses white.
 */
const OUTLINE_PAD_SIDE = 0.09;
const OUTLINE_PAD_END = 0.03;
const OUTLINE_WOBBLE = 0.08;
const OUTLINE_OVERRUN = 0.25;
/** Line ends closer than this are one end: a justified paragraph gets straight sides, not a jitter staircase. */
const SNAP = 1.5;

/** Snaps values within SNAP of a group's first to the group's outer-most one (`pick` is Math.min or Math.max). */
function snapped(values: readonly number[], pick: (...n: number[]) => number): number[] {
  const order = values.map((_, i) => i).sort((p, q) => values[p] - values[q]);
  const out = values.slice();
  for (let s = 0; s < order.length;) {
    let e = s;
    while (e + 1 < order.length && values[order[e + 1]] - values[order[s]] <= SNAP) e++;
    const group = order.slice(s, e + 1), v = pick(...group.map((i) => values[i]));
    for (const i of group) out[i] = v;
    s = e + 1;
  }
  return out;
}

/** Drops repeated and collinear vertices of a closed polygon. */
function tidy(pts: OutlinePt[]): OutlinePt[] {
  let p = pts.filter((v, i) => v[0] !== pts[(i + 1) % pts.length][0] || v[1] !== pts[(i + 1) % pts.length][1]);
  for (let again = true; again && p.length > 3;) {
    const n = p.length, prev = p;
    p = prev.filter((v, i) => {
      const a = prev[(i + n - 1) % n], b = prev[(i + 1) % n];
      return Math.abs((v[0] - a[0]) * (b[1] - v[1]) - (v[1] - a[1]) * (b[0] - v[0])) > 1e-9;
    });
    again = p.length < n;
  }
  return p;
}

/** The passage's tightest line, measured across the text: on a quarter-turned page that is a band's width. An empty band is no line. */
function lineHeight(bands: readonly SketchRect[], turns: number): number {
  const heights = bands.map((b) => (turns & 1 ? b.w : b.h)).filter((h) => h > 0);
  return heights.length ? Math.min(...heights) : 0;
}

/** How far the pencil may stray from the polygon in the page's points, for rough.js's `maxRandomnessOffset`. */
export function outlineWobble(bands: readonly SketchRect[], turns = 0): number {
  return bands.length ? OUTLINE_WOBBLE * lineHeight(bands, turns) : 0;
}

/**
 * The closed polygon (no repeated closing vertex) around the bands, in the page's points. Worked in the text frame,
 * where the lines stack top to bottom: each line is padded, and where two neighbours' padding overlaps they meet at the
 * midpoint between them, so the outline never crosses itself. @testSeam
 */
export function outlineVertices(bands: readonly SketchRect[], turns = 0): OutlinePt[] {
  if (!bands.length) return [];
  const x0 = Math.min(...bands.map((b) => b.x)), y0 = Math.min(...bands.map((b) => b.y));
  const { map } = textFrame({ x: x0, y: y0, w: Math.max(...bands.map((b) => b.x + b.w)) - x0, h: Math.max(...bands.map((b) => b.y + b.h)) - y0 }, turns);
  // The map is axis-aligned: its unit vectors are the text frame's axes on the page, and the inverse is their dot products.
  const o = map([0, 0]), ea = map([1, 0]), eb = map([0, 1]);
  const toText = ([x, y]: OutlinePt): OutlinePt => {
    const dx = x - o[0], dy = y - o[1];
    return [dx * (ea[0] - o[0]) + dy * (ea[1] - o[1]), dx * (eb[0] - o[0]) + dy * (eb[1] - o[1])];
  };
  const lines = bands.map((b) => {
    const p = toText([b.x, b.y]), q = toText([b.x + b.w, b.y + b.h]);
    return { a0: Math.min(p[0], q[0]), a1: Math.max(p[0], q[0]), b0: Math.min(p[1], q[1]), b1: Math.max(p[1], q[1]) };
  }).sort((p, q) => p.b0 + p.b1 - q.b0 - q.b1);
  const height = lineHeight(bands, turns), side = OUTLINE_PAD_SIDE * height, end = OUTLINE_PAD_END * height;
  const left = snapped(lines.map((l) => l.a0), Math.min).map((v) => v - side);
  const right = snapped(lines.map((l) => l.a1), Math.max).map((v) => v + side);
  // cuts[i] is the top of line i; cuts[n] is the foot of the last.
  const cuts = [lines[0].b0 - end];
  for (let i = 1; i < lines.length; i++) cuts.push((lines[i - 1].b1 + lines[i].b0) / 2);
  cuts.push(lines[lines.length - 1].b1 + end);
  const down: OutlinePt[] = [], up: OutlinePt[] = [];
  lines.forEach((_, i) => {
    down.push([right[i], cuts[i]], [right[i], cuts[i + 1]]);
    const j = lines.length - 1 - i;
    up.push([left[j], cuts[j + 1]], [left[j], cuts[j]]);
  });
  return tidy([...down, ...up].map(map));
}

/**
 * The polygon as pencil strokes, one per edge in drawing order. A stroke along the text runs in the white between the
 * lines, so it may run past its corners the way a hand draws a box; a stroke across the text stops at them, because past
 * a corner it would reach the next line.
 */
export function outlineStrokes(bands: readonly SketchRect[], turns = 0): OutlineStroke[] {
  const vs = outlineVertices(bands, turns);
  if (!vs.length) return [];
  const overrun = OUTLINE_OVERRUN * lineHeight(bands, turns);
  return vs.map((v, i) => {
    const n = vs[(i + 1) % vs.length];
    const e = v[turns & 1 ? 0 : 1] === n[turns & 1 ? 0 : 1] ? overrun : 0;
    const dx = Math.sign(n[0] - v[0]) * e, dy = Math.sign(n[1] - v[1]) * e;
    return [[v[0] - dx, v[1] - dy], [n[0] + dx, n[1] + dy]];
  });
}
