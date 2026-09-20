import fs from 'node:fs';
import { PDFDocument } from '@cantoo/pdf-lib';
import { greedyMatch } from './match.js';
import { detectPage } from '../detect.js';
import { toCandidates } from './candidates.js';

/**
 * Scores the product detector against a form's reviewed ground truth.
 *
 * The matching itself is MOBI-10's (`match.js`, lifted out of the spike): IoU
 * >= 0.5, one-to-one, greedy by IoU, with the kind-compatibility groups that
 * make a `date` candidate an acceptable answer to a `text` target and a
 * `signature` target answerable only by a signature. It is imported rather
 * than reimplemented, because two matchers would eventually disagree and the
 * numbers in `docs/mobi-10-field-map-spike.md` were measured with that one.
 *
 * What this adds is running it against *product* code on a *committed* file,
 * so it can be an assertion rather than an errand. MOBI-13 has the shape and
 * the one decision still open (today's Hebrew fixtures are geometry-only, so
 * their scores here are lower than the recorded ones - see the ticket).
 */

/** The matcher's IoU threshold, as every recorded number was measured at. */
export const IOU = 0.5;

/**
 * CONTRACT.md puts `pageIndex` on the ground-truth file, not on each target,
 * and `greedyMatch` compares it per record. `score.mjs`'s CLI does this same
 * normalisation; doing it in one shared place is what keeps the two honest.
 */
export function loadTruth(path) {
  const truth = JSON.parse(fs.readFileSync(path, 'utf8'));
  return {
    ...truth,
    targets: (truth.targets ?? []).map((target) => ({ pageIndex: truth.pageIndex ?? 0, ...target })),
  };
}

const pct = (numerator, denominator) => (denominator > 0 ? (numerator / denominator) * 100 : null);

/**
 * @param {{pdf: string, truth: string, pageIndex?: number}} form
 * @returns {Promise<{recall: number|null, precision: number|null, targets: number,
 *   candidates: number, matched: number, misses: Array, falsePositives: Array, byKind: object}>}
 */
export async function scoreForm({ pdf, truth: truthPath, pageIndex = 0 }) {
  const truth = loadTruth(truthPath);
  const doc = await PDFDocument.load(fs.readFileSync(pdf), { ignoreEncryption: true });
  const candidates = toCandidates(detectPage(doc.getPage(pageIndex), pageIndex), pageIndex);
  const { matches, misses, falsePositives } = greedyMatch(truth.targets, candidates, IOU);

  // Per kind, read from the target side: "of the N signature targets, how many
  // did some compatible candidate find?". `score.mjs`'s own table explains why
  // precision cannot be read from the same side - a compatible-but-not-exact
  // match has no single kind describing both ends - so this keeps only the
  // half a ratchet needs per kind, and precision stays a whole-form number.
  const byKind = {};
  for (const target of truth.targets) {
    byKind[target.kind] ??= { targets: 0, found: 0 };
    byKind[target.kind].targets += 1;
  }
  for (const match of matches) byKind[match.t.kind].found += 1;
  for (const kind of Object.keys(byKind)) {
    byKind[kind].recall = pct(byKind[kind].found, byKind[kind].targets);
  }

  return {
    form: truth.form,
    targets: truth.targets.length,
    candidates: candidates.length,
    matched: matches.length,
    recall: pct(matches.length, truth.targets.length),
    precision: pct(matches.length, candidates.length),
    byKind,
    misses: misses.map((t) => ({ id: t.id, kind: t.kind, label: t.label })),
    falsePositives: falsePositives.map((c) => ({ id: c.id, kind: c.kind })),
  };
}

/** A fixed-width row, so a failing run reads as a table in the log. */
export const formatRow = (r) => `${String(r.form).padEnd(24)} targets ${String(r.targets).padStart(3)}`
  + `  found ${String(r.matched).padStart(3)}`
  + `  recall ${r.recall === null ? '  n/a' : `${r.recall.toFixed(1)}%`.padStart(6)}`
  + `  precision ${r.precision === null ? '  n/a' : `${r.precision.toFixed(1)}%`.padStart(6)}`;
