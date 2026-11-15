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
/** At most this share of the full rows may run past a side's edge... */
const MAX_PAST = 0.1;
/** ...by more than this share of the width: a curl the flattening left bends the spine side's edge by less. */
const PAST_BY = 0.03;
/** The rows holding an edge reach at least this share of the page's height: a table's rules, or a few lines of a form, sit together in less. */
const MIN_EDGE_SPAN = 0.3;
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
/** The thin margin is lifted from this share of the width past the text... */
const LIFT_CLEAR = 0.005;
/** ...fully so this much further out. */
const LIFT_BLEND = 0.015;
/** A column's paper is its values at this share up, in a band: print and specks sit below it. */
const BRIGHT = 0.9;
/** A shadow is lifted at most this many times. */
const MAX_LIFT = 3;
/** The second look moves the padding by at most this share of the width: the band along the edge the line reader leaves out, and its smear. */
const MAX_TOP_UP = 0.06;

/** One side of the text block, read where its rows' middle is, as a share of the page's width: `outer`, the outermost edge
 * its rows hold; `held`, the edge most of them hold; `past`, the share of the rows that run past `outer`. */
interface SideRead { outer: number; held: number; past: number }
/** The text block's two sides. */
interface BlockSides { left: SideRead; right: SideRead }

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

/** One side of the block through the row ends (`y`, `x`), or null when no edge is held. `outward` is -1 for the left side, 1 for the right. */
function readSide(ends: Array<[number, number]>, outward: number): SideRead | null {
  const ys = ends.map(([y]) => y);
  const top = Math.min(...ys);
  const span = Math.max(...ys) - top;
  const middle = top + span / 2;
  const need = Math.max(MIN_EDGE_ROWS, MIN_HELD * ends.length);
  let outer: { at: number; line: (y: number) => number } | null = null;
  let held: { at: number; support: number } | null = null;
  for (let i = 0; i < ends.length; i += 1) {
    for (let j = 0; j < ends.length; j += 1) {
      const dy = ends[j][0] - ends[i][0];
      if (dy < MIN_PAIR_SPAN * span) continue;
      const lean = (ends[j][1] - ends[i][1]) / dy;
      if (Math.abs(lean) > MAX_LEAN) continue;
      const on = ends.filter(([y, x]) => Math.abs(ends[i][1] + lean * (y - ends[i][0]) - x) <= END_TOLERANCE);
      if (on.length < need) continue;
      const reach = on.reduce((most, [y]) => Math.max(most, y), 0) - on.reduce((least, [y]) => Math.min(least, y), 1);
      if (reach < MIN_EDGE_SPAN) continue;
      // The held rows' own line.
      const my = on.reduce((sum, [y]) => sum + y, 0) / on.length;
      const mx = on.reduce((sum, [, x]) => sum + x, 0) / on.length;
      let num = 0;
      let den = 0;
      for (const [y, x] of on) { num += (y - my) * (x - mx); den += (y - my) ** 2; }
      const slope = den ? num / den : 0;
      const at = mx + slope * (middle - my);
      if (!outer || (at - outer.at) * outward > 0) outer = { at, line: (y) => mx + slope * (y - my) };
      if (!held || on.length > held.support) held = { at, support: on.length };
    }
  }
  if (!outer || !held) return null;
  const line = outer.line;
  const past = ends.filter(([y, x]) => (x - line(y)) * outward > PAST_BY).length / ends.length;
  return { outer: outer.at, held: held.at, past };
}

/** The text block's sides from its full rows, or null when the rows hold no block with two clean edges. */
function blockSides(gray: GrayImage): BlockSides | null {
  const { ink, rules, width: w, height: h } = pageMasks(gray);
  const rows = new Uint8Array(w * h);
  for (let i = 0; i < rows.length; i += 1) rows[i] = ink[i] & (rules[i] ^ 1);
  const full = lineSamples(smear(rows, w, h), w, h).filter((line) => line[line.length - 1].x - line[0].x >= MIN_ROW_SPAN);
  if (full.length < MIN_ROWS) return null;
  const middle = (line: typeof full[number]) => median(line.map((s) => s.y));
  const left = readSide(full.map((line) => [middle(line), line[0].x]), -1);
  const right = readSide(full.map((line) => [middle(line), line[line.length - 1].x]), 1);
  return left && right && right.outer - left.outer >= MIN_BLOCK ? { left, right } : null;
}

/** The text's outer edges, as shares of the width: nothing of the block reaches past them. */
const outerEdges = ({ left, right }: BlockSides) => ({ left: left.outer, right: right.outer });

/** The thin side's margin and the wide side's. The wide side is the page's flat outer side, so its outermost edge is its
 * margin; the thin side runs into the spine, whose edge may still curve at the top and bottom rows, so the edge most rows hold is its. */
function marginsOf(sides: BlockSides, thin: Side): { thin: number; wide: number; widePast: number } {
  return thin === 'left'
    ? { thin: sides.left.held, wide: 1 - sides.right.outer, widePast: sides.right.past }
    : { thin: 1 - sides.right.held, wide: sides.left.outer, widePast: sides.left.past };
}

type Rgb = [number, number, number];

type Side = 'left' | 'right';

/** How the thin side is reshaped, in shares of the page's width: `trim` cut off its edge, then `pad` of paper added past it. */
interface Reshape { thin: Side; trim: number; pad: number }

/** The plan for a page whose block sits at `sides`, or null when its margins are even already or too far apart to be a
 * squeeze, or when full rows run past its wide side's edge: that edge is then an indent, not the block's side. */
