#!/usr/bin/env node
/**
 * Scores one form and prints the `baselines.json` row to paste.
 *
 * This is step 3 of "adding a scored form" in
 * `src/editor/adapters/pdf/corpus/README.md`, made executable, because the
 * step people skip is reading the numbers before writing them down. It also
 * runs the two checks that are easy to forget and expensive to miss:
 *
 * - **Provenance.** A ground-truth file records the `sha256` of the PDF it was
 *   annotated against. If the committed PDF is a different revision - a form
 *   re-issued next tax year, a re-download that silently got a newer file -
 *   every bound is measured against a page that no longer exists, and the
 *   score is meaningless rather than merely wrong. Mismatch is a hard failure.
 * - **Page size.** The contract's bounds are page fractions, so a truth file
 *   whose recorded `pageSize` differs from the PDF's is annotating a
 *   differently-sized page. Also a hard failure.
 *
 * `--all` (FORM-21) also prints a signed delta against `baselines.json` for
 * every form, every kind, and now (FORM-21 review) every raw count behind
 * them, and ends with one summary line: this is the same ratchet
 * `scoring.test.js` enforces, made readable without subtracting by eye. A
 * rise past `SLACK`, a kind appearing with nothing recorded for it, or a
 * value moving on or off a recorded `null` is not a failure of the detector,
 * it is an unrecorded change - `scoring.test.js` fails it too, so the fix is
 * to re-record, not to shrug it off. The verdict (`findings()`) mirrors
 * `scoring.test.js` check for check - same union of kinds, same floor and
 * ceiling pairs, same exact-count comparisons - and `--all` exits non-zero on
 * a "changed" form exactly as readily as on a "regressed" one, because vitest
 * fails both.
 *
 * Usage:
 *   node scripts/score-form.mjs --pdf <file.pdf> --truth <truth.json> [--page 0]
 *   node scripts/score-form.mjs --all      # every form in baselines.json
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '@cantoo/pdf-lib';
import { scoreForm, formatRow, SLACK } from '../src/editor/adapters/pdf/corpus/scoring/score.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINES = path.join(ROOT, 'src/editor/adapters/pdf/corpus/scoring/baselines.json');

function parseArgs(argv) {
  const args = { page: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--pdf') args.pdf = argv[(i += 1)];
    else if (argv[i] === '--truth') args.truth = argv[(i += 1)];
    else if (argv[i] === '--page') args.page = Number(argv[(i += 1)]);
    else if (argv[i] === '--all') args.all = true;
  }
  return args;
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fmtPct = (value) => (value === null ? 'n/a' : `${value.toFixed(1)}%`);
const round1 = (value) => (value === null ? null : +value.toFixed(1));

/** Hard failures, not warnings: a score measured against the wrong page is worse than no score. */
async function checkProvenance(pdf, truthPath, pageIndex, expected = {}) {
  const truth = JSON.parse(fs.readFileSync(truthPath, 'utf8'));
  const problems = [];
  const notes = [];
  const actual = sha256(pdf);

  // Two identities, and conflating them is how a score quietly stops meaning
  // anything. `truth.sha256` is the document somebody ANNOTATED. The baselines
  // row's `sha256` is the document we COMMITTED and score against. When they
  // are the same file, the score is against the real form. When they differ -
  // today, because both Hebrew forms are committed as geometry-only reductions
  // - the score is against a derivative, which is a caveat to carry loudly,
  // not an error. What IS an error is the committed file changing underneath a
  // recorded baseline, because then the number and the document disagree.
  if (expected.sha256 && actual !== expected.sha256) {
    problems.push(
      `the committed PDF changed: baselines.json records ${expected.sha256.slice(0, 16)}...\n`
      + `      but ${path.relative(ROOT, pdf)} is now ${actual.slice(0, 16)}...\n`
      + '      Re-score and re-record, or restore the file. The baseline describes a document, not a name.',
    );
  }
  if (!truth.sha256) {
    problems.push(`no sha256 in ${path.relative(ROOT, truthPath)} - add one, or provenance cannot be checked`);
  } else if (actual !== truth.sha256) {
    notes.push(
      `scored against a DERIVATIVE, not the annotated original `
      + `(${truth.sha256.slice(0, 12)}... -> ${actual.slice(0, 12)}...). `
      + 'Its numbers describe the derivative. See the form\'s note in baselines.json.',
    );
  }

  if (truth.pageSize) {
    const doc = await PDFDocument.load(fs.readFileSync(pdf), { ignoreEncryption: true });
    const { width, height } = doc.getPage(pageIndex).getSize();
    const off = Math.abs(width - truth.pageSize.width) > 0.5 || Math.abs(height - truth.pageSize.height) > 0.5;
    if (off) {
      problems.push(
        `page size mismatch: truth says ${truth.pageSize.width} x ${truth.pageSize.height}, `
        + `PDF page ${pageIndex} is ${width} x ${height}`,
      );
    }
  }
  return { problems, notes };
}

