#!/usr/bin/env node
// ARCH-79: a fixed `waitForTimeout` in an e2e spec stands in for a condition and is
// the usual source of load-sensitive failures. The number of call sites is a ratchet
// that only shrinks, recorded as "e2eSleeps.waitForTimeout" in scripts/ratchet-limits.json.
// It fails above the record; a lower count rewrites the record locally (CI only prints).
// ARCH-76's check-ratchet-raises refuses any raise of the record itself.
//
//   node scripts/check-e2e-sleeps.mjs          check (and lower the record outside CI)
//   node scripts/check-e2e-sleeps.mjs --init   write the current count
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRatchetLimits, writeRatchetLimits } from './ratchet-limits.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Pure: is this repo-relative path a Playwright spec the ratchet counts?
export function isE2eSpec(file) {
  return /\.spec\.js$/.test(file) && (file.startsWith('e2e/') || /^src\/.*\/e2e\//.test(file));
}

// Pure: `.waitForTimeout(` call sites in one source string, comments skipped.
export function countSleeps(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  return (code.match(/\.waitForTimeout\(/g) ?? []).length;
}

// Pure: failed when the current count is above the record.
export function compareSleeps(recorded, current) {
  return { failed: current > recorded, recorded, current };
}

// Pure: the value to write after a passing run, or null when nothing may be written.
export function nextSleepLimit(recorded, current) {
  return current < recorded ? current : null;
}

function countTree() {
  const files = execFileSync('git', ['ls-files', 'e2e', 'src'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter((f) => f && isE2eSpec(f) && fs.existsSync(path.join(root, f)));
  return files.reduce((sum, f) => sum + countSleeps(fs.readFileSync(path.join(root, f), 'utf8')), 0);
}

function main(args) {
  const limits = readRatchetLimits(root);
  const current = countTree();
  if (args.includes('--init')) {
    writeRatchetLimits({ ...limits, e2eSleeps: { waitForTimeout: current } }, root);
    console.log(`e2e-sleeps: recorded ${current} waitForTimeout call(s).`);
    return 0;
  }
  const recorded = limits.e2eSleeps?.waitForTimeout ?? 0;
  const { failed } = compareSleeps(recorded, current);
  if (failed) {
    console.error(`E2e sleeps: ${current} waitForTimeout call(s), record is ${recorded}. Wait on a condition (expect(locator)..., expect.poll) instead of raising the record.`);
    return 1;
  }
  const next = nextSleepLimit(recorded, current);
  if (next !== null) {
    if (process.env.CI) console.log(`e2e-sleeps: record can be lowered ${recorded} -> ${next} (run it locally to rewrite scripts/ratchet-limits.json).`);
    else {
      writeRatchetLimits({ ...limits, e2eSleeps: { ...limits.e2eSleeps, waitForTimeout: next } }, root);
      console.log(`e2e-sleeps: lowered the record ${recorded} -> ${next} in scripts/ratchet-limits.json.`);
    }
  }
  console.log(`e2e-sleeps: ok (${current} waitForTimeout, record ${next ?? recorded}).`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
