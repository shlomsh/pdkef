#!/usr/bin/env node
// ARCH-68: JavaScript sources are type-checked one folder at a time, and no new .js
// lands in the typed layers.
//  (a) Every non-test .js file in a folder listed in scripts/checkjs-folders.json starts
//      with `// @ts-check` (so the existing tsc typecheck covers it) and carries no
//      suppression (@ts-ignore, @ts-expect-error, @ts-nocheck) and no {any} / {*} JSDoc.
//  (b) The non-test .js/.jsx file count under src/lib, src/editor and src/shell is a
//      ratchet in scripts/ratchet-limits.json ("jsFiles"): it rises never, and a lower
//      count rewrites the record lower on a local run (CI only prints).
//
//   node scripts/check-js-typed.mjs          check (and lower records outside CI)
//   node scripts/check-js-typed.mjs --init   write the current counts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRatchetLimits, writeRatchetLimits } from './ratchet-limits.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const COUNTED_LAYERS = ['src/lib', 'src/editor', 'src/shell'];

const SUPPRESSIONS = ['@ts-ignore', '@ts-expect-error', '@ts-nocheck'];
// `{any}` / `{*}` or either nested in a generic or union, inside a JSDoc type brace.
const ANY_TYPE = /\{[^{}]*(?<![\w$.])(?:any|\*)(?![\w$])[^{}]*\}/;

const isTestPath = (file) => /\.(test|spec|test-helper)\.[^/]+$/.test(file) || file.split('/').includes('e2e');

// Pure: a non-test .js/.jsx source file.
export function isJsSource(file) {
  return /\.jsx?$/.test(file) && !isTestPath(file);
}

// Pure: { [file]: source } + listed folders -> [{ file, reason }].
export function findTypedViolations(sources, folders) {
  const violations = [];
  for (const [file, source] of Object.entries(sources)) {
    if (!/\.js$/.test(file) || isTestPath(file)) continue;
    if (!folders.some((d) => file.startsWith(`${d}/`) && !file.slice(d.length + 1).includes('/'))) continue;
    if (!/^\s*\/\/ @ts-check\b/.test(source)) violations.push({ file, reason: 'missing // @ts-check' });
    for (const s of SUPPRESSIONS) if (source.includes(s) && s !== '@ts-check') violations.push({ file, reason: `contains ${s}` });
    const any = source.split('\n').findIndex((l) => /^\s*(\*|\/\*\*|\/\/)/.test(l) && ANY_TYPE.test(l));
    if (any >= 0) violations.push({ file, reason: `JSDoc any/* type on line ${any + 1}` });
  }
  return violations;
}

// Pure: repo-relative paths -> { layer: count }.
export function countJsFiles(paths) {
  const counts = Object.fromEntries(COUNTED_LAYERS.map((l) => [l, 0]));
  for (const p of paths) {
    if (!isJsSource(p)) continue;
    const layer = COUNTED_LAYERS.find((l) => p.startsWith(`${l}/`));
    if (layer) counts[layer] += 1;
  }
  return counts;
}

// Pure: recorded vs current counts. failures: a count above its record (an unrecorded layer
// has record 0). lowered: a count under its record.
export function compareJsCounts(recorded, current) {
  const failures = [];
  const lowered = [];
  for (const layer of COUNTED_LAYERS) {
    const was = recorded[layer] ?? 0;
    const now = current[layer] ?? 0;
    if (now > was) failures.push({ layer, recorded: was, current: now });
    else if (now < was) lowered.push({ layer, from: was, to: now });
  }
  return { failures, lowered };
}

// Pure: the records to write after a clean run, or null when nothing may be written.
export function nextJsCounts(recorded, current) {
  const { failures, lowered } = compareJsCounts(recorded, current);
  if (failures.length > 0 || lowered.length === 0) return null;
  const next = { ...recorded };
  for (const l of lowered) next[l.layer] = l.to;
  return next;
}

function listFiles() {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'src'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter((f) => f && fs.existsSync(path.join(root, f)));
}

function main(args) {
  const files = listFiles();
  const folders = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'checkjs-folders.json'), 'utf8'));
  const sources = {};
  for (const f of files) if (/\.js$/.test(f) && folders.some((d) => f.startsWith(`${d}/`))) sources[f] = fs.readFileSync(path.join(root, f), 'utf8');
  const violations = findTypedViolations(sources, folders);

  const limits = readRatchetLimits(root);
  const current = countJsFiles(files);
  if (args.includes('--init')) {
    writeRatchetLimits({ ...limits, jsFiles: current }, root);
    console.log(`js-typed: recorded ${JSON.stringify(current)}.`);
    return 0;
  }
  const recorded = limits.jsFiles ?? {};
  const { failures, lowered } = compareJsCounts(recorded, current);

  if (lowered.length > 0) {
    const lines = lowered.map((l) => `  ${l.layer}: ${l.from} -> ${l.to}`);
    if (process.env.CI) {
      console.log(`js-typed: ${lowered.length} record(s) can be lowered (run it locally to rewrite scripts/ratchet-limits.json):\n${lines.join('\n')}`);
    } else {
      const next = violations.length === 0 ? nextJsCounts(recorded, current) : null;
      if (next) writeRatchetLimits({ ...limits, jsFiles: next }, root);
      console.log(`js-typed: ${next ? 'lowered' : 'would lower'} ${lowered.length} record(s):\n${lines.join('\n')}`);
    }
  }

  if (violations.length > 0) {
    console.error(`js-typed: ${violations.length} problem(s) in checkJs folders (${folders.join(', ')}):`);
    for (const v of violations) console.error(`  ${v.file}: ${v.reason}`);
  }
  if (failures.length > 0) {
    console.error('js-typed: new .js/.jsx file(s) in a typed layer. Write it as .ts instead of raising a record:');
    for (const f of failures) console.error(`  ${f.layer}: ${f.recorded} -> ${f.current} files`);
  }
  if (violations.length > 0 || failures.length > 0) return 1;
  console.log(`js-typed: ok (${folders.length} checkJs folder(s), counts ${JSON.stringify(current)}).`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
