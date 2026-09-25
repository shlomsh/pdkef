#!/usr/bin/env node
// ARCH-27 spike: does a small, hand-written project-dependents table replace
// Nx's project-graph "affected" computation in scripts/affected-scope.mjs's
// oracle? See backlog/tasks/ARCH-27.md. Throwaway - not wired into ci.yml or
// package.json, and not exercised by check:fast; deleting this file changes
// no CI behaviour.
//
// The oracle (deriveScope in ../../affected-scope.mjs) takes three things:
// the changed files, the set of "affected" Nx projects, and a project ->
// root-directory map. Owning a file by longest-prefix root is not what Nx
// buys you - a plain path map does that trivially. Nx's real value is
// `affected` also naming every project that *depends on* an owner, found by
// walking the import graph. This script replaces only that one input with a
// hand-written table (DEPENDENTS below) and reuses every other piece of the
// real oracle unchanged - deriveScope, ownerOf, toolNameOf, siteE2eOwnPaths,
// projectRoots - so this cannot silently diverge from the real oracle's
// *decision* logic. The only thing under test is whether the table is as
// good as asking Nx.
//
// Usage:
//   node scripts/spike/arch-27/path-map-replay.mjs --files a,b,c
//   node scripts/spike/arch-27/path-map-replay.mjs --base <sha> --head <sha>
//   node scripts/spike/arch-27/path-map-replay.mjs --base <sha> --head <sha> --roots-file <graph.json>
//
// Prints { files, owners, affected, scope } as JSON. `--roots-file` points at
// a previously captured `nx graph --file=...` JSON (used by ARCH-27's replay
// driver so it can compare the path map against the real Nx affected list at
// each historical push's own commit, with both sides using the same roots -
// see the ticket for why the driver itself is scratch, not committed).
// Without it, this reads the roots of the checkout it runs in.

import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveScope, ownerOf, toolNameOf, siteE2eOwnPaths } from '../../affected-scope.mjs';
import { changedFiles } from '../../change-scope.mjs';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../..');

