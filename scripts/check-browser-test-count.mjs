#!/usr/bin/env node
// LAND-04: the number of tests the `browser` project runs is a ratchet that only shrinks, recorded as
// "browserTests": { "ci": N } in scripts/ratchet-limits.json. The input is the JSON report of a full
// `vitest run --project=browser`, since `vitest list` undercounts generated tests. A drop passes
// and prints the new record; nothing is written, as a filtered run would lower it. check-ratchet-raises
// refuses a raise.
//
//   npx vitest run --project=browser --reporter=default --reporter=json --outputFile.json=test-results/browser.json
//   node scripts/check-browser-test-count.mjs test-results/browser.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRatchetLimits } from './ratchet-limits.mjs';

// Pure: tests in a vitest JSON report, skipped ones included.
export function browserTestCount(report) {
  if (typeof report?.numTotalTests !== 'number') throw new Error('the report has no numTotalTests');
  if (report.numTotalTests === 0) throw new Error('the report has no browser tests');
  if (report.success !== true) throw new Error('the browser run failed, so its count may be short');
  return report.numTotalTests;
}

// Pure: failed when the count rose past the record; lowered when it fell below it.
export function compareBrowserTests(recorded, current) {
  return { failed: current > recorded, lowered: current < recorded };
}

function main([file]) {
  if (!file) throw new Error('usage: node scripts/check-browser-test-count.mjs <vitest json report>');
  const current = browserTestCount(JSON.parse(fs.readFileSync(file, 'utf8')));
  const limits = readRatchetLimits();
  const recorded = limits.browserTests.ci;
  const { failed, lowered } = compareBrowserTests(recorded, current);
  if (failed) {
    console.error(`browser test count: ${current} browser tests, the record is ${recorded}. Move one to jsdom or Node instead of raising the record (docs/landmines/no-test-doubles.md, "The browser layer stays small").`);
    return 1;
  }
  if (lowered) console.log(`browser test count: lower browserTests.ci in scripts/ratchet-limits.json, ${recorded} -> ${current}.`);
  console.log(`browser test count: ok (${current}, record ${recorded}).`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
