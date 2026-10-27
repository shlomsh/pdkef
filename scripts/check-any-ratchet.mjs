#!/usr/bin/env node
// ARCH-70: explicit `any` in the non-test .ts/.tsx under src/tools is a ratchet that only
// shrinks, recorded as "anyTypes": { "src/tools": N } in scripts/ratchet-limits.json. The
// check fails when the count rises. A drop passes; locally it also rewrites the record
// lower, in CI it only prints. ARCH-76's check-ratchet-raises refuses a raise of the record.
//
//   node scripts/check-any-ratchet.mjs          check (and lower the record outside CI)
//   node scripts/check-any-ratchet.mjs --init   write the current count
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankNonCode } from './check-hook-ratchet.mjs';
import { collectSourceFiles } from './import-graph.mjs';
import { readRatchetLimits, writeRatchetLimits } from './ratchet-limits.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAYER = 'src/tools';

// Every `any` type token, wherever it sits (annotation, cast, array, generic, tuple, union); not a
// property, an object key or a call that happens to be named any.
const ANY = /(?<![.\w$])any(?![\w$]|\s*[:(])/g;

// Pure: explicit `any` types in one source string.
export function countAny(source) {
  return [...blankNonCode(source).matchAll(ANY)].length;
}

// Pure: failed when the count rose past the record; lowered when it fell below it.
export function compareAny(recorded, current) {
  return { failed: current > recorded, lowered: current < recorded };
}

// Pure: the record to write after a clean run, or null when nothing may be written.
export function nextAnyRecord(recorded, current) {
  const { failed, lowered } = compareAny(recorded, current);
  return !failed && lowered ? current : null;
}

function measureTools() {
  let total = 0;
  for (const abs of collectSourceFiles(path.join(root, LAYER))) {
    if (!/\.tsx?$/.test(abs) || abs.endsWith('.d.ts')) continue;
    total += countAny(fs.readFileSync(abs, 'utf8'));
  }
  return total;
}

function main(args) {
  const limits = readRatchetLimits(root);
  const current = measureTools();
  const write = (n) => writeRatchetLimits({ ...limits, anyTypes: { [LAYER]: n } }, root);

  if (args.includes('--init')) {
    write(current);
    console.log(`any-ratchet: recorded ${current} explicit any in ${LAYER}.`);
    return 0;
  }

  const recorded = limits.anyTypes?.[LAYER] ?? 0;
  const next = nextAnyRecord(recorded, current);
  if (next !== null) {
    if (process.env.CI) console.log(`any-ratchet: the record can be lowered ${recorded} -> ${current} (run it locally to rewrite scripts/ratchet-limits.json).`);
    else { write(next); console.log(`any-ratchet: lowered the record ${recorded} -> ${current} in scripts/ratchet-limits.json.`); }
  }
  if (compareAny(recorded, current).failed) {
    console.error(`Any ratchet: ${LAYER} has ${current} explicit any, the record is ${recorded}. Use the real type (src/lib/pdfTypes.ts for pdf.js and pdf-lib) or unknown plus a guard instead of raising the record.`);
    return 1;
  }
  console.log(`any-ratchet: ok (${current} explicit any in ${LAYER}, record ${Math.min(recorded, current)}).`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
