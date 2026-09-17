#!/usr/bin/env node
/**
 * MOBI-10 spike CLI: geometric (no-model) label association.
 *
 * The algorithm itself lives in `src/editor/adapters/pdf/fieldLabels.js` (lifted into product
 * code for MOBI-11). This is a thin wrapper: it converts between that module's page-percent
 * candidate/text-item shape and CONTRACT.md's 0..1-fraction JSON files, so the spike's scoring
 * pipeline (`score.mjs`, the committed `ground-truth/*.json`) keeps working unchanged and stays
 * a live regression check on the product code.
 *
 * Run from the repo root:
 *   node scripts/spike/mobi-10/label.mjs --candidates <in.json> --text <text-items.json> --out <out.json>
 *
 * See report-labels.md for the measured label-association rate per form, the rules in plain
 * English, and the failure classes found while iterating on this algorithm.
 */

import fs from 'node:fs';
import path from 'node:path';
import { labelFieldCandidates } from '../../../src/editor/adapters/pdf/fieldLabels.js';

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

// CONTRACT.md fraction (0..1, {x,y,width,height}) <-> product page-percent (0..100,
// {left,top,width,height}). The only unit conversion in this file; everything else is a
// straight pass-through of the product module's own logic.
const toPercent = (b) => ({ left: b.x * 100, top: b.y * 100, width: b.width * 100, height: b.height * 100 });
const toFraction = (b) => ({ x: b.left / 100, y: b.top / 100, width: b.width / 100, height: b.height / 100 });

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const candidates = readJson(args.candidates);
  const textItems = readJson(args.text);

  const percentCandidates = candidates.map((c) => ({ ...c, ...toPercent(c.bounds) }));
  const percentTextItems = textItems.map((t) => ({ str: t.str, dir: t.dir, ...toPercent(t.bounds) }));

  const labelled = labelFieldCandidates(percentCandidates, percentTextItems).map((c) => {
    const { left, top, width, height, ...rest } = c;
    return { ...rest, bounds: toFraction({ left, top, width, height }) };
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