function planFor(sides: BlockSides): Reshape | null {
  const thin: Side = sides.left.outer < 1 - sides.right.outer ? 'left' : 'right';
  const margins = marginsOf(sides, thin);
  const uneven = margins.wide - margins.thin;
  if (uneven < MIN_UNEVEN || uneven > MAX_PAD || margins.widePast > MAX_PAST) return null;
  const trim = Math.min(TRIM, Math.max(0, margins.thin - TEXT_CLEAR));
  return { thin, trim, pad: uneven + trim };
}

/** The pixels of rows `y0` to `y1` inside `spans` that the Document look reads as clean paper. */
function cleanPaper(grey: Uint8ClampedArray, w: number, y0: number, y1: number, spans: number[][]): number[] {
  const found: number[] = [];
  for (let y = y0; y < y1; y += 1) {
    for (const [x0, x1] of spans) for (let x = x0; x < x1; x += 1) if (grey[y * w + x] >= PAPER) found.push(y * w + x);
  }
  return found;
}

/** Per band down `small`: the clean paper's colour in the margins (its brighter half, so a shadow does not tint
 * it), and the page's own colour where the padding meets it. Null when the margins show no clean paper at all. */
function bandTones(small: RgbaImage, sides: { left: number; right: number }, plan: Reshape): { paper: Rgb[]; seam: Rgb[] } | null {
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
    const found = cleanPaper(grey, w, y0, y1, spans);
    const column: number[][] = [[], [], []];
    for (let y = y0; y < y1; y += 1) {
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

/** The plan, settled by a second look at the reshaped copy: rows that run into the page's edge band, where the line reader
 * does not look, show their real ends once the padding has moved them in. It moves the padding by that band's worth at most. */
function settled(small: RgbaImage, plan: Reshape, tones: { paper: Rgb[]; seam: Rgb[] }): Reshape {
  const trial = reshape(small, plan, tones);
  const again = blockSides(toGray(trial));
  if (!again) return plan;
  const margins = marginsOf(again, plan.thin);
  const more = ((margins.wide - margins.thin) * trial.width) / small.width;
  const pad = plan.pad + more;
  return Math.abs(more) <= MAX_TOP_UP && pad > plan.trim && pad - plan.trim <= MAX_PAD ? { ...plan, pad } : plan;
}

/** Channel k's BRIGHT-quantile level down column x over rows y0..y1, counted rather than sorted. */
function brightLevel(data: Uint8ClampedArray, w: number, x: number, k: number, y0: number, y1: number): number {
  const counts = new Uint32Array(256);
  for (let y = y0; y < y1; y += 1) counts[data[(y * w + x) * 4 + k]] += 1;
  const rank = Math.floor(BRIGHT * (y1 - y0 - 1));
  let seen = 0;
  for (let v = 0; v < 256; v += 1) {
    seen += counts[v];
    if (seen > rank) return v;
  }
  return 255;
}

/** The thin margin's shadow lifted: past the text, each column's paper, band by band, is scaled up to the page's paper tone,
 * so a gutter shadow or the page's dark edge fades into the paper, and print there keeps its contrast. */
function relight(image: RgbaImage, sides: { left: number; right: number }, thin: Side, paper: Rgb[]): RgbaImage {
  const { width: w, height: h, data } = image;
  const edge = thin === 'left' ? Math.floor(sides.left * w) : Math.ceil(sides.right * w);
  const clear = Math.round(LIFT_CLEAR * w);
  const blend = Math.max(1, Math.round(LIFT_BLEND * w));
  const xs = thin === 'left'
    ? Array.from({ length: Math.max(0, edge - clear) }, (_, i) => i)
    : Array.from({ length: Math.max(0, w - edge - clear) }, (_, i) => edge + clear + i);
  if (xs.length === 0) return image;
  // gains[band][column][channel]: the paper's tone over that column's bright level in the band.
  const gains: number[][][] = [];
  for (let b = 0; b < BANDS; b += 1) {
    const y0 = Math.floor((b * h) / BANDS);
    const y1 = Math.max(y0 + 1, Math.floor(((b + 1) * h) / BANDS));
    gains.push(xs.map((x) => [0, 1, 2].map((k) => {
      const bright = brightLevel(data, w, x, k, y0, y1);
      return Math.min(MAX_LIFT, Math.max(1, paper[b][k] / Math.max(1, bright)));
    })));
  }
  const out = new Uint8ClampedArray(data);
  for (let y = 0; y < h; y += 1) {
    const f = Math.min(BANDS - 1, Math.max(0, ((y + 0.5) * BANDS) / h - 0.5));
    const b = Math.min(BANDS - 2, Math.floor(f));
    const t = f - b;
    xs.forEach((x, i) => {
      const weight = Math.min(1, (Math.abs(x - edge) - clear) / blend);
      const o = (y * w + x) * 4;
      for (let k = 0; k < 3; k += 1) {
        const gain = gains[b][i][k] * (1 - t) + gains[b + 1][i][k] * t;
        out[o + k] = Math.round(data[o + k] * (1 + (gain - 1) * weight));
      }
    });
  }
  return { width: w, height: h, data: out };
}

/** The page with its text block centred between even side margins, the thin side padded in the paper's tone; the same object when it needs nothing. */
export function evenMargins(image: RgbaImage): RgbaImage {
  const small = shrink(image, MEASURE_LONG_EDGE);
  const sides = blockSides(toGray(small));
  const plan = sides && planFor(sides);
  if (!sides || !plan) return image;
  const edges = outerEdges(sides);
  const measured = bandTones(small, edges, plan);
  if (!measured) return image;
  // The seam is read once the thin margin is lifted, so the padding starts from the lifted paper.
  const lit = relight(small, edges, plan.thin, measured.paper);
  const tones = { paper: measured.paper, seam: bandTones(lit, edges, plan)!.seam };
  return reshape(relight(image, edges, plan.thin, measured.paper), settled(lit, plan, tones), tones);
}
