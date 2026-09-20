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
 * Usage:
 *   node scripts/score-form.mjs --pdf <file.pdf> --truth <truth.json> [--page 0]
 *   node scripts/score-form.mjs --all      # every form in baselines.json
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '@cantoo/pdf-lib';
import { scoreForm, formatRow } from '../src/editor/adapters/pdf/corpus/scoring/score.js';

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
    .map(([kind, v]) => `${kind} ${v.found}/${v.targets} (${v.recall.toFixed(0)}%)`).join(', ')}`);
  if (result.misses.length > 0 && result.misses.length <= 12) {
    console.log(`  missed : ${result.misses.map((m) => `${m.kind}${m.label ? `:${m.label}` : ''}`).join(', ')}`);
  } else if (result.misses.length > 12) {
    console.log(`  missed : ${result.misses.length} targets`);
  }
  const byKind = Object.fromEntries(Object.entries(result.byKind).map(([k, v]) => [k, +v.recall.toFixed(1)]));
  console.log('\n  baselines.json row (read these before you paste them):');
  // `precision` is null when the detector produced no candidates at all,
  // which is a real result rather than an error: a scanned page carries no
  // vector ink, so there is nothing to be precise about. Printing `null` is
  // what the row should say, and it is also what `scoring.test.js` reads to
  // know the form is pinning a zero. Calling toFixed on it used to crash the
  // run, right at the point where the most interesting form had most to say.
  const pct = (value) => (value === null ? 'null' : value.toFixed(1));
  console.log(`    "recall": ${pct(result.recall)}, "precision": ${pct(result.precision)},`);
  console.log(`    "byKind": ${JSON.stringify(byKind)}`);
  return { ok: true, result };
}

const args = parseArgs(process.argv.slice(2));
let failed = false;

if (args.all) {
  const { forms } = JSON.parse(fs.readFileSync(BASELINES, 'utf8'));
  for (const [name, spec] of Object.entries(forms)) {
    console.log(`\n=== ${name} ===`);
    const outcome = await one({
      pdf: path.join(ROOT, spec.pdf),
      truth: path.join(ROOT, spec.truth),
      page: spec.pageIndex ?? 0,
      expected: spec,
    });
    if (!outcome.ok) failed = true;
    else {
      // A null on either side means "no candidates", which `drop` cannot
      // compare and must not silently read as zero.
      const drop = (a, b) => a !== null && b !== null && a < b - 0.05;
      if (drop(outcome.result.recall, spec.recall) || drop(outcome.result.precision, spec.precision)) {
        console.error(`  BELOW BASELINE (${spec.recall}% / ${spec.precision}%)`);
        failed = true;
      }
    }
  }
} else if (args.pdf && args.truth) {
  failed = !(await one({ pdf: path.resolve(args.pdf), truth: path.resolve(args.truth), page: args.page })).ok;
} else {
  console.error('Usage: node scripts/score-form.mjs --pdf <file.pdf> --truth <truth.json> [--page 0]');
  console.error('   or: node scripts/score-form.mjs --all');
  process.exitCode = 2;
}

if (failed) process.exitCode = 1;
