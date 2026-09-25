#!/usr/bin/env node
/**
 * MOBI-10 spike CLI: closed table/box cells from vector ink + text, the "combined heuristic"
 * source.
 *
 * The algorithm itself lives in `src/tools/sign/fields/formCells.js` (lifted into product
 * code for MOBI-11). This is a thin wrapper: it converts between that module's page-percent
 * candidate/text-item shape and CONTRACT.md's 0..1-fraction JSON files, so the spike's scoring
 * pipeline (`score.mjs`, the committed `ground-truth/*.json`) keeps working unchanged and stays
 * a live regression check on the product code.
 *
 * Deliberately NOT re-detecting combs or checkboxes: `--baseline` (the
 * `candidates.pdfjs-layout.json` written by extract.mjs) already gets those at 100% precision,
 * and this skips any cell that overlaps one.
 *
 * Run from the repo root:
 *   node scripts/spike/mobi-10/cells.mjs --input <pdf> --page 1 \
 *     --baseline <candidates.pdfjs-layout.json> --text <text-items.json> \
 *     --out <candidates.combined-heuristic.json>
 *
 * See report-cells.md for the measured recall/precision per form and the seven documented
 * failure classes still open.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
import { detectPageCellCandidates } from '../../../src/tools/sign/fields/formCells.js';
import { reconcileFields } from '../../../src/tools/sign/fields/fieldRegions.js';

function parseArgs(argv) {
  const args = { page: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--input') args.input = argv[(i += 1)];
    else if (flag === '--page') args.page = Number(argv[(i += 1)]);
    else if (flag === '--baseline') args.baseline = argv[(i += 1)];
    else if (flag === '--text') args.text = argv[(i += 1)];
    else if (flag === '--out') args.out = argv[(i += 1)];
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!args.input || !args.baseline || !args.text || !args.out) {
    throw new Error(
      'Usage: cells.mjs --input <pdf> [--page 1] --baseline <candidates.pdfjs-layout.json> '
      + '--text <text-items.json> --out <candidates.combined-heuristic.json>',
    );
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// CONTRACT.md fraction (0..1, {x,y,width,height}) <-> product page-percent (0..100,
// {left,top,width,height}). The only unit conversion in this file; everything else is a
// straight pass-through of the product module's own logic.
const toPercent = (b) => ({ left: b.x * 100, top: b.y * 100, width: b.width * 100, height: b.height * 100 });
const toFraction = (b) => ({ x: b.left / 100, y: b.top / 100, width: b.width / 100, height: b.height / 100 });

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pageIndex = args.page - 1;
  const inputBytes = fs.readFileSync(path.resolve(args.input));

  const pdfDoc = await PDFDocument.load(inputBytes, { ignoreEncryption: true, updateMetadata: false });
  if (pageIndex >= pdfDoc.getPageCount()) {
    throw new Error(`--page ${args.page} is out of range; ${args.input} has ${pdfDoc.getPageCount()} page(s)`);
  }
  const page = pdfDoc.getPage(pageIndex);

  const baseline = readJson(args.baseline).map((c) => ({ ...toPercent(c.bounds), kind: c.kind, boxed: c.notes === 'boxed cells' }));
  const textItems = readJson(args.text).map((t) => ({ str: t.str, ...toPercent(t.bounds) }));

  // The same reconciliation the live hook does: a cell a comb or checkbox already claims is
  // not a candidate of its own (an open comb keeps it as its writable strip instead).
  const { cells } = reconcileFields({
    combs: baseline.filter((c) => c.kind === 'comb'),
    checkboxes: baseline.filter((c) => c.kind !== 'comb'),
    cells: detectPageCellCandidates(page, pageIndex, textItems),
  });
  const candidates = cells.map((c) => {
    const { left, top, width, height, ...rest } = c;
    return { ...rest, bounds: toFraction({ left, top, width, height }) };
  });

  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(candidates, null, 2)}\n`);

  const byKind = candidates.reduce((acc, c) => {
    acc[c.kind] = (acc[c.kind] || 0) + 1;
    return acc;
  }, {});
  // eslint-disable-next-line no-console
  console.log(
    `${path.basename(args.input)} page ${args.page}: candidates=${candidates.length} ${JSON.stringify(byKind)}`,
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
