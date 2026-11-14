// Edge guess, the last word. A page found by a cut across it (a wide blank band, a figure's edge, a
// shaded fold) is only part of the page: each side is pushed outward, a strip at a time, while the strip
// beyond it is still paper, as bright as the strip just inside within a small step. A real page edge is a
// step down (or up) onto the table; a text gap or a gradual shading is not. And a side lying on the
// frame border is never a page edge (the table or the next page was swallowed with the page): it is pulled
// in to the first step up in brightness, the page's own edge. Pure.
import type { GrayImage, Point, Quad } from '#lib/pageEnhance/quad.ts';

const STEP = 0.04; // of the neighbouring side's length, per strip pushed out
const MAX_STEPS = 40;
const ALONG = 24;
const ACROSS = 4;
const TOLERANCE = 0.08; // of the inner strip's paper brightness
const MIN_TOLERANCE = 10; // gray levels
const MIN_OF_PAPER = 0.6; // the strip beyond must still be this share of the whole quad's paper level
const INNER_IS_PAPER = 0.7; // an inner strip darker than this share of the paper is a figure or a band, not paper
const PAPER = 0.9; // the paper is the brightest tenth of a strip: ink and gaps do not count
const BORDER = 0.03; // a corner this near the frame is on its border
const PULL_STEP = 0.01;
const JUMP = 0.05; // of the paper level: the rise between two strips that marks the page's own edge
const MAX_PULL = 0.3; // of the quad's depth: a border side is never pulled in further than this

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** The brightest-tenth level of the pixels in the strip a, b, b2, a2 (pixel space). */
function paperLevel(image: GrayImage, a: Point, b: Point, b2: Point, a2: Point): number {
  const { width: w, height: h, data } = image;
  const values: number[] = [];
  for (let i = 0; i <= ALONG; i += 1) {
    const top = lerp(a, b, i / ALONG);
    const bottom = lerp(a2, b2, i / ALONG);
    for (let j = 0; j < ACROSS; j += 1) {
      const p = lerp(top, bottom, (j + 0.5) / ACROSS);
      const x = Math.min(w - 1, Math.max(0, Math.round(p.x)));
      const y = Math.min(h - 1, Math.max(0, Math.round(p.y)));
      values.push(data[y * w + x]);
    }
  }
  values.sort((x, y) => x - y);
  return values[Math.floor(PAPER * (values.length - 1))];
}

/** Whether both ends of a side sit on the same border of the frame. */
function onFrameBorder(a: Point, b: Point, w: number, h: number): boolean {
  const near = [(p: Point) => p.x <= BORDER * w, (p: Point) => p.x >= (1 - BORDER) * w, (p: Point) => p.y <= BORDER * h, (p: Point) => p.y >= (1 - BORDER) * h];
  return near.some((is) => is(a) && is(b));
}

/** Pull each border side in to the first step up in paper level (the page's own edge) within reach of
 * the border; the sides that moved. A side with no such step stays: a gradual shading is not an edge. */
function pullBorderSides(image: GrayImage, q: Point[], paper: number): Set<number> {
  const { width: w, height: h } = image;
  const pulled = new Set<number>();
  const jump = Math.max(MIN_TOLERANCE, JUMP * paper);
  for (let side = 0; side < 4; side += 1) {
    const i0 = side; const i1 = (side + 1) % 4; const prev = (side + 3) % 4; const next = (side + 2) % 4;
    if (!onFrameBorder(q[i0], q[i1], w, h)) continue;
    const a = q[i0]; const b = q[i1];
    const level = (k: number) => paperLevel(image, lerp(a, q[prev], k * PULL_STEP), lerp(b, q[next], k * PULL_STEP), lerp(b, q[next], (k + 1) * PULL_STEP), lerp(a, q[prev], (k + 1) * PULL_STEP));
    let before = level(0);
    let current = level(1);
    for (let k = 1; k < MAX_PULL / PULL_STEP - 1; k += 1) {
      const after = level(k + 1);
      if (current - before >= jump && after - before >= jump / 2) {
        q[i0] = lerp(a, q[prev], (k + 0.5) * PULL_STEP);
        q[i1] = lerp(b, q[next], (k + 0.5) * PULL_STEP);
        pulled.add(side);
        break;
      }
      before = current; current = after;
    }
  }
  return pulled;
}

/** Push each side but `skip` out while the strip past it is still paper. Corners stay in the frame. */
function pushSidesOut(image: GrayImage, q: Point[], paper: number, skip: Set<number>): void {
  const { width: w, height: h } = image;
  for (let side = 0; side < 4; side += 1) {
    if (skip.has(side)) continue;
    const i0 = side; const i1 = (side + 1) % 4; const prev = (side + 3) % 4; const next = (side + 2) % 4;
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const a = q[i0]; const b = q[i1];
      const a2 = { x: a.x + (a.x - q[prev].x) * STEP, y: a.y + (a.y - q[prev].y) * STEP };
      const b2 = { x: b.x + (b.x - q[next].x) * STEP, y: b.y + (b.y - q[next].y) * STEP };
      if ([a2, b2].some((p) => p.x < 0 || p.y < 0 || p.x > w - 1 || p.y > h - 1)) break;
      // The strip just inside this side, the same depth as the one beyond it.
      const a1 = { x: a.x - (a.x - q[prev].x) * STEP, y: a.y - (a.y - q[prev].y) * STEP };
      const b1 = { x: b.x - (b.x - q[next].x) * STEP, y: b.y - (b.y - q[next].y) * STEP };
      const inner = paperLevel(image, a1, b1, b, a);
      const outer = paperLevel(image, a, b, b2, a2);
      const ref = inner >= INNER_IS_PAPER * paper ? inner : paper;
      if (Math.abs(outer - ref) > Math.max(MIN_TOLERANCE, TOLERANCE * ref) || outer < MIN_OF_PAPER * paper) break;
      q[i0] = a2; q[i1] = b2;
    }
  }
}

/** The quad with its border sides pulled in and its other sides pushed out as far as the paper goes. */
export function fitToPaper(image: GrayImage, quad: Quad): Quad {
  const { width: w, height: h } = image;
  const q = quad.map((p) => ({ x: p.x * w, y: p.y * h }));
  const paper = paperLevel(image, q[0], q[1], q[2], q[3]);
  pushSidesOut(image, q, paper, pullBorderSides(image, q, paper));
  return q.map((p) => ({ x: p.x / w, y: p.y / h })) as Quad;
}
