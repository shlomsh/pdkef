#!/usr/bin/env node
// ARCH-20: the oracle. Given a change, says which Nx projects it affects and
// translates that into what CI and the local scripts should actually run -
// `vitest run <dirs>`, `playwright test <dirs>`, and whether the 27 font
// screening guards apply. Nx itself stays the oracle, never the executor (see
// docs/nx-affected-ci.md): one `vitest run` and one `playwright test` per
// shard, filtered by the paths this script prints, not 17 separate
// `nx run <project>:test` invocations.
//
// Reuses scripts/change-scope.mjs's base resolution and changed-file list
// (`resolveBase`, `changedFiles`, `isDocsOnly`) so the two scripts cannot
// resolve two different diffs for the same push.
//
// Usage:
//   node scripts/affected-scope.mjs [--base <ref>] [--head <ref>]
//     Prints KEY=value lines for $GITHUB_OUTPUT: affected, everything,
//     unit_paths, e2e_paths, fonts. Without --head, this is "what would I
//     push right now" (working tree against --base, or against the merge
//     base with origin/main when --base is omitted). With --head, this is a
//     fixed historical commit range (used by the histogram and the
//     acceptance checks in ARCH-20's own verification).
//
//   node scripts/affected-scope.mjs --summary
//     Same resolution, printed as a short Markdown block for
//     $GITHUB_STEP_SUMMARY instead of KEY=value lines.
//
//   node scripts/affected-scope.mjs --run unit|e2e-product|e2e-perf|fonts
//     Resolves the same way, then actually runs the corresponding command,
//     narrowed to the resolved paths (or the full, unnarrowed form when
//     everything=true). Exits with that command's status.
//
// Rules, in this order (fail-open like change-scope.mjs: anything ambiguous
// widens, never narrows):
//
//   1. No resolvable base, an `nx` error, or an empty changed-file list ->
//      everything=true, fonts=true.
//   2. Any changed file that no Nx project owns (a root config file,
//      scripts/, patches/, package*.json, .github/, middleware.ts, anything
//      outside a project root - DOCS_ONLY files excepted, since a docs-only
//      change never reaches this script's jobs in CI) -> everything=true.
//      "Owned" is asked of Nx itself (each project's own `root`), never a
//      second hand-written path list.
//   3. Any affected project in {site, shell, editor, editor-ui, lib} ->
//      everything=true. Every tool depends on all five, so nothing narrows
//      anyway - this keeps the mapping trivially correct instead of trying
//      to reason about which tools a shared-core change could plausibly spare.
//   4. Otherwise narrow: unit_paths is each affected tool-<name> project's
//      src/tools/<name>/ plus src/test/ (its two tests walk all of src and
//      must run on any source change); e2e_paths is each such tool's
//      src/tools/<name>/e2e/ (only the tools that have one) plus e2e/ when
//      site-e2e is affected; fonts is whether the `fonts` project is affected.

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { resolveBase, changedFiles, isDocsOnly } from './change-scope.mjs';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

// Any project in this set makes narrowing pointless: every tool imports all
// five, so a change here can affect every tool's behavior.
export const CORE_PROJECTS = new Set(['site', 'shell', 'editor', 'editor-ui', 'lib']);

function nx(args) {
  return execFileSync('npx', ['nx', ...args], {
    encoding: 'utf8',
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, NX_DAEMON: 'false' },
  }).trim();
}

