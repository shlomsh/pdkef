#!/usr/bin/env node
// ARCH-76: fails when any value in scripts/ratchet-limits.json is higher than at the
// base (or a key was added to an existing section). `--base <ref>`; without it, the
// merge base with origin/main. A base that has no such file passes.
import { execFileSync } from 'node:child_process';
import { resolveBase } from './change-scope.mjs';
import { findRaises, parseRenames, readRatchetLimits } from './ratchet-limits.mjs';

const args = process.argv.slice(2);
const i = args.indexOf('--base');
const explicit = i >= 0 ? args[i + 1] : undefined;
// An explicit base that does not resolve (a force-pushed `before`) falls back to the merge base.
const base = resolveBase(explicit || undefined) ?? resolveBase(undefined);

if (!base) {
  console.log('ratchet-raises: no usable base; nothing to compare against.');
  process.exit(0);
}

let baseJson;
try {
  baseJson = JSON.parse(execFileSync('git', ['show', `${base}:scripts/ratchet-limits.json`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch {
  console.log(`ratchet-raises: ${base.slice(0, 7)} has no scripts/ratchet-limits.json; nothing to compare against.`);
  process.exit(0);
}

let renames = new Map();
try {
  renames = parseRenames(execFileSync('git', ['diff', '--name-status', '-M', base, 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch {
  // no rename information: compare keys as they are
}

const raises = findRaises(baseJson, readRatchetLimits(), renames);
if (raises.length === 0) {
  console.log(`ratchet-raises: no limit rose since ${base.slice(0, 7)}.`);
  process.exit(0);
}
console.error('Ratchet limits only go down. Narrow what the code carries instead of raising a limit:');
for (const r of raises) {
  console.error(r.kind === 'added' ? `  ${r.path}: new entry (${JSON.stringify(r.after)}) in an existing section` : `  ${r.path}: ${r.before} -> ${r.after}`);
}
process.exit(1);
