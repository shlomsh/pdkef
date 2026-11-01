// Deterministic swipe sampling for the layout corpus (README "Swipes"). Page points, y down.
import { mulberry32 } from '../snap/prng.js';

/** The same string hash the snap sampler seeds from, so a page id means the same draw everywhere. */
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Rows a person reads and would swipe: counted, in a column, at least four letters wide. */
export const swipeable = (row, lh) => !row.ignore && row.column !== null && row.x1 - row.x0 >= 4 * lh;

/** Runs of consecutive rows (in reading order) of one column of one zone: a swipe never leaves its run. */
export function columnRuns(truth) {
  const lh = truth.letterHeightPts;
  const runs = [];
  let run = null;
  for (const row of truth.rows) {
    if (row.ignore) continue;
    if (!swipeable(row, lh)) {
      run = null;
      continue;
    }
    if (run && run[0].column === row.column) run.push(row);
    else runs.push((run = [row]));
  }
  return runs;
}

/** Word starts and ends along a row, in reading order: where a press and a release land. */
export function wordEdges(row) {
  const lefts = [row.x0, ...row.gaps.map((g) => g[1])];
  const rights = [...row.gaps.map((g) => g[0]), row.x1];
  return row.dir === 'rtl' ? { starts: [...rights].reverse(), ends: [...lefts].reverse() } : { starts: lefts, ends: rights };
}

/**
 * The bands a swipe from (row i0, start) to (row i1, end) should paint, in reading order: the first row from
 * the press to its line end, the rows between whole, the last from its line start to the release.
 */
export function expectedBands(rows, start, end) {
  const rtl = rows[0].dir === 'rtl';
  if (rows.length === 1) return [{ rowId: rows[0].id, x0: Math.min(start, end), x1: Math.max(start, end) }];
  return rows.map((row, k) => {
    if (k === 0) return { rowId: row.id, x0: rtl ? row.x0 : start, x1: rtl ? start : row.x1 };
    if (k === rows.length - 1) return { rowId: row.id, x0: rtl ? end : row.x0, x1: rtl ? row.x1 : end };
    return { rowId: row.id, x0: row.x0, x1: row.x1 };
  });
}

/** Where a finger aims on a row: the middle of its letters, not the middle of its box. */
export const aimY = (row) => row.baseline - 0.35 * row.size;

/**
 * Seeded swipes over one page's truth. Each is { id, kind: 'swipe', a, b, dir, expect: { bands } } or a
 * decoy { id, kind: 'decoy', a, b, dir, expect: { decline: 'margin' } } pressed in a blank margin. A fixed
 * count per page so the denominators never move by accident.
 */
export function sampleSwipes(truth, { seed = 1, perPage = 36, decoys = 6 } = {}) {
  const rng = mulberry32((seed ^ hashString(truth.id)) >>> 0);
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const uniform = (a, b) => a + rng() * (b - a);
  const lh = truth.letterHeightPts;
  const runs = columnRuns(truth);
  const weighted = runs.flatMap((run) => run.map((_, i) => ({ run, i })));
  const swipes = [];
  for (let n = 0; weighted.length && n < perPage; n++) {
    const { run, i } = pick(weighted);
    const r = rng();
    const want = r < 0.4 ? 1 : r < 0.75 ? 2 : 3;
    const rows = run.slice(i, Math.min(run.length, i + want));
    const first = wordEdges(rows[0]);
    const last = wordEdges(rows[rows.length - 1]);
    const rtl = rows[0].dir === 'rtl';
    const sign = rtl ? -1 : 1;
    let starts = first.starts.slice(0, -1);
    if (!starts.length) starts = [first.starts[0]];
    const start = pick(starts);
    // A single-row swipe ends at least two letters past its press.
    const ends = rows.length === 1 ? last.ends.filter((e) => sign * (e - start) >= 2 * lh) : last.ends;
    const end = ends.length ? pick(ends) : last.ends[last.ends.length - 1];
    const a = { x: start + sign * uniform(0.1, 0.4) * lh, y: aimY(rows[0]) + uniform(-0.15, 0.15) * rows[0].size };
    const b = { x: end - sign * uniform(0.1, 0.4) * lh, y: aimY(rows[rows.length - 1]) + uniform(-0.15, 0.15) * rows[rows.length - 1].size };
    swipes.push({ id: `${truth.id}#s${n}`, kind: 'swipe', a, b, dir: rows[0].dir, expect: { bands: expectedBands(rows, start, end) } });
  }
  // Decoys: pressed in a page margin at least three letters from any row's ends, released two lines lower.
  const cols = truth.columns;
  const textLeft = Math.min(...truth.rows.map((row) => row.x0));
  const textRight = Math.max(...truth.rows.map((row) => row.x1));
  const margins = [[lh, textLeft - 3 * lh], [textRight + 3 * lh, truth.pageWidthPts - lh]].filter(([x0, x1]) => x1 - x0 >= lh);
  const bodyRows = truth.rows.filter((row) => swipeable(row, lh));
  // Blank means blank: not on an ignored region either (the arXiv stamp is ink in the left margin).
  const inIgnore = (p) => (truth.ignore ?? []).some(([ix0, iy0, ix1, iy1]) => p.x >= ix0 && p.x <= ix1 && p.y >= iy0 - 3 * lh && p.y <= iy1 + 3 * lh);
  for (let n = 0, tries = 0; cols.length && margins.length && bodyRows.length && n < decoys && tries < 20 * decoys; tries++) {
    const [x0, x1] = pick(margins);
    const row = pick(bodyRows);
    const x = uniform(x0, x1);
    const a = { x, y: aimY(row) };
    if (inIgnore(a)) continue;
    const b = { x: Math.min(x1, Math.max(x0, x + uniform(-1, 1) * lh)), y: aimY(row) + 2.5 * row.size };
    swipes.push({ id: `${truth.id}#d${n}`, kind: 'decoy', a, b, dir: truth.direction, expect: { decline: 'margin' } });
    n++;
  }
  return swipes;
}
