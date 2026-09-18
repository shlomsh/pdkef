#!/usr/bin/env node
// ARCH-20: the oracle. Given a change, says which Nx projects it affects and
// translates that into what CI and the local scripts should actually run -
// `vitest run <dirs>`, `playwright test <dirs>`, whether the 25 font
// screening guards apply, and whether the 2 export-pipeline guards apply
// (ARCH-23 split the latter out of the former - see matchesFontsGlob's
// comment for why `fonts` is now a file-glob decision, not an Nx-graph one).
// Nx itself stays the oracle for everything else, never the executor (see
// docs/nx-affected-ci.md): one `vitest run` and one `playwright test` per
// shard, filtered by the paths this script prints, not 18 separate
// `nx run <project>:test` invocations.
//
// Reuses scripts/change-scope.mjs's base resolution and changed-file list
// (`resolveBase`, `changedFiles`, `isDocsOnly`) so the two scripts cannot
// resolve two different diffs for the same push.
//
// Usage:
//   node scripts/affected-scope.mjs [--base <ref>] [--head <ref>]
//     Prints KEY=value lines for $GITHUB_OUTPUT: affected, everything,
//     unit_paths, e2e_paths, fonts, export_guards. Without --head, this is
//     "what would I push right now" (working tree against --base, or against
//     the merge base with origin/main when --base is omitted). With --head,
//     this is a fixed historical commit range (used by the histogram and the
//     acceptance checks in ARCH-20's own verification).
//
//   node scripts/affected-scope.mjs --summary
//     Same resolution, printed as a short Markdown block instead of KEY=value
//     lines. In CI the KEY=value form also appends that block to the file
//     $GITHUB_STEP_SUMMARY names, so one call per job feeds both.
//
//   node scripts/affected-scope.mjs --run unit|e2e-product|e2e-perf|fonts|export-guards
//     Resolves the same way, then actually runs the corresponding command,
//     narrowed to the resolved paths (or the full, unnarrowed form when
//     everything=true). Exits with that command's status.
//
// Rules, in this order (fail-open like change-scope.mjs: anything ambiguous
// widens, never narrows):
//
//   1. No resolvable base, an `nx` error, or an empty changed-file list ->
//      everything=true, fonts=true, export_guards=true.
//   2. Any changed file that no Nx project owns (a root config file,
//      patches/, package*.json, .github/, middleware.ts, anything outside a
//      project root - DOCS_ONLY files excepted, since a docs-only change
//      never reaches this script's jobs in CI) -> everything=true. "Owned" is
//      asked of Nx itself (each project's own `root`), never a second
//      hand-written path list. ARCH-22 gave `scripts/` itself a project
//      (`tooling`), so a `scripts/` file is no longer unowned by this rule -
//      see rule 3 for why the oracle files inside it still force everything.
//   3. Any changed file is the CI oracle itself (ORACLE_FILES: this script or
//      change-scope.mjs) -> everything=true. Do not trust a narrowed run to
//      validate the code that decided to narrow it - the same reasoning
//      CORE_PROJECTS gives for editor. This is checked separately from
//      ownership because `tooling` (rule 2) would otherwise let an oracle
//      change narrow to just `scripts/`. Their own tests
//      (affected-scope.test.mjs, change-scope.test.mjs) are NOT oracle files
//      - a test-only change may still narrow.
//   4. Any affected project in {site, shell, editor, lib} -> everything=true.
//      Every tool depends on all four, so nothing narrows anyway - this
//      keeps the mapping trivially correct instead of trying to reason about
//      which tools a shared-core change could plausibly spare. `editor-ui`
//      left this set in DEBT-06: its only consumers are Sign and Redact (per
//      the boundary checker's rules), the tool pages' Tailwind `@source`
//      lists name no island files (no CSS side channel to a third tool), and
//      the graph already answers precisely for it - `nx show projects
//      --affected --files=src/editor-ui/ElementToolbar.tsx` names exactly
//      editor-ui, tool-sign, tool-redact, cross-tool-tests, site-e2e.
//      `editor`'s own fate (whether it can leave too) is DEBT-07, after
//      DEBT-04. ARCH-23: unlike everything else this rule forces, `fonts` is
//      NOT automatically true here - it is matchesFontsGlob(files), the same
//      as rule 5's narrow path, computed once and threaded through every
//      wide() call and the narrow() return alike (see wide()'s own comment).
//   5. Otherwise narrow: unit_paths is each affected tool-<name> project's
//      src/tools/<name>/, plus the root of every other affected project that
//      is not a tool and not in CORE_PROJECTS (so a narrowed `editor-ui`
//      change still runs editor-ui's own unit tests, and a narrowed
//      `tooling` change runs `scripts/`, with no hand-written second list -
//      see the `roots` map in deriveScope), plus src/test/ (its own Nx
//      project is `site-test`; several of its guard tests walk all of src
//      and must run on any source change, so this is unconditional, not
//      gated on `site-test` itself being affected). All of that is sorted
//      alphabetically together, with src/test/ pinned last regardless (both
//      orders are equally arbitrary; this is just the one the test pins).
//      e2e_paths is each affected tool's src/tools/<name>/e2e/ (only the
//      tools that have one) plus site-e2e's own direct children (e2e/home/,
//      e2e/demo/, ... - never the bare "e2e/" string: Playwright's CLI path
//      arguments are substring filters against the whole discovered test
//      list, and "e2e/" is a substring of every tool's own
//      src/tools/<t>/e2e/*.spec.js path too, which would silently defeat the
//      narrowing) when site-e2e is affected; fonts is matchesFontsGlob(files)
//      (ARCH-23 - see that function's own comment for why this is a glob and
//      not `affectedSet.has('fonts')`); export_guards is whether the
//      `export-guards` project (e2e/export/, the two guards ARCH-23 split
//      out of `fonts`) is affected, decided by Nx like any other project -
//      its own implicitDependencies (font-assets, editor, lib, tool-sign)
//      keep it coarse on purpose, since it is only two cheap specs.

