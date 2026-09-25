#!/usr/bin/env node
/**
 * MOBI-10 spike: scores a candidate file against a ground-truth file.
 *
 * Matching (per CONTRACT.md): a candidate matches a target when same
 * `pageIndex`, compatible `kind`, and IoU >= --iou (default 0.5). Matching is
 * one-to-one, greedy by IoU (highest-IoU pairs claimed first).
 *
 * Kind compatibility: exact match; 'unknown' matches anything; the group
 * {'text','table-cell','date'} is mutually compatible; the group
 * {'checkbox','radio'} is mutually compatible, and so is {'comb','date'}. Nothing else is.
 *
 * Per-kind rows read from two sides, because a compatible-but-not-exact match
 * (e.g. a 'radio' candidate matching a 'checkbox' target) has no single kind
 * that describes both ends:
 *   - targets / misses / recall are grouped by the TARGET's kind ("of the
 *     checkbox targets, how many did some compatible candidate find?").
 *   - detected / FP / precision are grouped by the CANDIDATE's kind ("of the
 *     radio candidates, how many were correct?").
 *   - TP on a kind row is the target-side count (targets - misses). The
 *     "total" row does not have this ambiguity: every match is exactly one
 *     target and one candidate, so total TP is just matches.length however
 *     you slice it.
 *
 * Run from the repo root:
 *   node scripts/spike/mobi-10/score.mjs --truth <ground-truth.json> \
 *     --candidates <candidates.json> [--iou 0.5] --out <report.json>
 */

import fs from 'node:fs';
import path from 'node:path';
// The matching itself lives with the scored corpus now (MOBI-13); this CLI
// is a wrapper over it so the two can never disagree.
import { greedyMatch, iou, kindsCompatible } from '../../../src/tools/sign/fields/corpus/scoring/match.js';

export { greedyMatch, iou, kindsCompatible };