// affected-scope.mjs's own `projectRoots()` is not exported (and this spike
// must not edit that file - see ARCH-27), so this is a standalone copy of
// just the "ask Nx for each project's declared root" half - not the decision
// logic under test, only the plumbing to call `nx graph` the same way the
// real oracle does.
function projectRoots() {
  const dir = mktempGraphDir();
  const file = join(dir, 'graph.json');
  try {
    execFileSync('npx', ['nx', 'graph', `--file=${file}`], {
      encoding: 'utf8',
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, NX_DAEMON: 'false' },
    });
    return rootsFromGraphFile(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function mktempGraphDir() {
  return mkdtempSync(join(tmpdir(), 'arch27-nx-graph-'));
}

// --- The hand-written table ------------------------------------------------
// Derived ONCE, by hand, from the real project graph at HEAD (2026-09-25,
// main tip 3b29e15d) - never recomputed automatically, which is the whole
// point of the comparison (a real hand-kept map would not update itself
// either). Built by:
//
//   NX_DAEMON=false npx nx graph --file=/tmp/graph.json
//
// then inverting every edge in graph.graph.dependencies (a -> b means "a
// depends on b") and taking the transitive closure: if a depends on b and b
// depends on c, then a is a transitive dependent of c, so a change owned by
// c must also mark a affected. Only projects with at least one dependent are
// listed; a project absent here (e.g. every tool-<name> project, and
// font-assets/i18n's own transitive closure is folded into the CORE_PROJECTS
// entries below since they sit on the editor/lib/site cycle) has none.
//
// Two things worth naming rather than burying in the data: (1) editor, lib,
// site, site-test and i18n all resolve to the *same* dependent set, because
// the real graph has a cycle - editor -> site -> editor (site depends on
// editor, editor depends on site) - so each pulls in the whole component.
// None of this matters for deriveScope's own CORE_PROJECTS rule (site,
// shell, editor, lib already force "everything" regardless of what else is
// in `affected`), but it does matter for whether a *tool* project ends up
// affected transitively through one of these, which this table reproduces
// exactly the way the real graph would. (2) this is genuinely the "second
// hand-written map" ARCH-20 declined to build (see that ticket and this
// one's own "Why" section) - it is inferred from one snapshot of the graph,
// not measured against every push, which is exactly what ARCH-27's replay
// driver does with it.
export const DEPENDENTS = {
  editor: [
    'cross-tool-tests', 'editor-ui', 'export-guards', 'fonts', 'form-corpus', 'i18n', 'lib',
    'seo-content-guards', 'shell', 'sign-spike-mobi10', 'site', 'site-e2e', 'tool-compress',
    'tool-edit-pages', 'tool-image-to-pdf', 'tool-merge', 'tool-redact', 'tool-security',
    'tool-sign', 'tool-split', 'tool-to-image', 'tooling',
  ],
  i18n: [
    'cross-tool-tests', 'editor', 'editor-ui', 'export-guards', 'fonts', 'form-corpus', 'lib',
    'seo-content-guards', 'shell', 'sign-spike-mobi10', 'site', 'site-e2e', 'tool-compress',
    'tool-edit-pages', 'tool-image-to-pdf', 'tool-merge', 'tool-redact', 'tool-security',
    'tool-sign', 'tool-split', 'tool-to-image', 'tooling',
  ],
  lib: [
    'cross-tool-tests', 'editor', 'editor-ui', 'export-guards', 'fonts', 'form-corpus', 'i18n',
    'seo-content-guards', 'shell', 'sign-spike-mobi10', 'site', 'site-e2e', 'tool-compress',
    'tool-edit-pages', 'tool-image-to-pdf', 'tool-merge', 'tool-redact', 'tool-security',
    'tool-sign', 'tool-split', 'tool-to-image', 'tooling',
  ],
  site: [
    'cross-tool-tests', 'editor', 'editor-ui', 'export-guards', 'fonts', 'form-corpus', 'i18n',
    'lib', 'seo-content-guards', 'shell', 'sign-spike-mobi10', 'site-e2e', 'tool-compress',
    'tool-edit-pages', 'tool-image-to-pdf', 'tool-merge', 'tool-redact', 'tool-security',
    'tool-sign', 'tool-split', 'tool-to-image', 'tooling',
  ],
  'site-test': [
    'cross-tool-tests', 'editor', 'editor-ui', 'export-guards', 'fonts', 'form-corpus', 'i18n',
    'lib', 'seo-content-guards', 'shell', 'sign-spike-mobi10', 'site', 'site-e2e', 'tool-compress',
    'tool-edit-pages', 'tool-image-to-pdf', 'tool-merge', 'tool-redact', 'tool-security',
    'tool-sign', 'tool-split', 'tool-to-image', 'tooling',
  ],
  shell: [
    'cross-tool-tests', 'editor-ui', 'export-guards', 'site-e2e', 'tool-compress',
    'tool-edit-pages', 'tool-image-to-pdf', 'tool-merge', 'tool-redact', 'tool-security',
    'tool-sign', 'tool-split', 'tool-to-image', 'tooling',
  ],
  'editor-ui': ['cross-tool-tests', 'export-guards', 'site-e2e', 'tool-redact', 'tool-sign', 'tooling'],
  'font-assets': ['cross-tool-tests', 'export-guards', 'fonts'],
  fonts: ['cross-tool-tests', 'export-guards'],
  'form-corpus': ['sign-spike-mobi10', 'tooling'],
  'export-guards': ['cross-tool-tests'],
  'tool-sign': ['cross-tool-tests', 'export-guards', 'site-e2e', 'tooling'],
  'tool-redact': ['cross-tool-tests', 'site-e2e', 'tooling'],
  'tool-compress': ['site-e2e'],
  'tool-merge': ['site-e2e'],
  'tool-split': ['site-e2e'],
  'tool-edit-pages': ['site-e2e'],
  'tool-to-image': ['site-e2e'],
  'tool-image-to-pdf': ['site-e2e'],
  'tool-security': ['site-e2e'],
};

export function ownersOf(files, roots) {
  const owners = new Set();
  for (const file of files) {
    const owner = ownerOf(file, roots);
    if (owner) owners.add(owner);
  }
  return [...owners].sort();
}

// affected = owners(files) ∪ DEPENDENTS[owner] for each owner - the one line
// this whole spike exists to measure against `nx show projects --affected`.
export function pathMapAffected(files, roots) {
  const owners = ownersOf(files, roots);
  const affected = new Set(owners);
  for (const owner of owners) {
    for (const dependent of DEPENDENTS[owner] ?? []) affected.add(dependent);
  }
  return [...affected].sort();
}

function resolveEnv(roots) {
  const e2eChildren = readdirSync(join(ROOT, 'e2e'), { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
  }));
  return {
    toolE2eExists: (project) => existsSync(join(ROOT, `src/tools/${toolNameOf(project)}/e2e/`)),
    siteE2ePaths: siteE2eOwnPaths(e2eChildren, roots),
  };
}

// The pure entry point the replay driver (scratch, not committed - see
// ARCH-27) calls directly: same files/roots/toolE2eExists/siteE2ePaths the
// real oracle would use for this push, but `affected` from the path map
// instead of from Nx.
export function pathMapScope({ files, roots, toolE2eExists, siteE2ePaths }) {
  const affected = pathMapAffected(files, roots);
  return deriveScope({ files, affected, roots, toolE2eExists, siteE2ePaths });
}

function rootsFromGraphFile(path) {
  const graph = JSON.parse(readFileSync(path, 'utf8'));
  const roots = new Map();
  for (const [name, node] of Object.entries(graph.graph.nodes)) roots.set(name, node.data.root);
  return roots;
}

function main(argv) {
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const filesArg = flag('--files');
  const base = flag('--base');
  const head = flag('--head');
  const rootsFile = flag('--roots-file');

  let files;
  if (filesArg !== undefined) {
    files = filesArg.split(',').filter(Boolean);
  } else if (base) {
    files = changedFiles(base, head);
  } else {
    console.error('usage: node path-map-replay.mjs --files a,b,c | --base <sha> --head <sha> [--roots-file <graph.json>]');
    process.exit(1);
    return;
  }

  const roots = rootsFile ? rootsFromGraphFile(rootsFile) : projectRoots();
  const owners = ownersOf(files, roots);
  const affected = pathMapAffected(files, roots);
  const scope = deriveScope({ files, affected, roots, ...resolveEnv(roots) });

  console.log(JSON.stringify({ files, owners, affected, scope }, null, 2));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main(process.argv.slice(2));
}
