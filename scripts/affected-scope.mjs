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
//     e2e_paths, fonts, export_guards. Without --head, this is
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
//      never reaches this script's jobs in CI) -> everything=true, except the
//      files UNOWNED_VERDICTS names (QUAL-34): each carries its own measured
//      e2e verdict (none, a named spec dir, or every product spec with fonts
//      off) and is also kept out of the `nx show projects --affected` query,
//      since Nx marks most projects affected by middleware.ts or vercel.json. "Owned" is
//      asked of Nx itself (each project's own `root`), never a second
//      hand-written path list. ARCH-22 gave `scripts/` itself a project
//      (`tooling`), so a `scripts/` file is no longer unowned by this rule -
//      see rule 3 for why the oracle files inside it still force everything.
//      QUAL-43: package.json is the one unowned file read by its diff - when only `scripts` entries off the
//      build, preview, dev and test:e2e* path changed (packageJsonReachesE2e), it carries verdict none.
//   3. Any changed file is the CI oracle itself (ORACLE_FILES: this script,
//      change-scope.mjs, import-graph.mjs, script-closure.mjs, test-only-scope.mjs or unowned-verdicts.mjs) ->
//      everything=true. Do not trust a narrowed run to validate the code that decided to narrow it - the same reasoning
//      CORE_PROJECTS gives for editor. This is checked separately from
//      ownership because `tooling` (rule 2) would otherwise let an oracle
//      change narrow to just `scripts/`. Their own tests
//      (affected-scope.test.mjs, change-scope.test.mjs) are NOT oracle files
//      - a test-only change may still narrow.
//   4. Any affected project in {site, shell, editor, lib} -> everything=true,
//      unless import reachability (ARCH-32, narrowByReachability) can name
//      the tools the changed src/ files reach: every changed file's
//      "who imports me" walk must end in a tool file or a tool's own page,
//      and then only those tools' e2e dirs run, plus the site-wide specs
//      and the export guards. Nx cannot do this (it connects `editor` to
//      18 of 19 projects); anything the walk cannot classify (CSS, a file
//      the scan never saw, a layout or a non-tool page) keeps this rule's
//      everything=true, with the reason. `editor-ui`
//      left this set in DEBT-06: its only consumers are Sign and Redact (per
//      the boundary checker's rules), the tool pages' Tailwind `@source`
//      lists name no island files (no CSS side channel to a third tool), and
//      the graph already answers precisely for it - `nx show projects
//      --affected --files=src/editor-ui/ColorPickerMenu.tsx` names editor-ui,
//      the two tools and only projects downstream of them (measured
//      2026-10-01, RED-51: editor-ui, tool-sign, tool-redact,
//      cross-tool-tests, site-e2e, export-guards, form-corpus,
//      sign-spike-mobi10, tooling), never a third tool.
//      `editor`'s own fate (whether it can leave too) is DEBT-07, after
//      DEBT-04. ARCH-23: unlike everything else this rule forces, `fonts` is
//      NOT automatically true here - it is matchesFontsGlob(files), the same
//      as rule 5's narrow path, computed once and threaded through every
//      wide() call and the narrow() return alike (see wide()'s own comment).
//   5. Otherwise narrow (ARCH-34 removed the dead unit_paths output: unit tests are chosen by
//      import impact in scripts/unit-scope.mjs, ARCH-28, never from this file):
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
//   6. QUAL-35: after rules 1-5, a diff whose every non-docs file is a unit test or a
//      `.spec.js` narrows to just the changed specs (test-only-scope.mjs, ARCH-31's rule),
//      here and so for check:push too. Only the final verdict is narrowed; rule 1's early
//      wide() returns stay wide.

import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { resolveBase, changedFiles, isDocsOnly } from './change-scope.mjs';
import { resolveUnitScope, runUnitByImpact } from './unit-scope.mjs';
import { buildReachGraph } from './import-graph.mjs';
import { scriptClosure } from './script-closure.mjs';
import { narrowTestOnlyChange } from './test-only-scope.mjs';
import { unownedRowOf, filesForNx, CI_FILE, ciFontJobChangedBetween, packageJsonReachesE2eBetween } from './unowned-verdicts.mjs';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

