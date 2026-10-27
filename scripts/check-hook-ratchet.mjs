#!/usr/bin/env node
// ARCH-66: hooks and effects per component file are a ratchet that only shrinks. Every
// .tsx/.jsx file under src/ with more than 10 hook calls is recorded at its current
// hook and effect counts under "hooks" in scripts/ratchet-limits.json. The check fails
// when either number of a record rises or an unrecorded file crosses the threshold. A
// drop passes; locally it also rewrites the record lower (or drops it), in CI it only
// prints. ARCH-76's check-ratchet-raises refuses any raise of the records themselves.
//
//   node scripts/check-hook-ratchet.mjs          check (and lower records outside CI)
//   node scripts/check-hook-ratchet.mjs --init   write the current snapshot
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSourceFiles } from './import-graph.mjs';
import { readRatchetLimits, writeRatchetLimits } from './ratchet-limits.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Comments and the insides of string and template literals blanked to spaces (newlines
// kept), so a hook name in prose or text is not a call. Regex literals are not tracked.
function blankNonCode(source) {
  let out = '';
  let quote = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') { out += ' '; if (i + 1 < source.length) out += source[i + 1] === '\n' ? '\n' : ' '; i++; continue; }
      if (c === quote || (c === '\n' && quote !== '`')) { quote = null; out += c; } else out += c === '\n' ? '\n' : ' ';
    } else if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
    } else if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') { out += ' '; i++; }
      i--;
    } else if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop - 1;
    } else out += c;
  }
  return out;
}

const HOOK_CALL = /(?<!function\s+)\b(use[A-Z]\w*)\s*\(/g;
const EFFECTS = new Set(['useEffect', 'useLayoutEffect']);

// Pure: hook calls and effect calls in one source string.
export function countHooks(source) {
  let hooks = 0;
  let effects = 0;
  for (const m of blankNonCode(source).matchAll(HOOK_CALL)) {
    hooks++;
    if (EFFECTS.has(m[1])) effects++;
  }
  return { hooks, effects };
}

// Pure: { [file]: { hooks, effects } } -> the records worth keeping.
export function snapshotHooks(measured, { fileThreshold }) {
  return Object.fromEntries(Object.entries(measured).filter(([, m]) => m.hooks > fileThreshold).map(([f, m]) => [f, { hooks: m.hooks, effects: m.effects }]));
}

// Pure: recorded vs current (both snapshot-shaped). A failure is a record where either
// number rose, or an unrecorded file over the threshold; `lowered` lists records where
// a number fell or the file left the snapshot (to null).
export function compareHooks(recorded, current, { fileThreshold }) {
  const failures = [];
  const lowered = [];
  for (const [key, now] of Object.entries(current)) {
    const was = recorded[key] ?? { hooks: fileThreshold, effects: Infinity };
    if (now.hooks > was.hooks || now.effects > was.effects) failures.push({ key, recorded: recorded[key] ?? null, current: now });
  }
  for (const [key, was] of Object.entries(recorded)) {
    const now = current[key];
    if (now === undefined) lowered.push({ key, from: was, to: null });
    else if (now.hooks < was.hooks || now.effects < was.effects) lowered.push({ key, from: was, to: { hooks: Math.min(now.hooks, was.hooks), effects: Math.min(now.effects, was.effects) } });
  }
  return { failures, lowered };
}

// Pure: the records to write after a clean run, or null when nothing may be written.
export function nextHookRecords(recorded, current, thresholds) {
  const { failures, lowered } = compareHooks(recorded, current, thresholds);
  if (failures.length > 0 || lowered.length === 0) return null;
  const next = { ...recorded };
  for (const l of lowered) {
    if (l.to === null) delete next[l.key];
    else next[l.key] = l.to;
  }
  return next;
}

function measureTree() {
  const measured = {};
  for (const abs of collectSourceFiles(path.join(root, 'src'))) {
    if (!/\.[jt]sx$/.test(abs)) continue;
    measured[path.relative(root, abs).split(path.sep).join('/')] = countHooks(fs.readFileSync(abs, 'utf8'));
  }
  return measured;
}

const show = (r) => (r ? `${r.hooks} hooks, ${r.effects} effects` : 'unrecorded');

function main(args) {
  const limits = readRatchetLimits(root);
  const section = limits.hooks ?? { files: {} };
  const thresholds = { fileThreshold: section.fileThreshold ?? 10 };
  const current = snapshotHooks(measureTree(), thresholds);

  if (args.includes('--init')) {
    writeRatchetLimits({ ...limits, hooks: { ...thresholds, files: current } }, root);
    console.log(`hook-ratchet: recorded ${Object.keys(current).length} files over ${thresholds.fileThreshold} hooks.`);
    return 0;
  }

  const recorded = section.files ?? {};
  const { failures, lowered } = compareHooks(recorded, current, thresholds);

  if (lowered.length > 0) {
    const lines = lowered.map((l) => `  ${l.key}: ${show(l.from)} -> ${l.to ? show(l.to) : 'under the threshold (record dropped)'}`);
    if (process.env.CI) {
      console.log(`hook-ratchet: ${lowered.length} record(s) can be lowered (run it locally to rewrite scripts/ratchet-limits.json):\n${lines.join('\n')}`);
    } else {
      const next = nextHookRecords(recorded, current, thresholds);
      if (next) writeRatchetLimits({ ...limits, hooks: { ...thresholds, files: next } }, root);
      console.log(`hook-ratchet: ${next ? 'lowered' : 'would lower'} ${lowered.length} record(s)${next ? ' in scripts/ratchet-limits.json' : ' (nothing written while the run fails)'}:\n${lines.join('\n')}`);
    }
  }

  if (failures.length > 0) {
    console.error(`Hook ratchet: ${failures.length} file(s) gained hooks or effects past their record. Move the logic into a reducer or a pure module instead of raising a record:`);
    for (const f of failures) console.error(`  ${f.key}: ${show(f.recorded)} -> ${show(f.current)}`);
    return 1;
  }
  console.log(`hook-ratchet: ok (${Object.keys(current).length} files over ${thresholds.fileThreshold} hooks).`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