async function one({ pdf, truth, page, expected }) {
  const { problems, notes } = await checkProvenance(pdf, truth, page, expected);
  for (const note of notes) console.log(`  note   : ${note}`);
  if (problems.length > 0) {
    console.error(`\n  ${path.basename(pdf)} FAILED provenance:`);
    for (const problem of problems) console.error(`    - ${problem}`);
    return { ok: false };
  }
  const result = await scoreForm({ pdf, truth, pageIndex: page });
  console.log(`\n${formatRow(result)}`);
  console.log(`  by kind: ${Object.entries(result.byKind)
    .map(([kind, v]) => `${kind} R${fmtPct(v.recall)} P${fmtPct(v.precision)}`).join(', ')}`);
  if (result.misses.length > 0 && result.misses.length <= 12) {
    console.log(`  missed : ${result.misses.map((m) => `${m.kind}${m.label ? `:${m.label}` : ''}`).join(', ')}`);
  } else if (result.misses.length > 12) {
    console.log(`  missed : ${result.misses.length} targets`);
  }
  console.log('\n  baselines.json row (read these before you paste them):');
  // `precision` is null when the detector produced no candidates at all,
  // which is a real result rather than an error: a scanned page carries no
  // vector ink, so there is nothing to be precise about. Printing `null` is
  // what the row should say, and it is also what `scoring.test.js` reads to
  // know the form is pinning a zero. Calling toFixed on it used to crash the
  // run, right at the point where the most interesting form had most to say.
  // `targets`/`candidates`/`matched` (FORM-21 review) are the exact integers
  // the percentages above are computed from; scoring.test.js checks them
  // with exact equality, so paste them as printed, not rounded further.
  console.log(`    "targets": ${result.targets}, "candidates": ${result.candidates}, "matched": ${result.matched},`);
  console.log(`    "recall": ${round1(result.recall) ?? 'null'}, "precision": ${round1(result.precision) ?? 'null'},`);
  const byKind = Object.fromEntries(Object.entries(result.byKind)
    .map(([kind, v]) => [kind, {
      recall: round1(v.recall), targets: v.targets, found: v.found,
      precision: round1(v.precision), candidates: v.candidates, matchedCandidates: v.matchedCandidates,
    }]));
  console.log(`    "byKind": ${JSON.stringify(byKind)}`);
  return { ok: true, result };
}

/**
 * A signed delta against a recorded baseline, for the `--all` report.
 * `null` on either side is its own case, never coerced to 0: a baseline of
 * `null` means "no candidates recorded", not "0%", and treating it as 0
 * would print a fictitious delta the moment any candidate appears.
 */