// Any project in this set makes narrowing pointless: every tool imports all
// four, so a change here can affect every tool's behavior. `editor-ui` is
// deliberately not here (DEBT-06): its only consumers are Sign and Redact,
// so the Nx graph already answers precisely for it instead of needing this
// blanket treatment. `editor` stays for now - DEBT-07 decides its fate,
// after DEBT-04.
// ARCH-34: `data` and `site-lib` were folders (and `constants`, until part A emptied it into `editor`) of the catch-all `site` project and
// are projects of their own now so the Nx graph stops treating every import of them as an import
// of `site`. They stay core on purpose: Nx cannot see an .astro page's imports, so a change in
// them no longer makes `site` affected by itself, and a page that renders the data would be
// missed by a narrow verdict. Core status sends them through the import-reachability walk, the
// same verdict they had as part of `site`.
export const CORE_PROJECTS = new Set(['site', 'shell', 'editor', 'lib', 'data', 'site-lib']);

// The CI oracle itself. `tooling` (ARCH-22) gives scripts/ a project, so
// without this a change to the file deciding what to narrow could narrow
// itself - rule 3 in the header comment forces everything for these two
// regardless of ownership. Their own tests are deliberately not listed here:
// scripts/affected-scope.test.mjs and scripts/change-scope.test.mjs may
// narrow like any other tooling file.
export const ORACLE_FILES = new Set(['scripts/affected-scope.mjs', 'scripts/change-scope.mjs', 'scripts/import-graph.mjs', 'scripts/unowned-verdicts.mjs', 'scripts/script-closure.mjs', 'scripts/test-only-scope.mjs']);

// QUAL-32 follow-up: a file the production build executes shapes dist/ (the precache manifest, the
// service worker build id, repo-only pruning), which e2e/offline and the rest of the suite exercise,
// yet it lives in the `tooling` project that no e2e project depends on. So it is wide, like the
// oracle. The set is derived, not listed: every `node <file>` in package.json's `build` script, plus
// everything those reach through relative imports, transitively. A `--check` step only verifies a
// committed file and does not shape dist/, so it and what only it imports keep their own scope.
// `readFile(rel)` returns the text or null/undefined when the file does not exist.
export function buildPipelineFiles(packageJsonText, readFile) {
  let build = '';
  try {
    build = JSON.parse(packageJsonText)?.scripts?.build ?? '';
  } catch {
    return new Set();
  }
  const shaping = build.split('&&').filter((step) => !/(^|\s)--check(\s|$)/.test(step)).join('&&');
  return scriptClosure(shaping, readFile);
}

let realBuildFiles = null;
function realBuildPipelineFiles() {
  realBuildFiles ??= buildPipelineFiles(readFileSync(join(ROOT, 'package.json'), 'utf8'), (rel) => {
    try {
      return readFileSync(join(ROOT, rel), 'utf8');
    } catch {
      return null;
    }
  });
  return realBuildFiles;
}

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
const FONTS_DIRECTORY_GLOBS = ['public/fonts/', 'src/editor/text/', 'src/lib/fonts/', 'scripts/fonts/', 'e2e/sign/'];

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