import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { resolveBase, changedFiles, isDocsOnly } from './change-scope.mjs';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

// Any project in this set makes narrowing pointless: every tool imports all
// four, so a change here can affect every tool's behavior. `editor-ui` is
// deliberately not here (DEBT-06): its only consumers are Sign and Redact,
// so the Nx graph already answers precisely for it instead of needing this
// blanket treatment. `editor` stays for now - DEBT-07 decides its fate,
// after DEBT-04.
export const CORE_PROJECTS = new Set(['site', 'shell', 'editor', 'lib']);

// The CI oracle itself. `tooling` (ARCH-22) gives scripts/ a project, so
// without this a change to the file deciding what to narrow could narrow
// itself - rule 3 in the header comment forces everything for these two
// regardless of ownership. Their own tests are deliberately not listed here:
// scripts/affected-scope.test.mjs and scripts/change-scope.test.mjs may
// narrow like any other tooling file.
export const ORACLE_FILES = new Set(['scripts/affected-scope.mjs', 'scripts/change-scope.mjs']);

// ARCH-23 (2026-09-18, owner's decision on backlog/tasks/ARCH-23.md): the 27
// font screening guards (now 25 - the export render guard and language
// acceptance moved to their own `export-guards` project, see below) exist to
// prove the shipped fonts comply, not to catch a Sign/Redact UI regression -
// so per-push they should run only when a font asset, the catalogue, a guard
// itself, or the toolchain around them changed, never merely because
// `editor`/`lib`/`tool-sign` sit on the Nx dependency graph (that edge
// produced zero rightful triggers across 8 measured narrow-verdict runs and
// forced `fonts:true` on 25 of 44 historically-affected runs via `wide()`
// alone - see the ticket's "Measured" sections). Nx's project graph cannot
// express "this file inside src/editor/text/, not that one" (a directory is
// one project), so this is a small, explicit, rarely-touched file-glob rule
// instead of a second Nx project - matching the fallback design the ticket
// itself measured and recommended. It is directory-wide for
// src/editor/text/, not a named subset of catalogue files: the shaping code
// living there (bidiRuns.js, combPlacement.ts, dateFormat.ts, ...) shares the
// directory with the catalogue it guards, and Nx's directory-rooted model
// cannot separate them without a real file move this ticket's saving does
// not justify - so a shaping-code change still runs the guards too, on the
// same "ambiguous scope never narrows" fail-open principle every other rule
// here follows.
const FONTS_DIRECTORY_GLOBS = ['public/fonts/', 'src/editor/text/', 'scripts/fonts/', 'e2e/sign/'];

