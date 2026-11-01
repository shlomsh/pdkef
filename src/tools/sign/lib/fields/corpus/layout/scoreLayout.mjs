// Scores a page-layout reader against the layout corpus (README.md in this folder). Pure over data: pages
// come in as { raster, truth }, the reader under test comes in as `reader`. Everything a reader returns is in
// degraded-raster pixels; it is carried back to page points through the degradation's own unmapPoint, and
// every score is computed there, against the truth, in points or letter heights.
import { degrade, LEVELS } from '../snap/degrade.js';
import { summarise } from '../snap/snapStats.js';
import { greedyMatch } from '../scoring/match.js';
import { applyEdits } from './edits.mjs';
import { aimY, sampleSwipes, swipeable } from './sampleSwipes.mjs';
import { PINNED_ROWS } from './pinnedRows.mjs';

/** The views the layout corpus reads at: the whole page across a phone, and the 200 dpi master as is. */
export const LAYOUT_VIEWS = ['fit', 'native'];
/** Vertical IoU a found row needs with its truth row to count as that row (one to one). */
const ROW_IOU = 0.5;
/** A row "split" when the reader's row at the press covers less than this share of the truth row's width. */
const SPLIT_COVERAGE = 0.6;

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const verticalIou = (a, b) => {
  const inter = overlap(a.y0, a.y1, b.y0, b.y1);
  const union = a.y1 - a.y0 + (b.y1 - b.y0) - inter;
  return union > 0 ? inter / union : 0;
};
const quantile = (values, q) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const ratio = (n, d) => (d ? n / d : null);
const f1Of = ({ tp, fp, fn }) => {
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  return { tp, fp, fn, precision, recall, f1: precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null };
};

/** A raster row { x0, x1, y0, y1, gaps } in page points: ends at its mid-height, top and bottom at its mid-width. */
function rowToPage(row, unmapPoint) {
  const ym = (row.y0 + row.y1) / 2;
  const xm = (row.x0 + row.x1) / 2;
  return {
    x0: unmapPoint(row.x0, ym).x,
    x1: unmapPoint(row.x1, ym).x,
    y0: unmapPoint(xm, row.y0).y,
    y1: unmapPoint(xm, row.y1).y,
    gaps: (row.gaps ?? []).map(([s, e]) => [unmapPoint(s, ym).x, unmapPoint(e, ym).x]),
  };
}

/** Which column a found row sits in: 'span' when it reaches a letter past both sides of a gutter. */
function columnKey(row, truth) {
  const lh = truth.letterHeightPts;
  const cols = [...truth.columns].sort((a, b) => a.x0 - b.x0);
  for (let i = 1; i < cols.length; i++) {
    if (row.x0 < cols[i - 1].x1 - lh && row.x1 > cols[i].x0 + lh) return 'span';
  }
  let best = 'none';
  let most = 0;
  for (const c of truth.columns) {
    const o = overlap(row.x0, row.x1, c.x0, c.x1);
    if (o > most) {
      most = o;
      best = c.id;
    }
  }
  return best;
}

const truthKey = (row) => (row.spans ? 'span' : row.column ?? 'none');
const inIgnore = (truth, row) => (truth.ignore ?? []).some(([x0, y0, x1, y1]) => {
  const cx = (row.x0 + row.x1) / 2;
  const cy = (row.y0 + row.y1) / 2;
  return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
});

/**
 * One-to-one row matching on vertical IoU within a column (greedyMatch, with the column as its page key and
 * the bounds flattened to their vertical extent). Ignored truth rows absorb what matches them and are never
 * missed; found rows in an ignored region are dropped. Returns pairs and the counts behind row F1.
 */
