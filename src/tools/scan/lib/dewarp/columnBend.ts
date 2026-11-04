// The page's vertical lines, measured the way lineBend measures its rows (SCAN-17). A form's table
// rules and box borders should run straight down the page; where they bow, or fan apart because a
// corner sat a little off the paper, the same shared fit says how far to move each point sideways.
// Rules, not text: a column of text has no straight vertical edge to follow. Pure: no DOM.
import type { PageMasks } from './ink.ts';
import { fitBend, type FittedBend, type Sample } from './lineBend.ts';

/** A rule's column must hold rule pixels over at least this share of the height. */
const MIN_RULE = 0.15;
/** Two rules closer than this share of the width are one. */
const RULE_GAP = 0.015;
/** Each rule is followed down the page in bands of this share of the height... */
const BAND = 0.02;
/** ...searching this share of the width either side of where it was. */
const REACH = 0.006;
/** A band counts when its best column holds rule pixels over this share of the band. */
const BAND_FILL = 0.5;
/** Fewest bands a rule needs. */
const MIN_SAMPLES = 8;
/** Fewest rules: a form has its two borders and at least one line between them. */
const MIN_RULES = 3;

/** Where each rule crosses each band, as Samples of lineBend's shape turned on their side: `x` is the
 * height down the page, `y` the rule's position across it. */
function ruleSamples(rule: Uint8Array, w: number, h: number): Sample[][] {
  const reach = Math.max(2, Math.round(w * REACH));
  const perColumn = new Int32Array(w);
  for (let i = 0; i < rule.length; i += 1) if (rule[i]) perColumn[i % w] += 1;
  // A rule that leans spreads over a few columns, so it is counted over the reach around each one.
  const columns = new Int32Array(w);
  for (let x = 0; x < w; x += 1) {
    for (let xx = Math.max(0, x - reach); xx <= Math.min(w - 1, x + reach); xx += 1) columns[x] += perColumn[xx];
  }
  const gap = Math.max(3, Math.round(w * RULE_GAP));
  const starts: number[] = [];
  const order = [...columns.keys()].sort((a, b) => columns[b] - columns[a]);
  for (const x of order) {
    if (columns[x] < MIN_RULE * h) break;
    if (starts.every((s) => Math.abs(s - x) > gap)) starts.push(x);
  }
  const band = Math.max(4, Math.round(h * BAND));
  const rules: Sample[][] = [];
  for (const start of starts) {
    const samples: Sample[] = [];
    // Followed down the page from the column where it is strongest, each band re-centred on the last.
    let x = start;
    for (let y0 = 0; y0 < h; y0 += band) {
      const y1 = Math.min(h, y0 + band);
      let sum = 0;
      let weight = 0;
      let best = 0;
      for (let xx = Math.max(0, x - reach); xx <= Math.min(w - 1, x + reach); xx += 1) {
        let n = 0;
        for (let y = y0; y < y1; y += 1) n += rule[y * w + xx];
        sum += xx * n;
        weight += n;
        if (n > best) best = n;
      }
      if (best < BAND_FILL * (y1 - y0)) continue;
      const centre = sum / weight;
      samples.push({ line: 0, x: (y0 + y1) / 2 / h, y: (centre + 0.5) / w });
      x = Math.round(centre);
    }
    if (samples.length >= MIN_SAMPLES) rules.push(samples);
  }
  return rules;
}

/**
 * The vertical rules of a page already flattened by its corners (and edges), fitted as a LineBend in
 * turned coordinates: for an output point (x, y), the point to read is (x + bendAt(bend, y, x), y),
 * with `lean` in x per y. Null when the page has no clear set of rules. finishBend settles the lean.
 */
export function columnFit({ rules, width: w, height: h }: PageMasks): FittedBend | null {
  if (w < 16 || h < 16) return null;
  return fitBend(ruleSamples(rules, w, h), MIN_RULES);
}
