#!/usr/bin/env node
// ARCH-76: fails when any value in scripts/ratchet-limits.json is higher than at the
// base (or a key was added to an existing section). `--base <ref>`; without it, the
// merge base with origin/main. A base that has no such file passes.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBase } from './change-scope.mjs';
import { findRaises, parseRenames, readRatchetLimits } from './ratchet-limits.mjs';

const gitIn = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

// Compares the limits file at `cwd`'s HEAD tree (the working copy) against `base`.
// Returns { status: 'no-base-file' | 'ok' | 'raised', raises }.
export function raisesSince(base, { cwd = process.cwd() } = {}) {
  let baseJson;
  try {
    baseJson = JSON.parse(gitIn(cwd, ['show', `${base}:scripts/ratchet-limits.json`]));
  } catch {
    return { status: 'no-base-file', raises: [] };
  }
  let renames = new Map();
  try {
    renames = parseRenames(gitIn(cwd, ['diff', '--name-status', '-M', base, 'HEAD']));
  } catch {
    // no rename information: compare keys as they are
  }
  const root = gitIn(cwd, ['rev-parse', '--show-toplevel']).trim();
  const raises = findRaises(baseJson, readRatchetLimits(root), renames);
  return { status: raises.length === 0 ? 'ok' : 'raised', raises };
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--base');
  const explicit = i >= 0 ? args[i + 1] : undefined;
  // An explicit base that does not resolve (a force-pushed `before`) falls back to the merge base.
  const base = resolveBase(explicit || undefined) ?? resolveBase(undefined);

  if (!base) {
    console.log('ratchet-raises: no usable base; nothing to compare against.');
    return 0;
  }
  const { status, raises } = raisesSince(base);
  if (status === 'no-base-file') {
    console.log(`ratchet-raises: ${base.slice(0, 7)} has no scripts/ratchet-limits.json; nothing to compare against.`);
    return 0;
  }
  if (status === 'ok') {
    console.log(`ratchet-raises: no limit rose since ${base.slice(0, 7)}.`);
    return 0;
  }
  console.error('Ratchet limits only go down. Narrow what the code carries instead of raising a limit:');
  for (const r of raises) {
    console.error(r.kind === 'added' ? `  ${r.path}: new entry (${JSON.stringify(r.after)}) in an existing section` : `  ${r.path}: ${r.before} -> ${r.after}`);
  }
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