function parseArgs(argv) {
  const args = { iou: 0.5 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--truth') args.truth = argv[(i += 1)];
    else if (flag === '--candidates') args.candidates = argv[(i += 1)];
    else if (flag === '--iou') args.iou = Number(argv[(i += 1)]);
    else if (flag === '--out') args.out = argv[(i += 1)];
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!args.truth || !args.candidates || !args.out) {
    throw new Error(
      'Usage: score.mjs --truth <ground-truth.json> --candidates <candidates.json> [--iou 0.5] --out <report.json>',
    );
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// 'date' sits in both groups: a date is drawn either as a blank line (text-like)
// or as a comb of digit cells; which one is a label question, not a geometry one.
const normalizeWhitespace = (s) => (s || '').trim().replace(/\s+/g, ' ');

/** Correct when candidate.label and target.label, whitespace-normalized, contain one another. */
function labelAssociationCorrect(target, candidate) {
  if (!candidate.label) return false;
  const t = normalizeWhitespace(target.label);
  const c = normalizeWhitespace(candidate.label);
  if (!t || !c) return false;
  return t.includes(c) || c.includes(t);
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function scoreKindRow(kind, targets, candidates, matches) {
  const targetsOfKind = targets.filter((t) => t.kind === kind);
  const candidatesOfKind = candidates.filter((c) => c.kind === kind);
  const matchedTargetIds = new Set(matches.map((m) => m.t.id));
  const matchedCandidateIds = new Set(matches.map((m) => m.c.id));

  const tp = targetsOfKind.filter((t) => matchedTargetIds.has(t.id)).length;
  const misses = targetsOfKind.length - tp;
  const tpAsCandidate = candidatesOfKind.filter((c) => matchedCandidateIds.has(c.id)).length;
  const fp = candidatesOfKind.length - tpAsCandidate;

  return {
    kind,
    targets: targetsOfKind.length,
    detected: candidatesOfKind.length,
    TP: tp,
    FP: fp,
    misses,
    recall: ratio(tp, targetsOfKind.length),
    precision: ratio(tpAsCandidate, candidatesOfKind.length),
  };
}

function scoreConfidenceBand(candidates, matchedCandidateIds, predicate) {
  const band = candidates.filter(predicate);
  const tp = band.filter((c) => matchedCandidateIds.has(c.id)).length;
  return { count: band.length, TP: tp, FP: band.length - tp, precision: ratio(tp, band.length) };
}

function formatPct(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function printTable(report) {
  const rows = [...report.byKind, { ...report.total, kind: 'TOTAL' }];
  const cols = ['kind', 'targets', 'detected', 'TP', 'FP', 'misses', 'recall', 'precision'];
  const widths = Object.fromEntries(cols.map((c) => [c, c.length]));
  const formatted = rows.map((row) => ({
    kind: row.kind,
    targets: String(row.targets),
    detected: String(row.detected),
    TP: String(row.TP),
    FP: String(row.FP),
    misses: String(row.misses),
    recall: formatPct(row.recall),
    precision: formatPct(row.precision),
  }));
  for (const row of formatted) for (const c of cols) widths[c] = Math.max(widths[c], row[c].length);

  const line = (cells) => cols.map((c) => cells[c].padEnd(widths[c])).join('  ');
  // eslint-disable-next-line no-console
  console.log(line(Object.fromEntries(cols.map((c) => [c, c]))));
  for (const row of formatted) console.log(line(row)); // eslint-disable-line no-console

  // eslint-disable-next-line no-console
  console.log(
    `\nlabel association: ${report.labelAssociation.correct}/${report.labelAssociation.evaluated} `
    + `(${formatPct(report.labelAssociation.rate)}) of matched pairs with a truth label`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `confidence calibration: >=0.8 precision ${formatPct(report.confidenceCalibration.highConfidence.precision)} `
    + `(n=${report.confidenceCalibration.highConfidence.count}), `
    + `<0.8 precision ${formatPct(report.confidenceCalibration.lowConfidence.precision)} `
    + `(n=${report.confidenceCalibration.lowConfidence.count})`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const truth = readJson(args.truth);
  // CONTRACT.md puts pageIndex on the ground-truth file, not on each target.
  const targets = (truth.targets || []).map((t) => ({ pageIndex: truth.pageIndex ?? 0, ...t }));
  const candidates = readJson(args.candidates);

  const { matches, misses, falsePositives } = greedyMatch(targets, candidates, args.iou);
  const matchedCandidateIds = new Set(matches.map((m) => m.c.id));

  const kinds = [...new Set([...targets.map((t) => t.kind), ...candidates.map((c) => c.kind)])].sort();
  const byKind = kinds.map((kind) => scoreKindRow(kind, targets, candidates, matches));

  const total = {
    targets: targets.length,
    detected: candidates.length,
    TP: matches.length,
    FP: candidates.length - matches.length,
    misses: targets.length - matches.length,
    recall: ratio(matches.length, targets.length),
    precision: ratio(matches.length, candidates.length),
  };

  const labelable = matches.filter((m) => normalizeWhitespace(m.t.label));
  const labelCorrect = labelable.filter((m) => labelAssociationCorrect(m.t, m.c));
  const labelAssociation = {
    evaluated: labelable.length,
    correct: labelCorrect.length,
    rate: ratio(labelCorrect.length, labelable.length),
  };

  const confidenceCalibration = {
    highConfidence: scoreConfidenceBand(candidates, matchedCandidateIds, (c) => c.confidence >= 0.8),
    lowConfidence: scoreConfidenceBand(candidates, matchedCandidateIds, (c) => c.confidence < 0.8),
  };

  const report = {
    truth: path.basename(args.truth),
    candidates: path.basename(args.candidates),
    iouThreshold: args.iou,
    total,
    byKind,
    labelAssociation,
    confidenceCalibration,
    misses: misses.map((t) => ({ id: t.id, kind: t.kind, bounds: t.bounds, label: t.label })),
    falsePositives: falsePositives.map((c) => ({
      id: c.id, kind: c.kind, bounds: c.bounds, confidence: c.confidence, source: c.source,
    })),
  };

  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);

  printTable(report);
  // eslint-disable-next-line no-console
  console.log(`\nWrote ${args.out}`);
}

// Only run as a CLI when invoked directly; scored functions are also
// imported for the scorer's own fixture-based self-test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  });
}