// Project name -> { root, tags, implicitDependencies }, read from Nx's own project graph - not a
// second hand-written map. `nx graph --file=<path>` writes the graph as JSON; every project node's
// `data` carries what its project.json declares.
function projectInfo() {
  const dir = mkdtempSync(join(tmpdir(), 'nx-graph-'));
  const file = join(dir, 'graph.json');
  try {
    nx(['graph', `--file=${file}`]);
    const graph = JSON.parse(readFileSync(file, 'utf8'));
    const info = new Map();
    for (const [name, node] of Object.entries(graph.graph.nodes)) {
      info.set(name, { root: node.data.root, tags: node.data.tags ?? [], implicitDependencies: node.data.implicitDependencies ?? [] });
    }
    return info;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The tag every site-wide e2e project carries (site-e2e itself and its per-directory siblings).
export const SITE_E2E_TAG = 'site-e2e';

// The site-wide e2e projects as deriveScope wants them: { name, root, paths, tools }. `paths` is
// what Playwright is given (the project's own spec files for the root project, whose directories
// are other projects; `<root>/` for a directory project). `tools` is the tool-<t> projects it
// declares as implicitDependencies.
export function siteE2eProjectList(info, children) {
  const roots = new Map([...info].map(([name, node]) => [name, node.root]));
  return [...info]
    .filter(([, node]) => node.tags.includes(SITE_E2E_TAG))
    .map(([name, node]) => ({
      name,
      root: node.root,
      paths: node.root === 'e2e' ? siteE2eOwnPaths(children, roots) : [`${node.root}/`],
      tools: new Set(node.implicitDependencies.filter((d) => d.startsWith('tool-'))),
    }));
}

// The one file no Nx project root can own, on purpose: docs-only changes
// don't reach this script's callers in CI, but if it is ever invoked on one
// directly it should not be forced to "everything" for having no project
// owner - it simply narrows to nothing.
// ARCH-34: public/ is copied verbatim into the site, so a project.json inside public/.well-known
// would be published. That directory has an owner here instead of in Nx:
//   - public/.well-known/**: agent-discovery files. No spec requests them (a unit test reads them,
//     and unit selection is scripts/unit-scope.mjs's business), so no e2e runs.
// public/images/** is deliberately NOT owned: tool specs open public/images/redaction-guide/sample.pdf
// (merge-grid and seven Sign specs), FileDropzone.tsx fetches it, and src/data/tools.js renders
// /images/scan-guide/* on tool pages, so an image change can alter any spec and widens to everything.
// public/sw.js and the other loose files in public/ stay unowned for the same reason.
export function publicOwnerOf(file) {
  if (file.startsWith('public/.well-known/')) return 'public-well-known';
  return null;
}

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
  return { everything: true, fonts, export_guards: true, affected, e2e_paths: '', reason };
}

// ARCH-32: file-level narrowing for a core-project verdict. Nx cannot tell which tools a change in
// src/editor/ or src/lib/ reaches (the project graph connects `editor` to 18 of 19 projects), but
// the import graph can: walk "who imports me" from each changed file up to the files that no one
// imports, and every such end must be a tool (a file under src/tools/<t>/) or a tool's own page.
// A non-tool page, or an e2e/ file outside the site-wide specs, widens: tool specs may visit it.
// Anything else - a module nothing live imports (middleware, an api/ entry, a framework-loaded
// config), a file the scan never saw (CSS, YAML, an image, a deleted file) - is something this
// walk cannot speak for, so it answers
// "wide" with the reason instead of guessing. A wrong narrowing silently skips a spec; a wrong
// widening costs seconds.
const TOOL_DIR = /^src\/tools\/([^/]+)\//;
// A unit test or contract test: nothing e2e imports it, so it carries no e2e consequence.
const UNIT_TEST_FILE = /\.(?:test|contract)\.[cm]?[jt]sx?$/;
// Test support (src/test/ and `*.test-helper.*`): imported by unit tests, and by a spec only if a
// spec is a live importer, which the walk follows like any other. With no live importer at all it
// is not a loose end the way a runtime file is: unit tests are all it serves.
const TEST_SUPPORT_FILE = /^src\/test\/|\.test-helper\.[cm]?[jt]sx?$/;
// Tool specs may visit any page (the home page, the localized routes), so only a tool's own page
// ends the walk safely: a page under src/pages/ that is not one goes wide, and so does an e2e/ file
// unless it sits under an always-run site-wide spec path (`siteE2ePaths`).
const PAGE_FILE = /^src\/pages\//;
const E2E_FILE = /^e2e\//;
// ARCH-34. A CSS file is not a scanned source file, but import-graph records an edge to it from
// whatever imports it (`import styles from './X.module.css'`), so a CSS file with an importer is
// reached through that importer like any module. One nothing imports (an entry sheet, a file only
// a Tailwind `@source` line reaches) has no walk and stays wide.
const CSS_FILE = /\.css$/;
// src/content/** (YAML collections) is read by the layouts every page renders (the published-
// edition and hreflang links come from `getPublishedEditionPaths`), so a content edit can change
// any page and any spec that visits one, tool specs included via `/`. Nothing narrower is safe;
// the rule exists so the verdict names its reason instead of "unknown file".
const CONTENT_FILE = /^src\/content\//;

// Tool folder of a file: anything under src/tools/<t>/, or a top-level page that renders a tool
// (`routeMap` is import-graph's buildToolRouteMap(): '/<slug>' -> tool folder).
export function makeToolOf(routeMap) {
  const pageTool = new Map([...routeMap].map(([route, tool]) => [`src/pages${route}.astro`, tool]));
  return (file) => file.match(TOOL_DIR)?.[1] ?? pageTool.get(file) ?? null;
}

// Pure: { tools: string[] (sorted tool folder names), via: Map tool -> the changed file that
// reaches it } or { wide: reason }. `knownFiles` is every file the scan saw, `reverseEdges` is
// to -> Set(from), `toolOf(file)` names the tool a file belongs to (or null).
export function narrowByReachability({
  changedFiles, knownFiles, reverseEdges, toolOf,
  isInert = (f) => UNIT_TEST_FILE.test(f),
  isTestSupport = (f) => TEST_SUPPORT_FILE.test(f),
  siteE2ePaths = [],
}) {
  const via = new Map();
  const e2eFiles = new Set();
  for (const seed of changedFiles) {
    if (CONTENT_FILE.test(seed)) return { wide: `${seed} is content that the layouts every page renders read, and tool specs visit those pages` };
    if (!knownFiles.has(seed) && !(CSS_FILE.test(seed) && reverseEdges.has(seed))) return { wide: `${seed} is not a source file the import graph knows (CSS, content, asset or deleted)` };
    const visited = new Set();
    const stack = [seed];
    while (stack.length) {
      const node = stack.pop();
      if (visited.has(node)) continue;
      visited.add(node);
      if (isInert(node)) continue;
      const tool = toolOf(node);
      if (tool) {
        if (!via.has(tool)) via.set(tool, seed);
        continue; // a tool is one identity; nothing legitimately imports past it
      }
      if (PAGE_FILE.test(node)) return { wide: `${seed} reaches ${node}, which tool specs also visit` };
      if (E2E_FILE.test(node)) {
        if (siteE2ePaths.some((p) => node === p || (p.endsWith('/') && node.startsWith(p)))) {
          e2eFiles.add(node);
          continue;
        }
        return { wide: `${seed} reaches ${node}, a spec the site-wide run does not cover` };
      }
      // A unit test importing a file does not make it reachable from a page: only live importers
      // count, and a file with none (an entry the graph does not see, say) is a dead end that widens.
      const live = [...(reverseEdges.get(node) ?? [])].filter((importer) => !isInert(importer));
      if (live.length === 0 && isTestSupport(node)) continue;
      if (live.length === 0) return { wide: `${seed} reaches ${node}, which is not a tool file or a tool page and has no importer to walk on` };
      for (const importer of live) stack.push(importer);
    }
  }
  return { tools: [...via.keys()].sort(), via, e2eFiles };
}

// The pure mapping: given the changed files, the projects Nx says are
// affected, and a name -> root map, decide narrow vs. everything and what to
// run. No `nx`/`git` call in here - scripts/affected-scope.test.mjs exercises
// this directly with synthetic inputs, the way changeScope.test.js pins
// scripts/change-scope.mjs's classify() without shelling out to git.
export function deriveScope({ files, affected, roots, toolE2eExists = () => true, siteE2ePaths = [], siteE2eProjects: projectList = null, loadReachGraph = null, buildFiles = null, ciFontJobChanged = () => true, packageJsonReachesE2e = () => true }) {
  // An empty list means "none were found", never "no site-wide spec exists": use the old floor.
  const siteE2eProjects = projectList?.length ? projectList : null;
  // QUAL-43: a package.json diff that only touches scripts off the build and e2e path acts as a table file
  // with verdict 'none' (it adds no spec and no font guard); anything else leaves it unowned and wide.
  const packageOffPath = files.includes('package.json') && !packageJsonReachesE2e();
  const unowned = files.filter((f) => !isDocsOnly(f) && !ownerOf(f, roots) && !publicOwnerOf(f) && !unownedRowOf(f) && !(packageOffPath && f === 'package.json'));
  if (unowned.length > 0) {
    return wide(affected, `unowned files: ${unowned.join(', ')}`);
  }

  const oracleFiles = files.filter((f) => ORACLE_FILES.has(f));
  if (oracleFiles.length > 0) {
    return wide(affected, `CI oracle changed: ${oracleFiles.join(', ')}`);
  }

  const pipeline = changedBuildFiles(buildFiles, files);
  if (pipeline.length > 0) {
    return wide(affected, `build pipeline: ${pipeline.join(', ')}`);
  }

  // QUAL-34: table files the verdict says need every product spec. Fonts follow the font globs, and a
  // ci.yml edit also turns them on when it touches the font-guards job or anything outside a job.
  const tableRows = files.map((f) => [f, unownedRowOf(f)]).filter(([, row]) => row);
  const allRows = tableRows.filter(([, row]) => row.verdict.e2e === 'all');
  if (allRows.length > 0) {
    const fonts = files.some(matchesFontsGlob) || (files.includes('.github/workflows/ci.yml') && ciFontJobChanged());
    return wide(affected, `unowned files that reach every spec: ${allRows.map(([f, row]) => `${f} (${row.why})`).join('; ')}`, fonts);
  }

  const affectedSet = new Set(affected);
  const wideCore = [...affectedSet].filter((p) => CORE_PROJECTS.has(p));
  if (wideCore.length > 0) {
    // ARCH-23: unlike the other wide() reasons, a core-project change no
    // longer force-runs the font guards unless the actual diff touches a
    // font path - editor/lib being "core" is about correctness for every
    // tool's behavior, not about fonts specifically.
    const fonts = files.some(matchesFontsGlob);
    const coreReason = `core project(s) affected: ${wideCore.join(', ')}`;
    // ARCH-32: before going wide, ask the import graph which tools the changed files reach.
    const reached = reachFromCore({ files, loadReachGraph, siteE2ePaths });
    if (reached.wide) return wide(affected, `${coreReason} (${reached.wide})`, fonts);
    const reachedScope = narrowResult({
      files,
      affected,
      toolProjects: reached.tools.map((t) => `tool-${t}`),
      toolE2eExists,
      siteE2ePaths: selectSiteE2eForReach({ projects: siteE2eProjects, allPaths: siteE2ePaths, files, roots, reached }),
      includeSiteE2e: true, // the site-wide specs the reach selects (all of them unless it can name which) are the floor of a narrowed run
      exportGuards: true, // same as wide(): two cheap specs whose own Nx edges are coarse on purpose
      reason: `${coreReason}, narrowed by import reachability to ${reached.tools.join(', ') || '(no tool; site-e2e only)'} - ${reached.why}`,
    });
    return withTableSpecs(reachedScope, tableRows.map(([f, row]) => [f, row.verdict.e2e]));
  }

  const toolProjects = [...affectedSet].filter((p) => p.startsWith('tool-')).sort();
  const narrowed = narrowResult({
    files,
    affected,
    toolProjects,
    toolE2eExists,
    siteE2ePaths: siteE2eProjects ? siteE2eProjects.filter((p) => affectedSet.has(p.name)).flatMap((p) => p.paths) : siteE2ePaths,
    includeSiteE2e: siteE2eProjects ? true : affectedSet.has('site-e2e'),
    // ARCH-23: a real Nx affected-check, same as any tool project: e2e/export/
    // project.json's implicitDependencies (font-assets, editor, lib,
    // tool-sign) are what make it true here.
    exportGuards: affectedSet.has('export-guards'),
    reason: `narrowed to ${toolProjects.join(', ') || '(no tool project; site-e2e/fonts only)'}`,
  });
  return withTableSpecs(narrowed, tableRows.map(([f, row]) => [f, row.verdict.e2e]));
}

// QUAL-34: a narrow result gains the spec dirs its table files name (deduped) and says so in the reason.
function withTableSpecs(scope, tableVerdicts) {
  if (scope.everything || tableVerdicts.length === 0) return scope;
  const paths = scope.e2e_paths ? scope.e2e_paths.split(' ') : [];
  for (const [, e2e] of tableVerdicts) if (Array.isArray(e2e)) for (const p of e2e) if (!paths.includes(p)) paths.push(p);
  return { ...scope, e2e_paths: paths.join(' '), reason: `${scope.reason}; unowned files with their own verdict: ${tableVerdicts.map(([f]) => f).join(', ')}` };
}

function changedBuildFiles(buildFiles, files) {
  const set = buildFiles ?? realBuildPipelineFiles();
  return files.filter((f) => set.has(f));
}

// ARCH-34: the floor of a narrowed core verdict used to be every site-wide spec. `projects` is the
// site-wide e2e projects ({ name, paths, tools }, `tools` being the tool-<t> projects whose pages
// that directory's specs visit, declared in its project.json and checked against the specs by
// scripts/e2e-projects.test.mjs). Narrowing is allowed only when nothing can reach a spec by a path
// the walk does not follow, so it falls back to every site-wide path ("allPaths", the old floor) when
//   - no project list was supplied,
//   - the walk reached no tool (nothing says which directory is exposed), or
//   - a changed file sits outside src/ (the walk only covers src/) and is not itself inside a
//     site-wide e2e project (public/images, a config file, scripts/ ...).
// Otherwise a directory runs when it owns a changed file, owns a spec the walk reached, or declares
// a tool the walk reached.
function selectSiteE2eForReach({ projects, allPaths, files, roots, reached }) {
  if (!projects || reached.tools.length === 0) return allPaths;
  const names = new Set(projects.map((p) => p.name));
  const owners = new Set();
  for (const file of files) {
    if (isDocsOnly(file) || file.startsWith('src/')) continue;
    const owner = ownerOf(file, roots);
    if (!owner || !names.has(owner)) return allPaths;
    owners.add(owner);
  }
  for (const spec of reached.e2eFiles ?? []) {
    const owner = ownerOf(spec, roots);
    if (!owner || !names.has(owner)) return allPaths;
    owners.add(owner);
  }
  const reachedTools = new Set(reached.tools.map((t) => `tool-${t}`));
  return projects.filter((p) => owners.has(p.name) || [...p.tools].some((t) => reachedTools.has(t))).flatMap((p) => p.paths);
}

// Which tools a core-project change reaches, by import reachability (ARCH-32), or why it cannot
// say. Only files under src/ are walked: a file under e2e/, scripts/ or public/ is not what made
// Nx call a core project affected (nothing in src/ depends on those projects), and the rules in
// narrowResult already cover what they do run. A diff with no src/ file at all therefore leaves
// the core verdict unexplained, which widens.
function reachFromCore({ files, loadReachGraph, siteE2ePaths }) {
  if (!loadReachGraph) return { wide: 'no import graph supplied' };
  const seeds = files.filter((f) => f.startsWith('src/'));
  if (seeds.length === 0) return { wide: 'no src/ file explains the core verdict' };
  let graph;
  try {
    graph = loadReachGraph();
  } catch (err) {
    return { wide: `import graph unavailable: ${err.message}` };
  }
  const result = narrowByReachability({ changedFiles: seeds, knownFiles: graph.knownFiles, reverseEdges: graph.reverseEdges, toolOf: graph.toolOf, siteE2ePaths });
  if (result.wide) return { wide: result.wide };
  const why = result.tools.length ? result.tools.map((t) => `${t} via ${result.via.get(t)}`).join('; ') : 'nothing e2e imports the changed files';
  return { tools: result.tools, seeds, why, e2eFiles: result.e2eFiles };
}

// The scope for a narrowed run. `toolProjects` get their own src/tools/<t>/e2e/ dir. (Unit tests are
// selected by import impact, scripts/unit-scope.mjs, ARCH-28; this file no longer computes unit paths.)
function narrowResult({ files, affected, toolProjects, toolE2eExists, siteE2ePaths, includeSiteE2e, exportGuards, reason }) {
  const e2ePaths = toolProjects
    .filter((p) => toolE2eExists(p))
    .map((p) => `src/tools/${toolNameOf(p)}/e2e/`);
  if (includeSiteE2e) e2ePaths.push(...siteE2ePaths);

  return {
    everything: false,
    // ARCH-23: fonts is decided by the file-glob rule, never by whether Nx's
    // `fonts` project shows up in `affected` - that project's own
    // implicitDependencies no longer include editor/lib/tool-sign for
    // exactly this reason (see e2e/sign/project.json).
    fonts: files.some(matchesFontsGlob),
    export_guards: exportGuards,
    affected,
    e2e_paths: e2ePaths.join(' '),
    reason,
  };
}

// Exported for scripts/check-push.mjs (ARCH-29): it computes the scope once,
// the same way this file's own `main()` does, so the local pre-push command
// and this file's own `--base`/`--run` CLI cannot resolve two different
// diffs for the same push.
// QUAL-35: the one step both CI and check:push share after deriveScope.
export const finishScope = (scope, files) => narrowTestOnlyChange(scope, files);

export function resolveScope({ explicitBase, explicitHead }) {
  const base = resolveBase(explicitBase);
  if (!base) {
    return wide([], `no usable base (${explicitBase ?? 'origin/main'})`);
  }

  const files = changedFiles(base, explicitHead);
  if (files.length === 0) {
    return wide([], 'empty changed-file list');
  }

  let roots;
  let info;
  let affected;
  try {
    info = projectInfo();
    roots = new Map([...info].map(([name, node]) => [name, node.root]));
    // QUAL-34: table files stay out of the query (Nx marks most projects affected by middleware.ts).
    const nxFiles = filesForNx(files);
    affected = nxFiles.length === 0 ? [] : JSON.parse(nx(['show', 'projects', '--affected', `--files=${nxFiles.join(',')}`, '--json']));
  } catch (err) {
    return wide([], `nx error: ${err.message}`);
  }

  const e2eChildren = readdirSync(join(ROOT, 'e2e'), { withFileTypes: true })
    .map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));

  const siteE2eProjects = siteE2eProjectList(info, e2eChildren);

  return finishScope(deriveScope({
    files,
    affected,
    roots,
    toolE2eExists: (project) => existsSync(join(ROOT, `src/tools/${toolNameOf(project)}/e2e/`)),
    siteE2ePaths: siteE2eProjects.flatMap((p) => p.paths),
    siteE2eProjects,
    ciFontJobChanged: files.includes(CI_FILE) ? () => ciFontJobChangedBetween(base, explicitHead) : undefined,
    packageJsonReachesE2e: files.includes('package.json') ? () => packageJsonReachesE2eBetween(base, explicitHead) : undefined,
    // Scanned lazily: only a core-project verdict reads it, and then once.
    loadReachGraph: () => {
      const graph = buildReachGraph();
      return { knownFiles: graph.knownFiles, reverseEdges: graph.reverseEdges, toolOf: makeToolOf(graph.routeMap) };
    },
  }), files);
}

