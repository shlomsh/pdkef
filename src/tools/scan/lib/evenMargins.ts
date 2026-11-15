// A photographed book page's text sits centred (SCAN-76). The inner side of a book page runs into the spine, so
// its corners leave the text a thin margin there and a wide one on the outer side. The text block's sides are
// read from its rows, with the flattening's own line reader, so a gutter shadow, the facing page or a figure
// never counts; the thin side is then padded out to the wide side's margin in the paper's own tone. A page
// whose rows hold no clear block, or whose margins are near even already, comes back as the same object.
// Pure: no DOM.
import { shrink, toGray } from '#lib/pageEnhance/dewarp/index.ts';
import { pageMasks } from '#lib/pageEnhance/dewarp/ink.ts';
import { lineSamples, smear } from '#lib/pageEnhance/dewarp/lineBend.ts';
import type { GrayImage, RgbaImage } from '#lib/pageEnhance/quad.ts';
import { documentGrey } from './filters.ts';

/** The page is read at most this big: the size the flattening reads its lines at. */
const MEASURE_LONG_EDGE = 1000;
/** A row shorter than this share of the page is a heading, a last line or a caption, not a full line of the block. */
const MIN_ROW_SPAN = 0.4;
/** The fewest full rows that make a text block. */
const MIN_ROWS = 6;
/** A row end this near an edge (share of the width) is on it. */
const END_TOLERANCE = 0.015;
/** An edge is held by at least this many full rows... */
const MIN_EDGE_ROWS = 6;
/** ...and this share of them: a ragged side holds none, and the block's edge is the outermost one that is held, so rows that
 * flow round a figure below the block do not move it. */
const MIN_HELD = 0.25;
/** Rows this far apart (share of the rows' height) propose an edge. */
const MIN_PAIR_SPAN = 0.1;
/** An edge leans at most this much (width per height): the spine side's text edge leans where the curl was not all taken out. */
const MAX_LEAN = 0.15;
/** The block spans at least this share of the page: a narrower one is a column laid out beside something else. */
const MIN_BLOCK = 0.6;
/** Margins closer than this share of the width are even already. */
const MIN_UNEVEN = 0.03;
/** A difference past this share of the width is the page's layout or a crop far off the page, not a spine's squeeze. */
const MAX_PAD = 0.2;
/** Grey (Document look) a margin pixel needs to count as clean paper. */
const PAPER = 250;
/** The paper's tone is read in this many bands down the page. */
const BANDS = 40;
/** The padding fades from the page's own edge into the paper over this share of the width. */
const RAMP = 0.02;
/** Margin columns this near the page's edge or the text (share of the width) are left out of the paper's tone. */
const CLEAR = 0.01;
/** The seam's colour is read over this share of the width, just inside the page's edge. */
const SEAM = 0.005;
/** The thin side's own edge is cut back this far at most: the dark line or shadow core the curl leaves there. */
const TRIM = 0.015;
/** ...and never nearer the text than this. */
const TEXT_CLEAR = 0.03;
/** The second look adds at most this share of the width: the band along the edge the line reader leaves out. */
const MAX_TOP_UP = 0.04;

/** The text block's left and right sides, as shares of the page's width. */
export interface BlockSides { left: number; right: number }

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

/** Where the outermost held edge through the row ends (`y`, `x`) crosses the rows' middle, or null when no edge is held.
 * `outward` is -1 for the left side, 1 for the right. */
