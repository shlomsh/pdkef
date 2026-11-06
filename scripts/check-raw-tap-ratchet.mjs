#!/usr/bin/env node
// Raw `touchscreen.tap(` in e2e specs only shrinks. Specs use tapUntil / tapOnce from
// e2e/support/touch.js, which survive Linux CI treating a tap as the second click of a double click.
// A higher count fails; a lower one fails too, telling you to lower RECORD.
//
//   node scripts/check-raw-tap-ratchet.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoFiles } from './repo-files.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RECORD = 0;

// Pure: { [file]: source } -> { total, files: { [file]: n } } for raw taps outside e2e/support/.
export function countRawTaps(sources) {
  const files = {};
  let total = 0;
  for (const [file, source] of Object.entries(sources)) {
    if (file.startsWith('e2e/support/')) continue;
    const n = source.split('touchscreen.tap(').length - 1;
    if (n > 0) { files[file] = n; total += n; }
  }
  return { total, files };
}

// Pure: recorded vs current count.
export function compareRawTaps(recorded, current) {
  return { failed: current > recorded, lowered: current < recorded };
}

function readSources() {
  const files = [...repoFiles(root, 'src', 'e2e')]
    .filter((f) => /\.spec\.js$/.test(f) && fs.existsSync(path.join(root, f)));
  const sources = {};
  for (const f of files) sources[f] = fs.readFileSync(path.join(root, f), 'utf8');
  return sources;
}

function main() {
  const { total, files } = countRawTaps(readSources());
  const { failed, lowered } = compareRawTaps(RECORD, total);
  if (failed) {
    console.error(`raw-tap ratchet: ${total} raw touchscreen.tap( in specs, the record is ${RECORD} (${Object.keys(files).join(', ')}). Use tapUntil or tapOnce from e2e/support/touch.js instead of raising the record.`);
    return 1;
  }
  if (lowered) {
    console.error(`raw-tap ratchet: ${RECORD} -> ${total} can be recorded. Lower RECORD in scripts/check-raw-tap-ratchet.mjs.`);
    return 1;
  }
  console.log(`raw-tap ratchet: ok (${total} raw taps in specs).`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main());
}