/** @testSeam */
export function matchRows(truth, found) {
  const kept = found.filter((row) => !inIgnore(truth, row));
  const asTarget = (row, i, key) => ({ id: i, pageIndex: key, kind: 'row', bounds: { x: 0, width: 1, y: row.y0, height: row.y1 - row.y0 }, row });
  const targets = truth.rows.map((row, i) => asTarget(row, i, truthKey(row)));
  const candidates = kept.map((row, i) => asTarget(row, i, columnKey(row, truth)));
  const { matches, misses, falsePositives } = greedyMatch(targets, candidates, ROW_IOU);
  const pairs = matches.filter((m) => !m.t.row.ignore).map((m) => ({ truth: m.t.row, found: m.c.row, key: m.t.pageIndex }));
  return {
    pairs,
    tp: pairs.length,
    fn: misses.filter((t) => !t.row.ignore).length,
    fp: falsePositives.length,
    spanning: {
      tp: pairs.filter((p) => p.truth.spans).length,
      fn: misses.filter((t) => !t.row.ignore && t.row.spans).length,
      fp: falsePositives.filter((c) => c.pageIndex === 'span').length,
    },
  };
}

/** Word gaps of one matched row: truth gaps against found gaps, one to one by most overlap. */
/** @testSeam */
export function matchGaps(truthGaps, foundGaps) {
  const pairs = [];
  truthGaps.forEach((t, i) => foundGaps.forEach((f, j) => {
    const o = overlap(t[0], t[1], f[0], f[1]);
    if (o > 0) pairs.push({ i, j, o });
  }));
  pairs.sort((a, b) => b.o - a.o);
  const ti = new Set();
  const fj = new Set();
  for (const p of pairs) {
    if (ti.has(p.i) || fj.has(p.j)) continue;
    ti.add(p.i);
    fj.add(p.j);
  }
  return { tp: ti.size, fn: truthGaps.length - ti.size, fp: foundGaps.length - fj.size };
}

/** What the reader's row at a press says about one truth row: merged into a neighbour column, split, or fine. */
/** @testSeam */
export function probeOutcome(truthRow, found, truth) {
  if (!found) return 'none';
  const lh = truth.letterHeightPts;
  const others = truth.columns.filter((c) => c.id !== truthRow.column);
  if (others.some((c) => overlap(found.x0, found.x1, c.x0, c.x1) > lh)) return 'merged';
  const covered = overlap(found.x0, found.x1, truthRow.x0, truthRow.x1) / Math.max(1e-9, truthRow.x1 - truthRow.x0);
  return covered < SPLIT_COVERAGE ? 'split' : 'ok';
}

