// Two cheap facts about a page the detector found, for the viewfinder's guidance (SCAN-24): how well the page
// stands out from what it lies on, and how steeply it is seen. Pure: no DOM. Both run on every camera frame in
// the worker, so they read a few dozen pixels and four corners, nothing more.
import type { GrayImage, Quad } from '#lib/pageEnhance/quad.ts';

/** Samples along each side of the page. */
const SAMPLES_PER_SIDE = 8;
/** How far in and out of the side each sample reads, as a share of the frame's short side: about 8 px at 320. */
const OFFSET = 0.025;

/** The mean of the 3x3 pixels around (x, y), or null when they are not all inside the image. */
function mean3(image: GrayImage, x: number, y: number): number | null {
  const cx = Math.round(x);
  const cy = Math.round(y);
  const { width: w, height: h, data } = image;
  if (cx < 1 || cy < 1 || cx > w - 2 || cy > h - 2) return null;
  let sum = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    const row = (cy + dy) * w;
    sum += data[row + cx - 1] + data[row + cx] + data[row + cx + 1];
  }
  return sum / 9;
}

/**
 * How much the page stands out from its surroundings, 0..1: the median, over points along the quad's four sides,
 * of the brightness step between just inside and just outside the side, over 255. A white page (225) on a dark
 * desk (40) reads about 0.73, on a light wooden table (140) about 0.33, on a white table (200) under 0.15. Points whose outside falls off
 * the frame are skipped; null when every point does (the page fills the frame, so there is nothing to compare).
 * 8 points a side, 9 pixels each side of the line: 576 reads a frame.
 */
export function borderContrast(image: GrayImage, quad: Quad): number | null {
  const { width: w, height: h } = image;
  const off = Math.max(2, OFFSET * Math.min(w, h));
  const steps: number[] = [];
  for (const side of sidePoints(quad, w, h)) {
    for (const pt of side) {
      const inner = mean3(image, pt.x + pt.nx * off, pt.y + pt.ny * off);
      const outer = mean3(image, pt.x - pt.nx * off, pt.y - pt.ny * off);
      if (inner === null || outer === null) continue;
      steps.push(Math.abs(inner - outer));
    }
  }
  if (steps.length === 0) return null;
  steps.sort((p, q) => p - q);
  return steps[steps.length >> 1] / 255;
}

/** A sample point on a side of the quad (frame pixels) and the side's unit normal, turned to face the page's centre. */
interface SidePoint { x: number; y: number; nx: number; ny: number }

/** For each side of the quad with any length, its SAMPLES_PER_SIDE points and the normal. */
function sidePoints(quad: Quad, w: number, h: number): SidePoint[][] {
  const px = quad.map((p) => ({ x: p.x * w, y: p.y * h }));
  const cx = (px[0].x + px[1].x + px[2].x + px[3].x) / 4;
  const cy = (px[0].y + px[1].y + px[2].y + px[3].y) / 4;
  const sides: SidePoint[][] = [];
  for (let i = 0; i < 4; i += 1) {
    const a = px[i];
    const b = px[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (nx * (cx - mx) + ny * (cy - my) < 0) { nx = -nx; ny = -ny; }
    const pts: SidePoint[] = [];
    for (let k = 0; k < SAMPLES_PER_SIDE; k += 1) {
      const t = (k + 0.5) / SAMPLES_PER_SIDE;
      pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, nx, ny });
    }
    sides.push(pts);
  }
  return sides;
}

/** Outside reads must stay at or above this share of the paper level for paper to count as carrying on. */
const PAPER_CARRIES = 0.9;
/** Which percentile of the inner reads is the paper level (an inner read can land on ink). */
const PAPER_PERCENTILE = 0.8;
/** Of a side's points, how many must run to the frame's edge for the side to run off. */
const POINTS_TO_RUN = 6;