// QUAL-32: an empty e2e_paths is ambiguous (full suite vs nothing affected),
// and an empty Playwright filter runs everything. This is the one place that
// decides whether product e2e runs at all; CI gates its steps on the
// `product_e2e` output and runE2eProduct/runE2ePerf use it for the same early return.
export function runsProductE2e(scope) {
  return Boolean(scope.everything || scope.e2e_paths);
}

export function formatOutputs(scope) {
  return [
    `affected=${JSON.stringify(scope.affected)}`,
    `everything=${scope.everything}`,
    `e2e_paths=${scope.e2e_paths}`,
    `product_e2e=${runsProductE2e(scope)}`,
    `fonts=${scope.fonts}`,
    `export_guards=${scope.export_guards}`,
  ].join('\n');
}

function printOutputs(scope) {
  console.log(formatOutputs(scope));
}

function summaryMarkdown(scope) {
  return [
    '### Affected scope (ARCH-20)',
    '',
    `- **everything**: ${scope.everything} (${scope.reason})`,
    `- **affected projects**: ${scope.affected.length ? scope.affected.join(', ') : '(none)'}`,
    `- **e2e_paths**: ${scope.e2e_paths || (scope.everything ? '(full suite)' : '(none)')}`,
    `- **product_e2e**: ${runsProductE2e(scope) ? 'runs' : 'skipped, no tool or site e2e is affected'}`,
    `- **fonts**: ${scope.fonts}`,
    `- **export_guards**: ${scope.export_guards}`,
    '',
  ].join('\n');
}