// Project name -> root directory (relative to ROOT), read from Nx's own
// project graph - not a second hand-written map. `nx graph --file=<path>`
// writes the graph as JSON; every project node's `data.root` is exactly
// what its project.json declares as `sourceRoot`/root.
function projectRoots() {
  const dir = mkdtempSync(join(tmpdir(), 'nx-graph-'));
  const file = join(dir, 'graph.json');
  try {
    nx(['graph', `--file=${file}`]);
    const graph = JSON.parse(readFileSync(file, 'utf8'));
    const roots = new Map();
    for (const [name, node] of Object.entries(graph.graph.nodes)) {
      roots.set(name, node.data.root);
    }
    return roots;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The one file no Nx project root can own, on purpose: docs-only changes
// don't reach this script's callers in CI, but if it is ever invoked on one
// directly it should not be forced to "everything" for having no project
// owner - it simply narrows to nothing.
export function ownerOf(file, roots) {
  let owner = null;
  let ownerRootLength = -1;
  for (const [name, root] of roots) {
    if (file === root || file.startsWith(`${root}/`)) {
      if (root.length > ownerRootLength) {
        owner = name;
        ownerRootLength = root.length;
      }
    }
  }
  return owner;
}

export function toolNameOf(project) {
  return project.slice('tool-'.length);
}

// "everything" always means "run the font guards too" - a shared-core or
// fail-open commit is exactly the kind that should not skip them.
export function wide(affected, reason) {
  return { everything: true, fonts: true, affected, unit_paths: '', e2e_paths: '', reason };
}

// The pure mapping: given the changed files, the projects Nx says are
// affected, and a name -> root map, decide narrow vs. everything and what to
// run. No `nx`/`git` call in here - src/lib/affectedScope.test.js exercises
// this directly with synthetic inputs, the way changeScope.test.js pins
// scripts/change-scope.mjs's classify() without shelling out to git.
export function deriveScope({ files, affected, roots, toolE2eExists = () => true }) {
  const unowned = files.filter((f) => !isDocsOnly(f) && !ownerOf(f, roots));
  if (unowned.length > 0) {
    return wide(affected, `unowned files: ${unowned.join(', ')}`);
  }

  const affectedSet = new Set(affected);
  const wideCore = [...affectedSet].filter((p) => CORE_PROJECTS.has(p));
  if (wideCore.length > 0) {
    return wide(affected, `core project(s) affected: ${wideCore.join(', ')}`);
  }

  const toolProjects = [...affectedSet].filter((p) => p.startsWith('tool-')).sort();
  const unitPaths = [...toolProjects.map((p) => `src/tools/${toolNameOf(p)}/`), 'src/test/'];
  const e2ePaths = toolProjects
    .map((p) => `src/tools/${toolNameOf(p)}/e2e/`)
    .filter((p) => toolE2eExists(p));
  if (affectedSet.has('site-e2e')) e2ePaths.push('e2e/');

  return {
    everything: false,
    fonts: affectedSet.has('fonts'),
    affected,
    unit_paths: unitPaths.join(' '),
    e2e_paths: e2ePaths.join(' '),
    reason: `narrowed to ${toolProjects.join(', ') || '(no tool project; site-e2e/fonts only)'}`,
  };
}

function resolveScope({ explicitBase, explicitHead }) {
  const base = resolveBase(explicitBase);
  if (!base) {
    return wide([], `no usable base (${explicitBase ?? 'origin/main'})`);
  }

  const files = changedFiles(base, explicitHead);
  if (files.length === 0) {
    return wide([], 'empty changed-file list');
  }

  let roots;
  let affected;
  try {
    roots = projectRoots();
    const affectedRaw = nx(['show', 'projects', '--affected', `--files=${files.join(',')}`, '--json']);
    affected = JSON.parse(affectedRaw);
  } catch (err) {
    return wide([], `nx error: ${err.message}`);
  }

  return deriveScope({
    files,
    affected,
    roots,
    toolE2eExists: (project) => existsSync(join(ROOT, `src/tools/${toolNameOf(project)}/e2e/`)),
  });
}

function printOutputs(scope) {
  console.log(`affected=${JSON.stringify(scope.affected)}`);
  console.log(`everything=${scope.everything}`);
  console.log(`unit_paths=${scope.unit_paths}`);
  console.log(`e2e_paths=${scope.e2e_paths}`);
  console.log(`fonts=${scope.fonts}`);
}

function printSummary(scope) {
  console.log('### Affected scope (ARCH-20)');
  console.log('');
  console.log(`- **everything**: ${scope.everything} (${scope.reason})`);
  console.log(`- **affected projects**: ${scope.affected.length ? scope.affected.join(', ') : '(none)'}`);
  console.log(`- **unit_paths**: ${scope.unit_paths || '(full suite)'}`);
  console.log(`- **e2e_paths**: ${scope.e2e_paths || (scope.everything ? '(full suite)' : '(none)')}`);
  console.log(`- **fonts**: ${scope.fonts}`);
}

function runUnit(scope) {
  const args = scope.everything || !scope.unit_paths ? [] : scope.unit_paths.split(' ').filter(Boolean);
  const result = spawnSync('npx', ['vitest', 'run', ...args], { stdio: 'inherit', cwd: ROOT });
  return result.status ?? 1;
}

function runE2eProduct(scope) {
  if (!scope.everything && !scope.e2e_paths) {
    console.error('affected-scope: no tool/site-e2e project affected; skipping product e2e.');
    return 0;
  }
  const paths = scope.everything ? [] : scope.e2e_paths.split(' ').filter(Boolean);
  const result = spawnSync('npx', ['playwright', 'test', '--project=chromium', '--project=webkit', '--pass-with-no-tests', ...paths], { stdio: 'inherit', cwd: ROOT });
  return result.status ?? 1;
}

function runE2ePerf(scope) {
  if (!scope.everything && !scope.e2e_paths) {
    console.error('affected-scope: no tool/site-e2e project affected; skipping perf e2e.');
    return 0;
  }
  const paths = scope.everything ? [] : scope.e2e_paths.split(' ').filter(Boolean);
  const result = spawnSync('npx', ['playwright', 'test', '--project=perf', '--workers=1', '--pass-with-no-tests', ...paths], { stdio: 'inherit', cwd: ROOT });
  return result.status ?? 1;
}

function runFonts(scope) {
  if (!scope.fonts) {
    console.error('affected-scope: fonts project not affected; skipping the font guards.');
    return 0;
  }
  const result = spawnSync('npx', ['playwright', 'test', '--project=fonts'], { stdio: 'inherit', cwd: ROOT });
  return result.status ?? 1;
}

function main(argv) {
  const baseIndex = argv.indexOf('--base');
  const headIndex = argv.indexOf('--head');
  const runIndex = argv.indexOf('--run');
  const explicitBase = baseIndex >= 0 ? argv[baseIndex + 1] : undefined;
  const explicitHead = headIndex >= 0 ? argv[headIndex + 1] : undefined;
  const runMode = runIndex >= 0 ? argv[runIndex + 1] : null;
  const summary = argv.includes('--summary');

  const scope = resolveScope({ explicitBase, explicitHead });
  console.error(`affected-scope: ${scope.reason}`);

  if (runMode) {
    if (runMode === 'unit') return runUnit(scope);
    if (runMode === 'e2e-product') return runE2eProduct(scope);
    if (runMode === 'e2e-perf') return runE2ePerf(scope);
    if (runMode === 'fonts') return runFonts(scope);
    console.error(`affected-scope: unknown --run mode "${runMode}" (expected unit|e2e-product|e2e-perf|fonts)`);
    return 1;
  }

  if (summary) printSummary(scope);
  else printOutputs(scope);
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  process.exit(main(process.argv.slice(2)));
}