function delta(actual, baseline) {
  if (actual === null && baseline === null) return { text: 'n/a', flag: 'same' };
  if (baseline === null || actual === null) {
    const was = baseline === null ? 'n/a' : `${baseline.toFixed(1)}%`;
    const now = actual === null ? 'n/a' : `${actual.toFixed(1)}%`;
    // Moving on or off "no candidates at all" is always worth a re-record,
    // whichever direction: scoring.test.js pins it exactly, both ways.
    return { text: `${was} -> ${now} (!)`, flag: baseline === null ? 'up' : 'down' };
  }
  const d = actual - baseline;
  const flag = d < -SLACK ? 'down' : d > SLACK ? 'up' : 'same';
  const mark = flag === 'down' ? ' v' : flag === 'up' ? ' ^' : '';
  // Both sides are already rounded to one decimal when they were recorded, so
  // a same-form re-run differs only by float noise (e.g. 88.888... vs the
  // recorded 88.9) - round before signing it, or that noise prints as a
  // spurious "-0.0" on a form that has not moved at all.
  const rounded = +d.toFixed(1) === 0 ? 0 : +d.toFixed(1);
  const sign = rounded >= 0 ? '+' : '';
  return { text: `${sign}${rounded.toFixed(1)}${mark}`, flag };
}

/**
 * A signed delta between two exact integers (FORM-21 review): the raw counts
 * a percentage is computed from. There is no `SLACK` here - scoring.test.js
 * checks these with exact equality, because a percentage that rounds the
 * same can still sit on different counts (targets and matched both scaling
 * together, say), and that is a change worth seeing even though `delta`
 * above would print "+0.0".
 */
function countDelta(actual, baseline) {
  const diff = actual - baseline;
  if (diff === 0) return { text: `${actual}`, flag: 'same' };
  const mark = diff < 0 ? ' v' : ' ^';
  const sign = diff > 0 ? '+' : '';
  return { text: `${actual} (${sign}${diff}${mark})`, flag: diff < 0 ? 'down' : 'up' };
}

/**
 * Every problem this form's actual result would raise in `scoring.test.js`
 * against its `baselines.json` row, sorted into `down` (a floor breach or a
 * kind that vanished entirely - a regression) and `up` (a ceiling breach, a
 * kind that appeared with no recorded baseline, or a value moving on or off
 * a recorded `null` - an unrecorded change, needing a re-record either way).
 * This exists so `--all`'s verdict cannot drift from vitest's: it walks the
 * same union of kinds the per-kind tests in `scoring.test.js` walk, checks
 * the same floor/ceiling pairs, and checks the same raw counts, rather than
 * approximating them from a separate, smaller set of pairs.
 */
function findings(result, spec) {
  const down = [];
  const up = [];
  const checkPct = (label, actual, baseline) => {
    const { flag, text } = delta(actual, baseline);
    if (flag === 'down') down.push(`${label} ${text}`);
    else if (flag === 'up') up.push(`${label} ${text}`);
  };
  const checkCount = (label, actual, baseline) => {
    const { flag, text } = countDelta(actual, baseline);
    if (flag === 'down') down.push(`${label} ${text}`);
    else if (flag === 'up') up.push(`${label} ${text}`);
  };

  checkPct('recall', result.recall, spec.recall);
  checkPct('precision', result.precision, spec.precision);
  checkCount('targets', result.targets, spec.targets);
  checkCount('candidates', result.candidates, spec.candidates);
  checkCount('matched', result.matched, spec.matched);

  const kinds = new Set([...Object.keys(spec.byKind ?? {}), ...Object.keys(result.byKind)]);
  for (const kind of kinds) {
    const floor = spec.byKind?.[kind];
    const actual = result.byKind[kind];
    if (!floor) {
      // Appeared: the actual run produced this kind and the baseline never
      // recorded it at all - as unrecorded as a rise, so it goes in `up`.
      if (actual.recall !== null) up.push(`${kind} recall appeared at ${actual.recall.toFixed(1)}%, not recorded`);
      if (actual.precision !== null) up.push(`${kind} precision appeared at ${actual.precision.toFixed(1)}%, not recorded`);
      continue;
    }
    if (!actual) {
      // Vanished: recorded, and the detector no longer produces this kind at
      // all - real information lost, so it goes in `down`.
      if (floor.recall !== null) down.push(`${kind} recall vanished (was ${floor.recall}%)`);
      if (floor.precision !== null) down.push(`${kind} precision vanished (was ${floor.precision}%)`);
      continue;
    }
    checkPct(`${kind} recall`, actual.recall, floor.recall);
    checkPct(`${kind} precision`, actual.precision, floor.precision);
    checkCount(`${kind} targets`, actual.targets, floor.targets);
    checkCount(`${kind} found`, actual.found, floor.found);
    checkCount(`${kind} candidates`, actual.candidates, floor.candidates);
    checkCount(`${kind} matchedCandidates`, actual.matchedCandidates, floor.matchedCandidates);
  }

  return { down, up };
}

