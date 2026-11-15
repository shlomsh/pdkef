// Edge guess, the fold. An open book shows our page and a strip of the facing page, both bright paper,
// so the brightness guess takes them as one and a side runs onto the facing page or the frame border,
// where fitToPaper finds no step. What divides the pages is a fold: a long, nearly vertical line darker
// than the paper on both sides of it, a thin crease or a wider shadow valley. Text crosses a vertical line
// only now and then, a crease darkens it all along, so a line is scored by a low percentile of its
// darkness, not its mean. The left and the right side are looked at independently, each only when it lies
// within GATE of the frame width of its own frame edge (a guess may stop short of the border, or have one
// corner pulled in), which leaves a sheet well inside the frame and its printed rules alone. Pure.
import type { GrayImage, Point, Quad } from '#lib/pageEnhance/quad.ts';

const GATE = 0.2; // of the frame width: how near its own frame edge a side must lie to be looked at
const REACH = 0.45; // of the quad's width, from the gated side: where the fold may be
const STEP = 0.01; // of the width, between coarse candidate end points
const FINE = 0.0025; // of the width: the refinement step, within one STEP of the best coarse candidate
const MAX_TILT = (20 * Math.PI) / 180; // from the quad's own vertical side
const SAMPLES = 48;
const OFFSETS = [0.01, 0.03]; // of the width: how far out the paper is read (crease, shadow valley)
const PERCENTILE = 0.3;
const LOW_ALLOWED = Math.floor(PERCENTILE * (SAMPLES - 1)); // samples at or under the floor before a line cannot beat it
const STRIP_MARGIN = 0.015; // of the width: skipped beyond the line, so its own shadow is not read as ink
const MIN_INK = 0.15; // of the paper level: how much darker the 10th-percentile point of the strip must be
const MIN_SCORE = 0.08; // of the paper level: how much darker the 30th-percentile point of the line is
const MAX_SCORE = 0.45; // a fold is shading; a line darker than this is printed ink (a form rule), not a fold

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** The darkness (share of the paper level) a line from `a` to `b` has under the paper beside it. A line
 * that cannot beat `floor` returns early with some value at or under it (most candidates do, so the scan is cheap). */
function foldScore(image: GrayImage, a: Point, b: Point, width: number, floor: number): number {
  const { width: w, height: h, data } = image;
  const at = (x: number, y: number) => data[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const nx = (b.y - a.y) / len; const ny = -(b.x - a.x) / len;
  let best = 0;
  for (const d of OFFSETS) {
    const off = d * width;
    const dark: number[] = [];
    let low = 0;
    for (let i = 0; i < SAMPLES; i += 1) {
      const p = lerp(a, b, (i + 0.5) / SAMPLES);
      const line = Math.min(at(p.x, p.y), at(p.x + nx, p.y + ny), at(p.x - nx, p.y - ny));
      const paper = Math.min(at(p.x + nx * off, p.y + ny * off), at(p.x - nx * off, p.y - ny * off));
      const drop = (paper - line) / Math.max(1, paper);
      dark.push(drop);
      if (drop <= floor && (low += 1) > LOW_ALLOWED) break; // the percentile sample is then at or under floor
    }
    if (low > LOW_ALLOWED) continue;
    dark.sort((x, y) => x - y);
    best = Math.max(best, dark[Math.floor(PERCENTILE * (SAMPLES - 1))]);
  }
  return best;
}

/** Whether the strip between a candidate line (`a` to `b`) and the quad's side (`sa` to `sb`) holds ink: a
 * fold needs a facing page beyond it, a blank margin past a printed rule is not one. */
function stripHasInk(image: GrayImage, a: Point, b: Point, sa: Point, sb: Point, width: number): boolean {
  const { width: w, height: h, data } = image;
  const dir = Math.sign(sa.x - a.x) || 1;
  const values: number[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const t = (i + 0.5) / SAMPLES;
    const p = lerp(a, b, t); const e = lerp(sa, sb, t);
    const from = p.x + dir * STRIP_MARGIN * width;
    const span = e.x - from;
    if (span * dir <= 0) continue;
    for (let k = 0; k < 8; k += 1) {
      const x = from + (span * 0.9 * (k + 0.5)) / 8; // the far tenth is the quad side itself, often a pixel past the paper
      values.push(data[Math.min(h - 1, Math.max(0, Math.round(p.y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))]);
    }
  }
  if (values.length === 0) return false;
  values.sort((x, y) => x - y);
  const paper = values[Math.floor(0.9 * (values.length - 1))];
  return paper - values[Math.floor(0.1 * (values.length - 1))] >= MIN_INK * paper;
}

/** The best fold line for the quad's left or right side (`right`; quad `q` in pixel space): its end points on
 * the quad's top and bottom sides, or null when no candidate scores between MIN_SCORE and MAX_SCORE. The right
 * side's search is measured on the quad as already cut on the left. */
function findFold(image: GrayImage, q: Point[], right: boolean): [Point, Point] | null {
  const width = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y);
  const side = right ? [q[1], q[2]] : [q[0], q[3]];
  const sideAngle = Math.atan2(side[1].y - side[0].y, side[1].x - side[0].x);
  const steps = Math.round(REACH / STEP);
  let found: [Point, Point] | null = null;
  let bestScore = MIN_SCORE;
  let bestAt = [0, 0];
  // Both end points sit at `t` of the way in from the gated side's corners, on the top and bottom sides.
  const tryAt = (ti: number, tj: number) => {
    const top = lerp(q[0], q[1], right ? 1 - ti : ti);
    const bottom = lerp(q[3], q[2], right ? 1 - tj : tj);
    const tilt = Math.abs(Math.atan2(bottom.y - top.y, bottom.x - top.x) - sideAngle);
    if (tilt > MAX_TILT) return;
    const score = foldScore(image, top, bottom, width, bestScore);
    if (score > bestScore && score <= MAX_SCORE && stripHasInk(image, top, bottom, side[0], side[1], width)) { bestScore = score; found = [top, bottom]; bestAt = [ti, tj]; }
  };
  for (let i = 0; i <= steps; i += 1) for (let j = 0; j <= steps; j += 1) tryAt(i * STEP, j * STEP);
  if (!found) return null;
  const [ci, cj] = bestAt;
  for (let a = -STEP; a <= STEP + 1e-9; a += FINE) for (let b = -STEP; b <= STEP + 1e-9; b += FINE) if (ci + a >= 0 && cj + b >= 0) tryAt(ci + a, cj + b);
  return found;
}

/** A quad whose left or right side runs past the page onto a facing page (that side lies near its frame
 * edge) gets that side moved in to the fold between the pages, when one is found; otherwise the same quad. `folds` lists the side
 * indices moved (right 1, left 3). */
export function cutAtFold(image: GrayImage, quad: Quad): { quad: Quad; folds: number[] } {
  const { width: w, height: h } = image;
  const q = quad.map((p) => ({ x: p.x * w, y: p.y * h }));
  const folds: number[] = [];
  for (const right of [false, true]) {
    const [i0, i1] = right ? [1, 2] : [0, 3];
    const edgeGap = right ? w - (q[i0].x + q[i1].x) / 2 : (q[i0].x + q[i1].x) / 2;
    if (edgeGap > GATE * w) continue;
    const line = findFold(image, q, right);
    if (!line) continue;
    q[i0] = line[0]; q[i1] = line[1];
    folds.push(right ? 1 : 3);
  }
  return folds.length ? { quad: q.map((p) => ({ x: p.x / w, y: p.y / h })) as Quad, folds } : { quad, folds };
}
