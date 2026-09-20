import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument } from '@cantoo/pdf-lib';
import { greedyMatch } from './match.js';
import { detectPage } from '../detect.js';
import { toCandidates } from './candidates.js';
import { toPageTextRuns } from '../../textRuns.js';
import { createPageGeometry } from '../../../../geometry/coords.ts';
import { pageCropBox } from '../../pageInk.js';

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
 * so it can be an assertion rather than an errand.
 *
 * **It reads the page's text, because the product does.** The element corpus
 * beside this one deliberately does not (`detect.js` says why): it measures
 * geometry rules in isolation and a second parser would only add noise. A
 * *score* is the opposite case. `formCells.js` uses real text runs for label
 * lookup and to drop explanatory prose, so a score taken without them is a
 * score of a pipeline we do not ship - and it is not a small difference:
 * leaving text out costs the health declaration 14 points of precision
 * (94.2% -> 80.2%) and form 101 four (91.4% -> 87.2%). Those were read as
 * fixture damage until both originals were committed and the numbers did not
 * move. See MOBI-13.
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
 * The page's text runs, read in Node the way the viewer reads them in the
 * browser: pdf.js's legacy build (no worker, no DOM), then the one shared
 * conversion in `textRuns.js`. The font and cMap directories have to be named
 * explicitly off disk - the browser build resolves them relative to a URL that
 * does not exist here - and a form whose text cannot be read scores on its
 * geometry alone rather than failing the run, because a scanned form has no
 * text layer to read and is still a form we want scored.
 */
async function pageTextRuns(bytes, pageIndex, geometry) {
  const require = createRequire(import.meta.url);
  const pdfjsDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: `${path.join(pdfjsDir, 'standard_fonts')}${path.sep}`,
    cMapUrl: `${path.join(pdfjsDir, 'cmaps')}${path.sep}`,
    cMapPacked: true,
    useSystemFonts: false,
  });
  try {
    const doc = await loading.promise;
    const { items } = await (await doc.getPage(pageIndex + 1)).getTextContent();
    return toPageTextRuns(items, geometry);
  } finally {
    await loading.destroy();
  }
}

/**
 * @param {{pdf: string, truth: string, pageIndex?: number}} form
 * @returns {Promise<{recall: number|null, precision: number|null, targets: number,
 *   candidates: number, matched: number, misses: Array, falsePositives: Array, byKind: object}>}
 */
export async function scoreForm({ pdf, truth: truthPath, pageIndex = 0 }) {
  const truth = loadTruth(truthPath);
  const bytes = fs.readFileSync(pdf);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const page = doc.getPage(pageIndex);
  const textRuns = await pageTextRuns(bytes, pageIndex, createPageGeometry({
    cropBox: pageCropBox(page),
    rotation: page.getRotation().angle,
  }));
  const candidates = toCandidates(detectPage(page, pageIndex, textRuns), pageIndex);
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