const args = parseArgs(process.argv.slice(2));
let failed = false;

if (args.all) {
  const { forms } = JSON.parse(fs.readFileSync(BASELINES, 'utf8'));
  const tally = { changed: 0, unchanged: 0, regressed: 0 };
  for (const [name, spec] of Object.entries(forms)) {
    console.log(`\n=== ${name} ===`);
    const outcome = await one({
      pdf: path.join(ROOT, spec.pdf),
      truth: path.join(ROOT, spec.truth),
      page: spec.pageIndex ?? 0,
      expected: spec,
    });
    if (!outcome.ok) {
      failed = true;
      continue;
    }
    const { result } = outcome;
    const formDelta = `recall ${delta(result.recall, spec.recall).text}   precision ${delta(result.precision, spec.precision).text}`;
    console.log(`  Δ form : ${formDelta}`);
    const countsDelta = `targets ${countDelta(result.targets, spec.targets).text}   `
      + `candidates ${countDelta(result.candidates, spec.candidates).text}   `
      + `matched ${countDelta(result.matched, spec.matched).text}`;
    console.log(`  Δ counts: ${countsDelta}`);
    const kindDeltas = Object.keys({ ...spec.byKind, ...result.byKind }).sort().map((kind) => {
      const floor = spec.byKind?.[kind] ?? { recall: null, precision: null };
      const v = result.byKind[kind] ?? { recall: null, precision: null };
      return `${kind} R${delta(v.recall, floor.recall).text} P${delta(v.precision, floor.precision).text}`;
    });
    console.log(`  Δ kind : ${kindDeltas.join('   ')}`);

    // The verdict below is deliberately not derived from the `Δ` lines above:
    // it is built by `findings()`, the same union-of-kinds, same-floor/
    // ceiling-pairs, same-exact-count walk `scoring.test.js` does, so `--all`
    // cannot pass on a form vitest would fail (FORM-21 review) - printing a
    // gain as "improved" and letting only drops set the exit code was
    // exactly that gap.
    const { down, up } = findings(result, spec);
    const status = down.length > 0 ? 'regressed' : up.length > 0 ? 'changed' : 'unchanged';
    tally[status] += 1;
    if (status === 'regressed') {
      console.error(`  REGRESSED against the recorded baseline: ${down.join('; ')}`);
      failed = true;
    } else if (status === 'changed') {
      console.log(`  CHANGED beyond the recorded baseline, needs a re-record: ${up.join('; ')}`);
      failed = true;
    }
  }
  console.log(
    `\n=== summary: ${tally.changed} changed, ${tally.unchanged} unchanged, ${tally.regressed} regressed ===`,
  );
} else if (args.pdf && args.truth) {
  failed = !(await one({ pdf: path.resolve(args.pdf), truth: path.resolve(args.truth), page: args.page })).ok;
} else {
  console.error('Usage: node scripts/score-form.mjs --pdf <file.pdf> --truth <truth.json> [--page 0]');
  console.error('   or: node scripts/score-form.mjs --all');
  process.exitCode = 2;
}

if (failed) process.exitCode = 1;