function heldEdge(ends: Array<[number, number]>, outward: number): number | null {
  const ys = ends.map(([y]) => y);
  const top = Math.min(...ys);
  const span = Math.max(...ys) - top;
  const middle = top + span / 2;
  const need = Math.max(MIN_EDGE_ROWS, MIN_HELD * ends.length);
  let best: number | null = null;
  for (let i = 0; i < ends.length; i += 1) {
    for (let j = 0; j < ends.length; j += 1) {
      const dy = ends[j][0] - ends[i][0];
      if (dy < MIN_PAIR_SPAN * span) continue;
      const lean = (ends[j][1] - ends[i][1]) / dy;
      if (Math.abs(lean) > MAX_LEAN) continue;
      const on = ends.filter(([y, x]) => Math.abs(ends[i][1] + lean * (y - ends[i][0]) - x) <= END_TOLERANCE);
      if (on.length < need) continue;
      // The held rows' own line, read at the middle.
      const my = on.reduce((sum, [y]) => sum + y, 0) / on.length;
      const mx = on.reduce((sum, [, x]) => sum + x, 0) / on.length;
      let num = 0;
      let den = 0;
      for (const [y, x] of on) { num += (y - my) * (x - mx); den += (y - my) ** 2; }
      const at = mx + (den ? num / den : 0) * (middle - my);
      if (best === null || (at - best) * outward > 0) best = at;
    }
  }
  return best;
}

/** @testSeam The text block's sides from its full rows, or null when the rows hold no block with two clean edges. */
export function blockSides(gray: GrayImage): BlockSides | null {
  const { ink, rules, width: w, height: h } = pageMasks(gray);
  const rows = new Uint8Array(w * h);
  for (let i = 0; i < rows.length; i += 1) rows[i] = ink[i] & (rules[i] ^ 1);
  const full = lineSamples(smear(rows, w, h), w, h).filter((line) => line[line.length - 1].x - line[0].x >= MIN_ROW_SPAN);
  if (full.length < MIN_ROWS) return null;
  const middle = (line: typeof full[number]) => median(line.map((s) => s.y));
  const left = heldEdge(full.map((line) => [middle(line), line[0].x]), -1);
  const right = heldEdge(full.map((line) => [middle(line), line[line.length - 1].x]), 1);
  return left !== null && right !== null && right - left >= MIN_BLOCK ? { left, right } : null;
}

type Rgb = [number, number, number];

type Side = 'left' | 'right';

/** How the thin side is reshaped, in shares of the page's width: `trim` cut off its edge, then `pad` of paper added past it. */
interface Reshape { thin: Side; trim: number; pad: number }

/** The plan for a page whose block sits at `sides`, or null when its margins are even already or too far apart to be a squeeze. */
function planFor(sides: BlockSides): Reshape | null {
  const left = sides.left;
  const right = 1 - sides.right;
  const uneven = Math.abs(left - right);
  if (uneven < MIN_UNEVEN || uneven > MAX_PAD) return null;
  const trim = Math.min(TRIM, Math.max(0, Math.min(left, right) - TEXT_CLEAR));
  return { thin: left < right ? 'left' : 'right', trim, pad: uneven + trim };
}

/** Per band down `small`: the clean paper's colour in the margins (its brighter half, so a shadow does not tint
 * it), and the page's own colour where the padding meets it. Null when the margins show no clean paper at all. */
function bandTones(small: RgbaImage, sides: BlockSides, plan: Reshape): { paper: Rgb[]; seam: Rgb[] } | null {
  const { width: w, height: h, data } = small;
  const grey = documentGrey(small);
  const clear = Math.ceil(CLEAR * w);
  const cut = Math.round(plan.trim * w);
  const [leftCut, rightCut] = plan.thin === 'left' ? [cut, 0] : [0, cut];
  const spans = [[leftCut + clear, Math.floor(sides.left * w) - clear], [Math.ceil(sides.right * w) + clear, w - rightCut - clear]];
  const seamXs = Array.from({ length: Math.max(1, Math.ceil(SEAM * w)) }, (_, k) => (plan.thin === 'left' ? cut + 1 + k : w - 2 - cut - k));
  const luma = (i: number) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  const paper: (Rgb | null)[] = [];
  const seam: Rgb[] = [];
  for (let b = 0; b < BANDS; b += 1) {
    const y0 = Math.floor((b * h) / BANDS);
    const y1 = Math.max(y0 + 1, Math.floor(((b + 1) * h) / BANDS));
    const found: number[] = [];
    const column: number[][] = [[], [], []];
    for (let y = y0; y < y1; y += 1) {
      for (const [x0, x1] of spans) {
        for (let x = x0; x < x1; x += 1) if (grey[y * w + x] >= PAPER) found.push(y * w + x);
      }
      for (const x of seamXs) for (let k = 0; k < 3; k += 1) column[k].push(data[(y * w + x) * 4 + k]);
    }
    seam.push(column.map(median) as Rgb);
    if (found.length === 0) { paper.push(null); continue; }
    const bar = median(found.map(luma));
    const bright = found.filter((i) => luma(i) >= bar);
    paper.push([0, 1, 2].map((k) => bright.reduce((sum, i) => sum + data[i * 4 + k], 0) / bright.length) as Rgb);
  }
  const known = paper.flatMap((tone, b) => (tone ? [b] : []));
  if (known.length === 0) return null;
  // A band with no clean paper takes the nearest band that has some.
  const nearest = (b: number) => known.reduce((best, k) => (Math.abs(k - b) < Math.abs(best - b) ? k : best));
  return { paper: paper.map((tone, b) => tone ?? (paper[nearest(b)] as Rgb)), seam };
}

