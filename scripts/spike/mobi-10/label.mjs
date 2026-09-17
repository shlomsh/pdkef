#!/usr/bin/env node
/**
 * MOBI-10 spike: geometric (no-model) label association.
 *
 * Copies every CandidateField from `--candidates` and fills in `label` by matching it against
 * the page's pdf.js text items (`--text`) using plain geometry + text heuristics. No model runs
 * at any point; every decision is a distance/overlap comparison on the CONTRACT.md-normalized
 * `bounds` (fractions 0..1, origin top-left, y down) that both files already share.
 *
 * Run from the repo root:
 *   node scripts/spike/mobi-10/label.mjs --candidates <in.json> --text <text-items.json> --out <out.json>
 *
 * See report-labels.md for the measured label-association rate per form, the rules below in
 * plain English, and the failure classes found while iterating on this file.
 */

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--candidates') args.candidates = argv[(i += 1)];
    else if (flag === '--text') args.text = argv[(i += 1)];
    else if (flag === '--out') args.out = argv[(i += 1)];
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!args.candidates || !args.text || !args.out) {
    throw new Error(
      'Usage: label.mjs --candidates <candidates.json> --text <text-items.json> --out <out.json>',
    );
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ---- geometry helpers -------------------------------------------------

const right = (b) => b.x + b.width;
const bottom = (b) => b.y + b.height;
const centerX = (b) => b.x + b.width / 2;
const centerY = (b) => b.y + b.height / 2;

function overlap1d(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function areaOf(b) {
  return Math.max(0, b.width) * Math.max(0, b.height);
}

function intersectionArea(a, b) {
  const w = overlap1d(a.x, right(a), b.x, right(b));
  const h = overlap1d(a.y, bottom(a), b.y, bottom(b));
  return w * h;
}

/** True when `item`'s box sits mostly inside `cand`'s box: it is the field's own printed
 * content (a pre-filled digit, the checkbox's own square glyph), never a label for anything. */
function mostlyInside(item, cand, ratio = 0.5) {
  const a = areaOf(item);
  if (a <= 0) return false;
  return intersectionArea(item, cand) / a >= ratio;
}

// A lone dash/dot/etc. (e.g. the printed separator between a phone number's area-code comb and
// its main run) is never itself a label; it can still be pulled into a merged phrase around a
// real anchor, but must never win the anchor search on its own (measured on health/comb-0001,
// which otherwise anchored on the "-" between the two נייד cells instead of the word itself).
const PUNCTUATION_ONLY = /^[-‐-―.,:;'"׳״()]+$/;
const isPunctuationOnly = (str) => PUNCTUATION_ONLY.test(str.trim());

/** Same text line as a candidate/item: vertical bands overlap by a healthy fraction of the
 * shorter box, or their vertical centers are close relative to their height (covers baseline
 * jitter between a comb's thin strip and a full-height text run next to it). */
function sameLine(a, b) {
  const minH = Math.min(a.height, b.height) || Math.max(a.height, b.height, 0.001);
  const vOverlap = overlap1d(a.y, bottom(a), b.y, bottom(b));
  if (vOverlap / minH >= 0.35) return true;
  const centerDist = Math.abs(centerY(a) - centerY(b));
  return centerDist <= 0.6 * Math.max(a.height, b.height, 0.004);
}

const TOUCH_GAP = 0.02; // ~ one short word's width of horizontal slack, both forms measured
// No cap on the column-header search distance: CONTRACT's own guidance is "walk up to the
// FIRST run whose x-range overlaps", and a repeating table (itc101's 13-row children table)
// prints its header once, up to ~0.35 page-heights above its last row. The x-overlap
// requirement in findAnchor() is what keeps this from grabbing an unrelated header.
const ABOVE_GAP = 1;
const MERGE_GAP = 0.018; // how tight two same-line runs must sit to be treated as one phrase
const MAX_MERGE_ITEMS = 6;
const MAX_MERGE_WIDTH = 0.4;

/** Horizontal gap between two boxes when one sits to the side of the other with no x-overlap;
 * null when their x-ranges overlap (not a "touching neighbour" relationship). */
function sideGap(cand, item) {
  if (item.x >= right(cand) - 0.002) return item.x - right(cand); // item to the right
  if (right(item) <= cand.x + 0.002) return cand.x - right(item); // item to the left
  return null;
}

function xOverlapWidth(cand, item) {
  return overlap1d(cand.x, right(cand), item.x, right(item));
}

/** Broad fallback: a weighted distance that strongly prefers a run above the candidate (labels
 * sit above or beside a field, essentially never below it) and otherwise just measures gap. */
function fallbackDistance(cand, item) {
  const dx = item.x >= right(cand) ? item.x - right(cand)
    : right(item) <= cand.x ? cand.x - right(item)
      : 0;
  let dy;
  if (bottom(item) <= cand.y + 0.002) dy = (cand.y - bottom(item)) * 0.6; // above: favourable
  else if (item.y >= bottom(cand) - 0.002) dy = (item.y - bottom(cand)) * 5; // below: penalised
  else dy = 0; // same line
  return dx + dy;
}

// ---- text-run text assembly (RTL-aware) --------------------------------

/** Both sample forms are RTL Hebrew forms. pdf.js emits each item's own characters in correct
 * logical order (verified in README.md; its own paren swap has already been undone per-item,
 * see `unmirrorParens` below), but items across a *line* come out in ascending-x (left-to-right,
 * visual) order. A line is really a sequence of same-direction runs ("chunks": a Hebrew phrase,
 * or an embedded LTR run like a "(4)" digit group): reading order reverses the sequence of
 * chunks, but never the item order *inside* an LTR chunk - that would re-break an already
 * correctly-ordered "(4)". Inside a multi-item RTL chunk (rare; most Hebrew phrases in these
 * forms are already single pdf.js text items) reading order reverses those items too. */
function assemblePhrase(items) {
  const rtlLen = items.filter((i) => i.dir === 'rtl').reduce((n, i) => n + i.str.length, 0);
  const ltrLen = items.filter((i) => i.dir === 'ltr').reduce((n, i) => n + i.str.length, 0);
  const overallRtl = rtlLen >= ltrLen;

  const ascending = [...items].sort((a, b) => a.bounds.x - b.bounds.x);
  const chunks = [];
  for (const item of ascending) {
    const last = chunks[chunks.length - 1];
    if (last && last.dir === item.dir) last.items.push(item);
    else chunks.push({ dir: item.dir, items: [item] });
  }
  for (const chunk of chunks) {
    if (chunk.dir === 'rtl') chunk.items.sort((a, b) => b.bounds.x - a.bounds.x);
    // ltr chunks keep their ascending (already-correct) order.
  }
  const orderedChunks = overallRtl ? [...chunks].reverse() : chunks;

  const text = orderedChunks
    .map((c) => c.items.map((i) => i.str.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
  return text;
}

/** pdf.js hands back each RTL item's own characters already reordered into correct logical
 * order (README.md), but on both sample forms every RTL item that contains a paren has that
 * paren's glyph mirrored for its own on-page visual placement - e.g. the item literally reads
 * "שכר עבודה )עובד יומי(" where a human reads "שכר עבודה (עובד יומי)". Undoing that mirroring
 * once, per RTL item, up front is what lets a lone "(4)"-style LTR digit run (already correctly
 * ordered - never touched here) sit right next to Hebrew text after assembly. */
function unmirrorParens(str, dir) {
  if (dir !== 'rtl' || !/[()]/.test(str)) return str;
  return str.replace(/[()]/g, (ch) => (ch === '(' ? ')' : '('));
}

// ---- per-candidate label search ----------------------------------------

// A real inline field label is short (a word or two: "פקס", "מספר זהות"); a run of pdf.js
// "words" longer than this is prose - a section header or a sentence from the form's running
// text - that happens to share a baseline with a comb by coincidence. Single-character tokens
// (letter-spaced headings, lone digits/punctuation) don't count, so "ש נ ת ה מ ס" still reads
// as one short word here, not six.
const SENTENCE_WORD_LIMIT = 3;
function looksLikeSentence(str) {
  const realWords = str.split(/\s+/).filter((w) => w.length >= 2);
  return realWords.length > SENTENCE_WORD_LIMIT;
}

function findSameLineTouch(cand, pool, kind) {
  // Same line, touching left or right, smallest gap wins (measured on both forms: itc101's
  // checkbox option text touches on the left, health's touches on the right; checking both
  // sides and taking the closer one covers both without hard-coding a form). A comb sitting in
  // the middle of a row has no real neighbour most of the time, so a same-line "touch" that is
  // actually a sentence of running text is rejected in favour of the column-header search below
  // (measured: itc101's children-table date cells otherwise anchor on whatever prose happens to
  // share their baseline, e.g. a section header two sections away).
  let best = null;
  let bestGap = Infinity;
  for (const item of pool) {
    if (!sameLine(cand, item.bounds)) continue;
    if (kind === 'comb' && looksLikeSentence(item.str)) continue;
    const gap = sideGap(cand, item.bounds);
    if (gap === null || gap > TOUCH_GAP) continue;
    if (gap < bestGap) { bestGap = gap; best = item; }
  }
  return best ? { item: best, rule: 'same-line-touch', metric: bestGap } : null;
}

function findColumnHeaderAbove(cand, pool) {
  // Column header sitting above, in the same x-band (walk up to the first run whose x-range
  // overlaps the candidate, or whose centre falls within it for a narrower/wider header).
  let best = null;
  let bestVGap = Infinity;
  let bestOverlap = -1;
  for (const item of pool) {
    const vGap = cand.y - bottom(item.bounds);
    if (vGap < -0.002 || vGap > ABOVE_GAP) continue;
    const ov = xOverlapWidth(cand, item.bounds);
    const centered = Math.abs(centerX(item.bounds) - centerX(cand)) <= 0.5 * cand.width;
    if (ov <= 0 && !centered) continue;
    if (vGap < bestVGap - 1e-6 || (Math.abs(vGap - bestVGap) < 1e-6 && ov > bestOverlap)) {
      bestVGap = vGap; bestOverlap = ov; best = item;
    }
  }
  return best ? { item: best, rule: 'column-header-above', metric: bestVGap } : null;
}

function findFallback(cand, pool) {
  // Broad fallback: nearest text run by a distance that heavily penalises being below the
  // field (labels are essentially always above or beside it, never under it).
  let best = null;
  let bestDist = Infinity;
  for (const item of pool) {
    const d = fallbackDistance(cand, item.bounds);
    if (d < bestDist) { bestDist = d; best = item; }
  }
  return best ? { item: best, rule: 'nearest-fallback', metric: bestDist } : null;
}

function findAnchor(cand, pool, kind) {
  // Same-line-touch first (checkbox/radio option words, or a comb's genuinely adjacent short
  // label), then the column header above, then the broad fallback. findSameLineTouch itself
  // screens out prose for combs (see looksLikeSentence) so this one order works for both kinds.
  const order = [findSameLineTouch, findColumnHeaderAbove, findFallback];
  for (const find of order) {
    const result = find(cand, pool, kind);
    if (result) return result;
  }
  return null;
}

// A short "(4)"-style digit/paren annotation is a normal part of a label and safe to absorb
// during growth. A multi-word parenthetical - a footnote like "(חובה לצרף אישור פ\"ש)" sitting
// right next to an option word with an ordinary word-gap - is a separate aside, not part of the
// field's own label, and growth must not silently swallow it (measured on itc101/checkbox-0032,
// whose label picked up exactly such a footnote). Anything with 3+ real words is prose, not an
// annotation, regardless of parens.
const GROWTH_REAL_WORD_LIMIT = 2;
function tooWordyToAbsorb(str) {
  return str.split(/\s+/).filter((w) => w.length >= 2).length > GROWTH_REAL_WORD_LIMIT;
}

/** Grow the anchor into a short phrase by pulling in immediately-adjacent same-line neighbours
 * (both directions) while the gap between consecutive runs stays tight - this is what turns a
 * single word like "מספר" into "מספר זהות" when the two are genuinely one printed phrase. */
function growPhrase(anchor, pool, excludeIds) {
  const used = new Set([anchor.id]);
  let items = [anchor];
  let grew = true;
  while (grew && items.length < MAX_MERGE_ITEMS) {
    grew = false;
    const left = Math.min(...items.map((i) => i.bounds.x));
    const rightEdge = Math.max(...items.map((i) => right(i.bounds)));
    if (rightEdge - left > MAX_MERGE_WIDTH) break;
    let nextRight = null; let nextRightGap = Infinity;
    let nextLeft = null; let nextLeftGap = Infinity;
    for (const item of pool) {
      if (used.has(item.id) || excludeIds.has(item.id)) continue;
      if (tooWordyToAbsorb(item.str)) continue;
      if (!items.some((i) => sameLine(i.bounds, item.bounds))) continue;
      if (item.bounds.x >= rightEdge - 0.002) {
        const gap = item.bounds.x - rightEdge;
        if (gap <= MERGE_GAP && gap < nextRightGap) { nextRightGap = gap; nextRight = item; }
      } else if (right(item.bounds) <= left + 0.002) {
        const gap = left - right(item.bounds);
        if (gap <= MERGE_GAP && gap < nextLeftGap) { nextLeftGap = gap; nextLeft = item; }
      }
    }
    if (nextRight && nextRightGap <= nextLeftGap) { items.push(nextRight); used.add(nextRight.id); grew = true; }
    else if (nextLeft) { items.push(nextLeft); used.add(nextLeft.id); grew = true; }
  }
  return items;
}

function labelCandidate(cand, textItems, excludedIds) {
  const pool = textItems.filter((t) => !excludedIds.has(t.id));
  const anchorPool = pool.filter((t) => !isPunctuationOnly(t.str));
  const anchor = findAnchor(cand.bounds, anchorPool, cand.kind);
  if (!anchor) return null;
  const phraseItems = growPhrase(anchor.item, pool, excludedIds);
  const label = assemblePhrase(phraseItems);
  if (!label) return null;
  const note = `${anchor.rule}(metric=${anchor.metric.toFixed(4)}, items=${phraseItems.length})`;
  return { label, note };
}

// ---- main ---------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const candidates = readJson(args.candidates);
  const rawTextItems = readJson(args.text);

  const textItems = rawTextItems
    .map((t, idx) => ({ id: `text-${idx}`, str: unmirrorParens(t.str, t.dir), dir: t.dir, bounds: t.bounds }))
    .filter((t) => t.str && t.str.trim().length > 0 && t.bounds.width > 0 && t.bounds.height >= 0);

  // Text that is mostly inside ANY candidate's own box is that field's own printed content (a
  // pre-filled digit, a checkbox's rendered square glyph) - never a label for anything.
  const excludedIds = new Set();
  for (const item of textItems) {
    for (const cand of candidates) {
      if (mostlyInside(item.bounds, cand.bounds)) { excludedIds.add(item.id); break; }
    }
  }

  const labelled = candidates.map((cand) => {
    const result = labelCandidate(cand, textItems, excludedIds);
    if (!result) return { ...cand };
    return { ...cand, label: result.label, notes: cand.notes ? `${cand.notes}; ${result.note}` : result.note };
  });

  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(labelled, null, 2)}\n`);

  const withLabel = labelled.filter((c) => c.label).length;
  // eslint-disable-next-line no-console
  console.log(`Labelled ${withLabel}/${labelled.length} candidates. Wrote ${args.out}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
