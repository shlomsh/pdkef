#!/usr/bin/env node
// ARCH-76: fails when any value in scripts/ratchet-limits.json, or any per-file count in a
// `allow` map of .oxlintrc.json rule options, is higher than at the base (or a key was added
// to an existing section), except an allow count for a file the base had and the change leaves
// untouched: only a rule that now sees more can raise that one. `--base <ref>`; without it, the
// merge base with origin/main. A base that has neither file passes.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { resolveBase } from './change-scope.mjs';
import { findRaises, parseRenames, readRatchetLimits } from './ratchet-limits.mjs';
import { isEntry } from './is-entry.mjs';

const gitIn = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Pure. { "oxlint:<rule>": { <path>: <count> } } for every rule configured as
// [severity, { allow: {...} }]; the prefix keeps the sections apart from ratchet-limits ones.
export function oxlintAllowSections(oxlintrc) {
  const sections = {};
  for (const [rule, config] of Object.entries(oxlintrc?.rules ?? {})) {
    const allow = Array.isArray(config) ? config[1]?.allow : undefined;
    if (isObject(allow)) sections[`oxlint:${rule}`] = allow;
  }
  return sections;
}

const readJsonAt = (cwd, base, file) => {
  try {
    return JSON.parse(gitIn(cwd, ['show', `${base}:${file}`]));
  } catch {
    return undefined;
  }
};

// Compares the working copy's limits file and .oxlintrc.json in `cwd`'s repo against `base`.
// Returns { status: 'no-base-file' | 'ok' | 'raised', raises }.
export function raisesSince(base, { cwd = process.cwd() } = {}) {
  const baseLimits = readJsonAt(cwd, base, 'scripts/ratchet-limits.json');
  const baseOxlint = readJsonAt(cwd, base, '.oxlintrc.json');
  if (baseLimits === undefined && baseOxlint === undefined) return { status: 'no-base-file', raises: [] };
  let renames = new Map();
  try {
    renames = parseRenames(gitIn(cwd, ['diff', '--name-status', '-M', base, 'HEAD']));
  } catch {
    // no rename information: compare keys as they are
  }
  const root = gitIn(cwd, ['rev-parse', '--show-toplevel']).trim();
  let headOxlint;
  try {
    headOxlint = JSON.parse(fs.readFileSync(path.join(root, '.oxlintrc.json'), 'utf8'));
  } catch {
    headOxlint = undefined;
  }
  // A base without the limits file contributes no limits sections, so none of the head's count as raises.
  const baseJson = { ...(baseLimits ?? {}), ...oxlintAllowSections(baseOxlint) };
  const headJson = { ...(baseLimits === undefined ? {} : readRatchetLimits(root)), ...oxlintAllowSections(headOxlint) };
  const untouched = untouchedSince(cwd, base);
  const oxlintSections = Object.keys(oxlintAllowSections(headOxlint));
  const raises = findRaises(baseJson, headJson, renames).filter((r) => {
    const section = oxlintSections.find((s) => r.path.startsWith(`${s}.`));
    return !(section && untouched(r.path.slice(section.length + 1)));
  });
  return { status: raises.length === 0 ? 'ok' : 'raised', raises };
}

// A file the base had and this change leaves as it was cannot have gained a finding of its own: a higher
// count there means the rule now sees more (a landmines upgrade), so its new allowance is the baseline.
// Padding one leaves no headroom: landmines reports an allow count above the file's real count, so
// `lint:landmines` holds every count exact and this exception can only ever match what the rule finds.
function untouchedSince(cwd, base) {
  let changed;
  try {
    // Working tree against the base: every file the base had that this change edits, deletes or untracks.
    changed = new Set(gitIn(cwd, ['diff', '--name-only', '--no-renames', base]).split('\n').filter(Boolean));
  } catch {
    return () => false;
  }
  return (file) => {
    if (changed.has(file)) return false;
    try {
      gitIn(cwd, ['cat-file', '-e', `${base}:${file}`]);
      return true;
    } catch {
      return false;
    }
  };
}

export function main(argv = [], { cwd = process.cwd(), log = console.log, err = console.error } = {}) {
  const i = argv.indexOf('--base');
  const explicit = i >= 0 ? argv[i + 1] : undefined;
  const run = (args) => gitIn(cwd, args).trim();
  // An explicit base that does not resolve (a force-pushed `before`) falls back to the merge base.
  const base = resolveBase(explicit || undefined, run) ?? resolveBase(undefined, run);

  if (!base) {
    log('ratchet-raises: no usable base; nothing to compare against.');
    return 0;
  }
  const { status, raises } = raisesSince(base, { cwd });
  if (status === 'no-base-file') {
    log(`ratchet-raises: ${base.slice(0, 7)} has no scripts/ratchet-limits.json or .oxlintrc.json; nothing to compare against.`);
    return 0;
  }
  if (status === 'ok') {
    log(`ratchet-raises: no limit rose since ${base.slice(0, 7)}.`);
    return 0;
  }
  err('Ratchet limits and oxlint allowances only go down. Narrow what the code carries instead of raising a limit:');
  for (const r of raises) {
    err(r.kind === 'added' ? `  ${r.path}: new entry (${JSON.stringify(r.after)}) in an existing section` : `  ${r.path}: ${r.before} -> ${r.after}`);
  }
  return 1;
}

if (isEntry(import.meta.url)) process.exit(main(process.argv.slice(2)));