/** The band tones at row `y` of an image `height` tall, read between the bands' centres. */
function toneAt(tones: Rgb[], y: number, height: number): Rgb {
  const f = Math.min(BANDS - 1, Math.max(0, ((y + 0.5) * BANDS) / height - 0.5));
  const b = Math.min(BANDS - 2, Math.floor(f));
  const t = f - b;
  return [0, 1, 2].map((k) => tones[b][k] * (1 - t) + tones[b + 1][k] * t) as Rgb;
}

/** `image` with its thin side trimmed and padded as `plan` says, the padding fading from the seam's colour into the paper's. */
function reshape(image: RgbaImage, plan: Reshape, tones: { paper: Rgb[]; seam: Rgb[] }): RgbaImage {
  const { width, height, data } = image;
  const cut = Math.round(plan.trim * width);
  const add = Math.round(plan.pad * width);
  const kept = width - cut;
  const outWidth = kept + add;
  const from = plan.thin === 'left' ? cut : 0;
  const at = plan.thin === 'left' ? add : 0;
  const ramp = Math.max(1, Math.round(RAMP * width));
  const out = new Uint8ClampedArray(outWidth * height * 4);
  for (let y = 0; y < height; y += 1) {
    out.set(data.subarray((y * width + from) * 4, (y * width + from + kept) * 4), (y * outWidth + at) * 4);
    const paper = toneAt(tones.paper, y, height);
    const seam = toneAt(tones.seam, y, height);
    for (let d = 1; d <= add; d += 1) {
      const t = Math.min(1, d / ramp);
      const x = plan.thin === 'left' ? add - d : kept + d - 1;
      const o = (y * outWidth + x) * 4;
      for (let k = 0; k < 3; k += 1) out[o + k] = Math.round(seam[k] + (paper[k] - seam[k]) * t);
      out[o + 3] = 255;
    }
  }
  return { width: outWidth, height, data: out };
}

/** The plan, topped up by a second look at the reshaped copy: rows that run into the page's edge band, where the line
 * reader does not look, show their real ends once the padding has moved them in. It only ever adds, and only that band's worth. */
function settled(small: RgbaImage, plan: Reshape, tones: { paper: Rgb[]; seam: Rgb[] }): Reshape {
  const trial = reshape(small, plan, tones);
  const again = blockSides(toGray(trial));
  if (!again) return plan;
  const [thinMargin, wideMargin] = plan.thin === 'left' ? [again.left, 1 - again.right] : [1 - again.right, again.left];
  const more = ((wideMargin - thinMargin) * trial.width) / small.width;
  return more > 0 && more <= MAX_TOP_UP && plan.pad - plan.trim + more <= MAX_PAD ? { ...plan, pad: plan.pad + more } : plan;
}

/** The page with its text block centred between even side margins, the thin side padded in the paper's tone; the same object when it needs nothing. */
export function evenMargins(image: RgbaImage): RgbaImage {
  const small = shrink(image, MEASURE_LONG_EDGE);
  const sides = blockSides(toGray(small));
  const plan = sides && planFor(sides);
  const tones = plan && bandTones(small, sides!, plan);
  if (!plan || !tones) return image;
  return reshape(image, settled(small, plan, tones), tones);
}