// ARCH-28: unit selection no longer comes from this file's own
// project-level scope (a core-project verdict here would otherwise force
// all ~193 unit files, exactly the thing ARCH-28 replaces). `runUnit` is now
// a thin wrapper around scripts/unit-scope.mjs's own `resolveUnitScope`/
// `runUnitByImpact` - the same functions check-push.mjs calls directly
// against its own once-computed unit scope, so CI's `--run unit` and a local
// `check:push` never resolve two different diffs. Takes `{ explicitBase,
// explicitHead }` rather than this file's `scope` object on purpose: unit
// selection resolves its own (identically-based) scope internally instead of
// reading anything Nx decided.
export function runUnit({ explicitBase, explicitHead } = {}) {
  const unitScope = resolveUnitScope({ explicitBase, explicitHead });
  const summary = `all=${unitScope.all} seeds=${unitScope.seeds.length} - ${unitScope.reasons.join(' | ')}`;
  console.error(`affected-scope: unit selection (ARCH-28): ${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        '### Unit test selection (ARCH-28)',
        '',
        `- **all**: ${unitScope.all}`,
        `- **seeds**: ${unitScope.all ? '(full suite)' : unitScope.seeds.join(', ')}`,
        `- **reason**: ${unitScope.reasons.join('; ')}`,
        '',
      ].join('\n'),
    );
  }
  return runUnitByImpact(unitScope);
}

// `projects` lets check:e2e run chromium only locally; CI and test:e2e keep both.
export function runE2eProduct(scope, projects = ['chromium', 'webkit']) {
  if (!runsProductE2e(scope)) {
    console.error('affected-scope: no tool/site-e2e project affected; skipping product e2e.');
    return 0;
  }
  const paths = scope.everything ? [] : scope.e2e_paths.split(' ').filter(Boolean);
  const result = spawnSync('npx', ['playwright', 'test', ...projects.map((p) => `--project=${p}`), '--pass-with-no-tests', ...paths], { stdio: 'inherit', cwd: ROOT });
  return result.status ?? 1;
}

export function runE2ePerf(scope) {
  if (!runsProductE2e(scope)) {
    console.error('affected-scope: no tool/site-e2e project affected; skipping perf e2e.');
    return 0;
  }
  const paths = scope.everything ? [] : scope.e2e_paths.split(' ').filter(Boolean);
  const result = spawnSync('npx', ['playwright', 'test', '--project=perf', '--workers=1', '--pass-with-no-tests', ...paths], { stdio: 'inherit', cwd: ROOT });
  return result.status ?? 1;
}

export function runFonts(scope) {
  if (!scope.fonts) {
    console.error('affected-scope: fonts project not affected; skipping the font guards.');
    return 0;
  }
  const result = spawnSync('npx', ['playwright', 'test', '--project=fonts'], { stdio: 'inherit', cwd: ROOT });
  return result.status ?? 1;
}

// ARCH-23: the export render guard and language acceptance, split out of
// `fonts` into their own project - see e2e/export/project.json.
export function runExportGuards(scope) {
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

  // Unit selection resolves its own scope (scripts/unit-scope.mjs); skip the Nx graph it would discard.
  if (runMode === 'unit') return runUnit({ explicitBase, explicitHead });

  const scope = resolveScope({ explicitBase, explicitHead });
  console.error(`affected-scope: ${scope.reason}`);

  if (runMode) {
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