/** Degrees the degradation turned the page, read off its own mapping. */
function appliedSkewDeg(mapPoint) {
  const a = mapPoint(0, 0);
  const b = mapPoint(100, 0);
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/**
 * correct / wrong / declined for one swipe. bands: the reader's bands in page points ({ x0, x1, y0, y1 }),
 * top to bottom. A swipe is correct when it paints one band per expected row, each over its own row
 * (vertical IoU at least ROW_IOU), each end within a letter height of the word edge, and none reaching into
 * another column. A decoy is never correct: painting on a blank margin is wrong, a pin is a decline.
 */
/** @testSeam */
export function classifySwipe(swipe, bands, truth, startsOnText = true) {
  if (!startsOnText || !bands.length) return { outcome: 'declined', why: startsOnText ? 'no-bands' : 'not-on-text' };
  if (swipe.kind === 'decoy') return { outcome: 'wrong', why: 'band-on-blank' };
  const lh = truth.letterHeightPts;
  const rows = new Map(truth.rows.map((row) => [row.id, row]));
  const expected = swipe.expect.bands;
  const sorted = [...bands].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  for (const band of sorted) {
    const col = columnKey(band, truth);
    const home = rows.get(expected[0].rowId).column;
    if (col === 'span' || truth.columns.some((c) => c.id !== home && overlap(band.x0, band.x1, c.x0, c.x1) > lh)) return { outcome: 'wrong', why: 'cross-column' };
  }
  if (sorted.length !== expected.length) return { outcome: 'wrong', why: sorted.length < expected.length ? 'too-few-rows' : 'too-many-rows' };
  for (let k = 0; k < expected.length; k++) {
    const want = expected[k];
    const got = sorted[k];
    if (verticalIou(got, rows.get(want.rowId)) < ROW_IOU) return { outcome: 'wrong', why: 'wrong-row' };
    if (Math.abs(got.x0 - want.x0) > lh) return { outcome: 'wrong', why: 'left-end' };
    if (Math.abs(got.x1 - want.x1) > lh) return { outcome: 'wrong', why: 'right-end' };
  }
  return { outcome: 'correct', why: 'bands' };
}

/** A band in page percent (the swipe reader's output) in page points, through the degraded raster. */
function bandToPage(band, raster, unmapPoint) {
  const px = (v) => (v / 100) * raster.width;
  const py = (v) => (v / 100) * raster.height;
  return rowToPage({ x0: px(band.left), x1: px(band.left + band.width), y0: py(band.top), y1: py(band.top + band.height) }, unmapPoint);
}

/** Runs one swipe through the reader as the product does: a fresh reader, onText on the press, then bands. */
function runSwipe(reader, swipe, { raster, truth, mapPoint, unmapPoint }) {
  const pct = (p) => {
    const at = mapPoint(p.x, p.y);
    return { x: (at.x / raster.width) * 100, y: (at.y / raster.height) * 100 };
  };
  const swiper = reader.swipe(raster, { pageHeightPts: truth.pageHeightPts, direction: swipe.dir });
  if (!swiper) return { bands: [], startsOnText: false };
  const a = pct(swipe.a);
  const startsOnText = swiper.onText(a);
  const bands = startsOnText ? swiper.bandsBetween(a, pct(swipe.b)).map((band) => bandToPage(band, raster, unmapPoint)) : [];
  return { bands, startsOnText };
}

/** Probes for a layout reader: one press per swipeable truth row, at the middle of its letters. */
function probesFor(truth, mapPoint) {
  const lh = truth.letterHeightPts;
  return truth.rows.filter((row) => swipeable(row, lh)).map((row) => {
    const y = aimY(row);
    const at = mapPoint((row.x0 + row.x1) / 2, y);
    return { row, x: at.x, y: at.y, columnXs: truth.columns.map((c) => mapPoint((c.x0 + c.x1) / 2, y).x) };
  });
}

/** Scores one page at one level and view: every count behind the summary, nothing pooled yet. */
function scorePage({ raster, truth }, reader, { level, view, seed = 1, perPage = 36, decoys = 6, edits = [] }) {
  const d = degrade(applyEdits(raster, edits), { level, view, seed });
  const ctx = { raster: d.raster, truth, mapPoint: d.mapPoint, unmapPoint: d.unmapPoint };
  const lh = truth.letterHeightPts;

  const probes = probesFor(truth, d.mapPoint);
  const result = reader.layout(d.raster, { probes: probes.map(({ x, y, columnXs }) => ({ x, y, columnXs })), pageHeightPts: truth.pageHeightPts, direction: truth.direction });
  const found = result.rows.map((row) => rowToPage(row, d.unmapPoint));
  const match = matchRows(truth, found);

  const edges = [];
  let outward = 0;
  const gaps = { tp: 0, fp: 0, fn: 0 };
  for (const { truth: t, found: f } of match.pairs) {
    edges.push(Math.abs(f.x0 - t.x0) / lh, Math.abs(f.x1 - t.x1) / lh);
    if (f.x0 < t.x0 - lh || f.x1 > t.x1 + lh) outward++;
    const g = matchGaps(t.gaps, f.gaps);
    gaps.tp += g.tp;
    gaps.fp += g.fp;
    gaps.fn += g.fn;
  }

  const multi = truth.columns.length > 1;
  const probeTally = { ok: 0, merged: 0, split: 0, none: 0 };
  const columns = { probes: 0, countRight: 0, gutterErrPts: [] };
  const truthCols = [...truth.columns].sort((a, b) => a.x0 - b.x0);
  const truthGutters = truthCols.slice(1).map((c, i) => (truthCols[i].x1 + c.x0) / 2);
  probes.forEach((probe, i) => {
    const atRow = result.atProbe ? result.atProbe[i] : found.find((r) => probe.y >= r.y0 && probe.y <= r.y1) ?? null;
    if (multi) probeTally[probeOutcome(probe.row, atRow && (result.atProbe ? rowToPage(atRow, d.unmapPoint) : atRow), truth)]++;
    const spans = result.columnsAt?.[i];
    if (!multi || !spans) return;
    columns.probes++;
    const pageSpans = spans.map((s) => ({ x0: d.unmapPoint(s.x0, probe.y).x, x1: d.unmapPoint(s.x1, probe.y).x })).sort((a, b) => a.x0 - b.x0);
    if (pageSpans.length !== truthCols.length) return;
    columns.countRight++;
    pageSpans.slice(1).forEach((s, k) => columns.gutterErrPts.push(Math.abs((pageSpans[k].x1 + s.x0) / 2 - truthGutters[k])));
  });

  let order = null;
  if (result.order) {
    const rankOf = new Map(match.pairs.map((p) => [p.truth.id, result.order[result.rows.indexOf(result.rows[found.indexOf(p.found)])]]));
    const seq = truth.rows.filter((r) => rankOf.has(r.id));
    order = { agree: 0, pairs: Math.max(0, seq.length - 1) };
    for (let k = 1; k < seq.length; k++) if (rankOf.get(seq[k - 1].id) < rankOf.get(seq[k].id)) order.agree++;
  }
  const skew = typeof result.skewDeg === 'number' ? Math.abs(result.skewDeg - appliedSkewDeg(d.mapPoint)) : null;

  const swipes = sampleSwipes(truth, { seed, perPage, decoys }).map((swipe) => {
    const { bands, startsOnText } = runSwipe(reader, swipe, ctx);
    return { id: swipe.id, kind: swipe.kind, ...classifySwipe(swipe, bands, truth, startsOnText) };
  });

  return {
    pageId: truth.id, level, view,
    rows: { tp: match.tp, fp: match.fp, fn: match.fn },
    spanning: match.spanning,
    edges, outward, matched: match.pairs.length,
    gaps,
    probes: probeTally,
    columns,
    order,
    skew,
    swipes,
  };
}

const round = (v, digits = 4) => (v === null || v === undefined ? null : Math.round(v * 10 ** digits) / 10 ** digits);

/** Pools page scores into the corpus's headline numbers (README "Scores"). */
/** @testSeam */
export function summariseLayout(pageScores) {
  const sum = (pick) => pageScores.reduce((n, s) => n + pick(s), 0);
  const rows = f1Of({ tp: sum((s) => s.rows.tp), fp: sum((s) => s.rows.fp), fn: sum((s) => s.rows.fn) });
  const spanning = f1Of({ tp: sum((s) => s.spanning.tp), fp: sum((s) => s.spanning.fp), fn: sum((s) => s.spanning.fn) });
  const gaps = f1Of({ tp: sum((s) => s.gaps.tp), fp: sum((s) => s.gaps.fp), fn: sum((s) => s.gaps.fn) });
  const edges = pageScores.flatMap((s) => s.edges);
  const probed = sum((s) => s.probes.ok + s.probes.merged + s.probes.split + s.probes.none);
  const answered = probed - sum((s) => s.probes.none);
  const gutterErr = pageScores.flatMap((s) => s.columns.gutterErrPts);
  const ordered = pageScores.filter((s) => s.order);
  const skews = pageScores.map((s) => s.skew).filter((v) => v !== null);
  const cases = pageScores.flatMap((s) => s.swipes.map((w) => ({ formId: s.pageId, level: s.level, view: s.view, outcome: w.outcome, why: w.why })));
  const tally = summarise(cases);
  const why = {};
  for (const c of cases) if (c.outcome !== 'correct') why[`${c.outcome}:${c.why}`] = (why[`${c.outcome}:${c.why}`] ?? 0) + 1;
  return {
    rowF1: round(rows.f1), rowPrecision: round(rows.precision), rowRecall: round(rows.recall), rowCounts: { tp: rows.tp, fp: rows.fp, fn: rows.fn },
    crossColumnMergeRate: round(ratio(sum((s) => s.probes.merged), answered)),
    crossColumnSplitRate: round(ratio(sum((s) => s.probes.split), answered)),
    probeNoRowRate: round(ratio(sum((s) => s.probes.none), probed)),
    edgeErrorLh: { p50: round(quantile(edges, 0.5)), p90: round(quantile(edges, 0.9)) },
    marginSpeckRate: round(ratio(sum((s) => s.outward), sum((s) => s.matched))),
    wordGapF1: round(gaps.f1), wordGapCounts: { tp: gaps.tp, fp: gaps.fp, fn: gaps.fn },
    columnCountAccuracy: round(ratio(sum((s) => s.columns.countRight), sum((s) => s.columns.probes))),
    gutterErrorPts: { p50: round(quantile(gutterErr, 0.5)), p90: round(quantile(gutterErr, 0.9)) },
    spanningRowF1: round(spanning.f1), spanningCounts: { tp: spanning.tp, fp: spanning.fp, fn: spanning.fn },
    readingOrderAccuracy: ordered.length ? round(ratio(ordered.reduce((n, s) => n + s.order.agree, 0), ordered.reduce((n, s) => n + s.order.pairs, 0))) : null,
    skewErrorDeg: skews.length ? { p50: round(quantile(skews, 0.5)), p90: round(quantile(skews, 0.9)) } : null,
    swipes: {
      correct: tally.correct, wrong: tally.wrong, declined: tally.declined, total: tally.total,
      precision: round(tally.precision), lower: round(tally.lower), declineRate: round(tally.declineRate),
      why,
    },
  };
}

/**
 * Runs the corpus. pages: [{ raster, truth }]; reader: { layout, swipe } (README "The reader contract").
 * Returns every page score and the summary per level, per view, and per level and view.
 */
export function runLayoutCorpus({ pages, reader, levels = LEVELS, views = LAYOUT_VIEWS, seed = 1, perPage = 36, decoys = 6 }) {
  const scores = [];
  for (const page of pages) {
    for (const view of views) for (const level of levels) scores.push(scorePage(page, reader, { level, view, seed, perPage, decoys }));
  }
  const group = (key) => {
    const out = {};
    for (const s of scores) (out[key(s)] ||= []).push(s);
    return Object.fromEntries(Object.entries(out).map(([k, list]) => [k, summariseLayout(list)]));
  };
  return {
    scores,
    summary: {
      all: summariseLayout(scores),
      byLevel: group((s) => s.level),
      byView: group((s) => s.view),
      byLevelView: group((s) => `${s.level}/${s.view}`),
      byPage: group((s) => s.pageId),
    },
  };
}

/**
 * Runs the pinned rows (pinnedRows.js): each presses once on its target row of its page, with its dirt laid on
 * the master, and passes when the reader's row there is the truth row (probeOutcome 'ok', both ends within a
 * letter height). Returns [{ id, group, knownGap, pass, why }].
 */
export function runPinnedRows({ pages, reader, seed = 1, rows = PINNED_ROWS }) {
  return rows.map((pin) => {
    const page = pages.find((p) => p.truth.id === pin.page);
    if (!page) throw new Error(`pinned row ${pin.id}: no page ${pin.page}`);
    const { truth } = page;
    const row = pin.target(truth);
    const d = degrade(applyEdits(page.raster, pin.edits ? pin.edits(truth, row) : []), { level: pin.level, view: pin.view, seed });
    const y = aimY(row);
    const at = d.mapPoint((row.x0 + row.x1) / 2, y);
    const result = reader.layout(d.raster, { probes: [{ x: at.x, y: at.y, columnXs: [] }], pageHeightPts: truth.pageHeightPts, direction: truth.direction });
    const hit = result.atProbe?.[0] ?? null;
    const found = hit ? rowToPage(hit, d.unmapPoint) : null;
    const outcome = probeOutcome(row, found, truth);
    const lh = truth.letterHeightPts;
    const ends = found ? { left: Math.abs(found.x0 - row.x0) / lh, right: Math.abs(found.x1 - row.x1) / lh } : null;
    let why = outcome;
    if (outcome === 'ok' && (ends.left > 1 || ends.right > 1)) why = ends.left > 1 ? 'left-end' : 'right-end';
    return { id: pin.id, group: pin.group, knownGap: !!pin.knownGap, pass: why === 'ok', why };
  });
}