export function matchesFontsGlob(file) {
  if (file === 'playwright.config.js') return true; // defines the fonts-shard split itself
  if (file === 'src/styles/editorFonts.css') return true; // generated from the font manifest
  if (/^scripts\/generate-font-/.test(file)) return true;
  if (/^scripts\/check-font-/.test(file)) return true;
  return FONTS_DIRECTORY_GLOBS.some((prefix) => file.startsWith(prefix));
}

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

// site-e2e's OWN specs: the direct children of e2e/ that are not themselves
// carved out into another project (today, just e2e/sign/, the `fonts`
// project). Playwright's CLI path arguments are substring filters against
// the whole discovered test list, not directory-restriction filters - a bare
// "e2e/" argument matches "src/tools/sign/e2e/sign-editor.spec.js" too (it
// contains "e2e/" as a substring), which would silently pull every tool's
// own e2e/ specs back into a "narrow to site-e2e only" run. Enumerating
// site-e2e's real direct children sidesteps that entirely. `children` is
// injectable (an array of {name, isDirectory}) so this needs no real
// filesystem access to unit-test; `roots` is the same name -> root map
// ownerOf() uses, so a project newly carved out of e2e/ (like `fonts` was)
// is excluded automatically, with no second hand-written list to update.
export function siteE2eOwnPaths(children, roots) {
  const nestedRoots = [...roots.values()].filter((r) => r.startsWith('e2e/'));
  const paths = [];
  for (const entry of children) {
    if (entry.name === 'project.json') continue;
    const rel = `e2e/${entry.name}`;
    if (nestedRoots.some((r) => rel === r || r.startsWith(`${r}/`))) continue;
    paths.push(entry.isDirectory ? `${rel}/` : rel);
  }
  return paths.sort();
}

// "everything" means "run the export guards too" unconditionally (they are
// cheap, ~2 specs, and their own Nx project already treats editor/lib/
// tool-sign as coarse whole-project dependencies on purpose - see
// e2e/export/project.json). `fonts` (the 25 remaining, expensive guards) is
// the one ARCH-23 narrows even on a wide() verdict: it defaults to true
// (fail-open, matches every existing wide() call site: no usable base, an
// unowned file, the CI oracle itself), but the CORE_PROJECTS call site below
// passes the real glob-computed value instead, so a core-project change that
// does not touch a font path stops paying for the guards - see
// matchesFontsGlob's own comment for why this is a directory rule, not a
// hand-kept list of catalogue files.
export function wide(affected, reason, fonts = true) {
  return { everything: true, fonts, export_guards: true, affected, unit_paths: '', e2e_paths: '', reason };
}

