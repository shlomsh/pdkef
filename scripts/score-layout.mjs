#!/usr/bin/env node
/**
 * Scores today's page-layout reader against the layout corpus (READ-10) and diffs it, two ways, against
 * `layoutBaselines.json`: a number that fell is a regression, a number that rose is a gain nobody recorded,
 * and both fail until `--write` records them. A pinned row flipping either way fails the same.
 *
 * Usage:
 *   node --experimental-strip-types scripts/score-layout.mjs            print the scores and diff the baseline
 *   node --experimental-strip-types scripts/score-layout.mjs --write    record today's scores as the baseline
 *   ... --level scan --view native --page <id>                           narrow the run (never diffs)
 *
 * The reader is imported from `windowedReader.mjs`, the one place that names it; a new reader changes that
 * import, not this script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../src/tools/sign/lib/fields/corpus/snap/degrade.js';
import { loadLayoutPages } from '../src/tools/sign/lib/fields/corpus/layout/layoutStore.mjs';
import { runLayoutCorpus, runPinnedRows, LAYOUT_VIEWS } from '../src/tools/sign/lib/fields/corpus/layout/scoreLayout.mjs';
import { todaysReader } from '../src/tools/sign/lib/fields/corpus/layout/windowedReader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'src/tools/sign/lib/fields/corpus/layout/layoutBaselines.json');
/** A recorded number may move this far (absolute) without being a change: the corpus is seeded, so this is rounding. */
export const SLACK = 0.002;

const argv = process.argv.slice(2);
const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const write = argv.includes('--write');
const narrowed = ['--level', '--view', '--page'].some((f) => argv.includes(f));

/** Every number in a nested summary as { 'a.b.c': n }. */
export function flatten(value, prefix = '', out = {}) {
  if (typeof value === 'number') out[prefix] = value;
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/** Two-way diff of flattened numbers and pinned-row verdicts: [{ key, was, now }] for everything that moved. */
export function diffBaseline(recorded, current) {
  const moved = [];
  const a = { ...flatten(recorded.summary), ...Object.fromEntries(recorded.pinned.map((p) => [`pinned.${p.id}`, p.pass ? 1 : 0])) };
  const b = { ...flatten(current.summary), ...Object.fromEntries(current.pinned.map((p) => [`pinned.${p.id}`, p.pass ? 1 : 0])) };
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const was = a[key];
    const now = b[key];
    if (was === undefined || now === undefined || Math.abs(was - now) > SLACK) moved.push({ key, was, now });
  }
  return moved;
}

const pct = (v) => (v === null || v === undefined ? '  n/a' : `${(v * 100).toFixed(1).padStart(5)}`);
function print(result, pinned) {
  const head = 'level/view      rowF1 merge% split%  edge p50/p90 (lh)  speck%  gapF1  colCnt  spanF1  swipes ok/wrong/decl  lower  declined%';
  console.log(head);
  const rows = Object.entries(result.summary.byLevelView);
  for (const [key, s] of rows) {
    console.log(`${key.padEnd(14)} ${pct(s.rowF1)} ${pct(s.crossColumnMergeRate)} ${pct(s.crossColumnSplitRate)}  ${String(s.edgeErrorLh.p50).padStart(5)}/${String(s.edgeErrorLh.p90).padEnd(6)}       ${pct(s.marginSpeckRate)}  ${pct(s.wordGapF1)}  ${pct(s.columnCountAccuracy)}  ${pct(s.spanningRowF1)}   ${String(s.swipes.correct).padStart(3)}/${String(s.swipes.wrong).padStart(3)}/${String(s.swipes.declined).padStart(3)}      ${pct(s.swipes.lower)}   ${pct(s.swipes.declineRate)}`);
  }
  const all = result.summary.all;
  console.log(`\nall: rowF1 ${pct(all.rowF1)}  gutter error p50/p90 ${all.gutterErrorPts.p50}/${all.gutterErrorPts.p90} pt  swipe precision ${pct(all.swipes.precision)} (lower bound ${pct(all.swipes.lower)}, declined ${pct(all.swipes.declineRate)})`);
  console.log(`swipe misses: ${JSON.stringify(all.swipes.why)}`);
  console.log(`not reported by this reader: reading order ${all.readingOrderAccuracy}, skew ${JSON.stringify(all.skewErrorDeg)}`);
  console.log('\npinned rows');
  for (const p of pinned) console.log(`  ${p.pass ? 'pass' : 'FAIL'}  ${p.knownGap ? 'known gap' : 'pinned   '}  ${p.id.padEnd(18)} ${p.why}`);
}

const all = loadLayoutPages();
const pages = flag('--page') ? all.filter((p) => p.truth.id === flag('--page')) : all;
const levels = flag('--level') ? [flag('--level')] : LEVELS;
const views = flag('--view') ? [flag('--view')] : LAYOUT_VIEWS;
const t0 = Date.now();
const result = runLayoutCorpus({ pages, reader: todaysReader, levels, views });
const pinned = runPinnedRows({ pages: all, reader: todaysReader });
print(result, pinned);
console.log(`\n${pages.length} pages, ${levels.length} levels, ${views.length} views in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

const current = { reader: todaysReader.name, summary: { all: result.summary.all, byLevel: result.summary.byLevel, byLevelView: result.summary.byLevelView }, pinned: pinned.map(({ id, knownGap, pass, why }) => ({ id, knownGap, pass, why })) };
if (narrowed) process.exit(0);
if (write) {
  fs.writeFileSync(BASELINE, `${JSON.stringify(current, null, 1)}\n`);
  console.log(`wrote ${path.relative(ROOT, BASELINE)}`);
} else {
  const recorded = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const moved = diffBaseline(recorded, current);
  for (const m of moved) console.log(`${m.now > m.was ? 'gain' : 'drop'}  ${m.key}: ${m.was} -> ${m.now}`);
  if (moved.length) {
    console.error(`\n${moved.length} number(s) moved against layoutBaselines.json. If it is deliberate, re-record with --write; a gain nobody recorded is a baseline nobody can prove moved.`);
    process.exit(1);
  }
  console.log('\nmatches layoutBaselines.json');
}