/**
 * Does paper carry on past a side of the found quad all the way to the frame's edge? That is a page cut off by the
 * frame whose quad ends at its last line of print: below that false side there is only paper. Walks outward from
 * each side point in OFFSET steps until the frame ends; a point runs if every read stayed near the paper level
 * (a high percentile of the inner reads). A side runs off at 6 of 8 points. True for one to three such sides; all
 * four is a light table with no step around the page, which says nothing about being cut off.
 */
export function runsOff(image: GrayImage, quad: Quad): boolean {
  const n = runsOffSides(image, quad);
  return n >= 1 && n <= 3;
}

/** How many sides of the quad have paper running on to the frame's edge; -1 for a degenerate quad. */
function runsOffSides(image: GrayImage, quad: Quad): number {
  const { width: w, height: h } = image;
  const off = Math.max(2, OFFSET * Math.min(w, h));
  const sides = sidePoints(quad, w, h);
  if (sides.length < 4) return -1;
  const inner: number[] = [];
  for (const side of sides) for (const pt of side) {
    const v = mean3(image, pt.x + pt.nx * off, pt.y + pt.ny * off);
    if (v !== null) inner.push(v);
  }
  if (inner.length === 0) return -1;
  inner.sort((p, q) => p - q);
  const floor = inner[Math.min(inner.length - 1, Math.floor(inner.length * PAPER_PERCENTILE))] * PAPER_CARRIES;
  let running = 0;
  for (const side of sides) {
    let n = 0;
    for (const pt of side) {
      let reads = 0;
      let ok = true;
      for (let d = off; ; d += off) {
        const v = mean3(image, pt.x - pt.nx * d, pt.y - pt.ny * d);
        if (v === null) break;
        reads += 1;
        if (v < floor) { ok = false; break; }
      }
      if (ok && reads >= 1) n += 1;
    }
    if (n >= POINTS_TO_RUN) running += 1;
  }
  return running;
}

/**
 * How squarely the page is seen, 0..1: of each pair of opposite sides, the shorter over the longer (in pixels of
 * a `width` x `height` frame), and the smaller of the two pairs. 1 is a page seen straight from above; a phone
 * tipped back makes the far side shorter. The straightening undoes the shape, not the lost detail: at 0.6 the far
 * side has 60% of the near side's pixels.
 */
export function keystone(quad: Quad, width: number, height: number): number {
  const side = (i: number) => {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    return Math.hypot((b.x - a.x) * width, (b.y - a.y) * height);
  };
  const ratio = (p: number, q: number) => (Math.max(p, q) > 0 ? Math.min(p, q) / Math.max(p, q) : 1);
  return Math.min(ratio(side(0), side(2)), ratio(side(1), side(3)));
}

/** The grid the light-surface reading samples: every 4th pixel each way, about 8,500 reads at 320x427. */
const LIGHT_STEP = 4;
/** Which share of the samples is read: the darkest fifth. */
const LIGHT_SHARE = 0.2;

/**
 * How light the darkest part of the view is, 0..1: the 20th-percentile brightness over 255. A page on a dark
 * desk leaves a fifth of the frame dark, so this stays low; a light table, with or without a page on it, keeps
 * it high, and so does a page filling over four fifths of the frame. For a frame where no page was found, it tells
 * "nothing to see" from "nothing dark to see it against".
 */
export function lightFloor(image: GrayImage): number {
  const { width: w, height: h, data } = image;
  const counts = new Uint32Array(256);
  let n = 0;
  for (let y = LIGHT_STEP >> 1; y < h; y += LIGHT_STEP) {
    for (let x = LIGHT_STEP >> 1; x < w; x += LIGHT_STEP) {
      counts[data[y * w + x]] += 1;
      n += 1;
    }
  }
  if (n === 0) return 0;
  const want = Math.ceil(n * LIGHT_SHARE);
  let seen = 0;
  for (let v = 0; v < 256; v += 1) {
    seen += counts[v];
    if (seen >= want) return v / 255;
  }
  return 1;
}