// The pure mapping: given the changed files, the projects Nx says are
// affected, and a name -> root map, decide narrow vs. everything and what to
// run. No `nx`/`git` call in here - scripts/affected-scope.test.mjs exercises
// this directly with synthetic inputs, the way changeScope.test.js pins
// scripts/change-scope.mjs's classify() without shelling out to git.
export function deriveScope({ files, affected, roots, toolE2eExists = () => true, siteE2ePaths = [] }) {
  const unowned = files.filter((f) => !isDocsOnly(f) && !ownerOf(f, roots));
  if (unowned.length > 0) {
    return wide(affected, `unowned files: ${unowned.join(', ')}`);
  }

  const oracleFiles = files.filter((f) => ORACLE_FILES.has(f));
  if (oracleFiles.length > 0) {
    return wide(affected, `CI oracle changed: ${oracleFiles.join(', ')}`);
  }

  const affectedSet = new Set(affected);
  const wideCore = [...affectedSet].filter((p) => CORE_PROJECTS.has(p));
  if (wideCore.length > 0) {
    // ARCH-23: unlike the other wide() reasons, a core-project change no
    // longer force-runs the font guards unless the actual diff touches a
    // font path - editor/lib being "core" is about correctness for every
    // tool's behavior, not about fonts specifically.
    return wide(affected, `core project(s) affected: ${wideCore.join(', ')}`, files.some(matchesFontsGlob));
  }

  const toolProjects = [...affectedSet].filter((p) => p.startsWith('tool-')).sort();
  const toolPaths = toolProjects.map((p) => `src/tools/${toolNameOf(p)}/`);

  // Any other affected project (not a tool, not core) whose own root sits
  // under src/, or is `scripts` or a folder under it (ARCH-22's `tooling`
  // and its three pre-existing subfolder projects), gets its own root added
  // too, straight from the injected `roots` map - never a hand-written list
  // - so e.g. an editor-ui-only change still runs
  // editor-ui's own unit tests (DEBT-06) and a tooling-only change runs
  // `scripts/`. A root already covered by the always-present src/test/ below
  // is skipped, not duplicated: both `cross-tool-tests` (root
  // `src/test/cross-tool`, caught by the `startsWith` check) and `site-test`
  // itself (root the literal `src/test`, which `startsWith('src/test/')`
  // does not match - no trailing slash - so it needs its own equality check,
  // DEBT-04 second pass).
  const extraPaths = [...affectedSet]
    .filter((p) => !p.startsWith('tool-') && !CORE_PROJECTS.has(p))
    .map((p) => roots.get(p))
    .filter((root) => root && (root.startsWith('src/') || root === 'scripts' || root.startsWith('scripts/')) && root !== 'src/test' && !root.startsWith('src/test/'))
    .map((root) => `${root}/`);

  // Sorted together, alphabetically; src/test/ is pinned last regardless of
  // where it would otherwise fall (either order is equally arbitrary here -
  // this is just the one scripts/affected-scope.test.mjs pins).
  const unitPaths = [...toolPaths, ...extraPaths].sort();
  unitPaths.push('src/test/');
  const e2ePaths = toolProjects
    .filter((p) => toolE2eExists(p))
    .map((p) => `src/tools/${toolNameOf(p)}/e2e/`);
  if (affectedSet.has('site-e2e')) e2ePaths.push(...siteE2ePaths);

  return {
    everything: false,
    // ARCH-23: fonts is decided by the file-glob rule, never by whether Nx's
    // `fonts` project shows up in `affected` - that project's own
    // implicitDependencies no longer include editor/lib/tool-sign for
    // exactly this reason (see e2e/sign/project.json). export_guards is a
    // real Nx affected-check, same as any tool project: e2e/export/
    // project.json's implicitDependencies (font-assets, editor, lib,
    // tool-sign) are what make it true here.
    fonts: files.some(matchesFontsGlob),
    export_guards: affectedSet.has('export-guards'),
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

  const e2eChildren = readdirSync(join(ROOT, 'e2e'), { withFileTypes: true })
    .map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));

  return deriveScope({
    files,
    affected,
    roots,
    toolE2eExists: (project) => existsSync(join(ROOT, `src/tools/${toolNameOf(project)}/e2e/`)),
    siteE2ePaths: siteE2eOwnPaths(e2eChildren, roots),
  });
}

function printOutputs(scope) {
  console.log(`affected=${JSON.stringify(scope.affected)}`);
  console.log(`everything=${scope.everything}`);
  console.log(`unit_paths=${scope.unit_paths}`);
  console.log(`e2e_paths=${scope.e2e_paths}`);
  console.log(`fonts=${scope.fonts}`);
  console.log(`export_guards=${scope.export_guards}`);
}

function summaryMarkdown(scope) {
  return [
    '### Affected scope (ARCH-20)',
    '',
    `- **everything**: ${scope.everything} (${scope.reason})`,
    `- **affected projects**: ${scope.affected.length ? scope.affected.join(', ') : '(none)'}`,
    `- **unit_paths**: ${scope.unit_paths || '(full suite)'}`,
    `- **e2e_paths**: ${scope.e2e_paths || (scope.everything ? '(full suite)' : '(none)')}`,
    `- **fonts**: ${scope.fonts}`,
    `- **export_guards**: ${scope.export_guards}`,
    '',
  ].join('\n');
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

// ARCH-23: the export render guard and language acceptance, split out of
// `fonts` into their own project - see e2e/export/project.json.
function runExportGuards(scope) {
  if (!scope.export_guards) {
    console.error('affected-scope: export-guards project not affected; skipping the export guards.');
    return 0;
  }
  const result = spawnSync('npx', ['playwright', 'test', '--project=export-guards'], { stdio: 'inherit', cwd: ROOT });
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
    if (runMode === 'export-guards') return runExportGuards(scope);
    console.error(`affected-scope: unknown --run mode "${runMode}" (expected unit|e2e-product|e2e-perf|fonts|export-guards)`);
    return 1;
  }

  if (summary) {
    process.stdout.write(summaryMarkdown(scope));
    return 0;
  }
  printOutputs(scope);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(scope));
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  process.exit(main(process.argv.slice(2)));
}
