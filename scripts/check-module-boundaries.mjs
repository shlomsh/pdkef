#!/usr/bin/env node
// Ratchets the module boundaries drawn in docs/module-boundaries.md (ARCH-15). The
// repo has grown modules the folder layout does not show yet: a tool's logic sits
// beside another tool's in a flat src/components/, and the headless src/editor/
// core has a few edges back into it. This script reads the real, resolved import
// graph (relative imports/re-exports/dynamic import() only; bare package imports
// are out of scope) and fails on any edge that crosses a boundary the target
// layout draws, unless that edge is on the allowlist of pre-existing violations
// in scripts/module-boundaries-allowlist.json.
//
// It is a ratchet, the same pattern as check-css-duplication.js: the allowlist
// only ever shrinks. A fix removes its entry; a new violation with no entry
// fails the build; a stale entry (the edge no longer violates, because the fix
// landed) also fails the build, so nobody has to remember to clean it up.
//
// Classification is data-driven (MODULE_PREFIXES below) on purpose: ARCH-16
// through ARCH-19 move folders, not rules, so landing a move is "add/edit one
// table row", never "teach this script a new folder". See docs/module-boundaries.md
// for the layout, the evidence and the full rule list this file enforces; keep
// the two in sync by hand, since one is prose and the other is code.
//
// The rule set (must match docs/module-boundaries.md's "Dependency rules" section;
// the numbering below follows the doc, which is the record):
//   1. A tool (`tool:<name>`) may import `shell`, `editor-ui`, `editor`, `lib`,
//      and site's `i18n`/`data`. It may never import another tool, the site
//      surface (`pages`/`layouts`/`content`/`styles`/`.astro` components), or
//      the flat `components` module (HeroDemo/, `compareFigure.css`).
//   2. `shell`, `editor-ui`, `editor` and `lib` may never import a tool, and
//      may never import the `components` module. They may import site's
//      `i18n`/`data` (`site-i18n`/`site-data`), but never `site` itself
//      (pages/layouts/content/styles).
//   3. `editor` may never import `editor-ui` or `shell` (it is headless).
//   4. `site` (pages, layouts, content, data, i18n, styles, and the .astro
//      files still under `src/components/`) may reach a tool only through
//      that tool's island entry point, a `Pdf*Tool.tsx` directly under
//      `src/tools/<name>/`.
//   5. `components` (today's flat `src/components/`: since ARCH-18 landed,
//      only `.astro` site components - which classify as `site`, not
//      `components` - and `HeroDemo/` remain) must never import a tool.
//      There is no longer a transitional allowance the other way: rule 1
//      already covers a tool importing `components`, which is not permitted.
//   6. A test file (anything matching TEST_FILE, below) under `shell`,
//      `editor-ui`, `editor` or `lib`, or under one tool's own
//      `src/tools/<name>/` folder, may not import another tool's files: a
//      core test importing any tool, or a `tool:<a>` test importing
//      `tool:<b>`. `src/test/` (including `src/test/cross-tool/`, built for
//      exactly this) is exempt - a test placed there classifies as
//      `test-support`, not a core module or a tool, so this rule never
//      reaches it. Unlike rules 1-5, there is no allowlist for rule 6: it
//      must hold with zero violations, not ratchet down from today's count.
//
//   7. A `*.spec.js` under `src/tools/<t>/e2e/` may only reference that tool's
//      own routes (plus `/`) - a route derived statically from which top-level
//      `src/pages/<slug>.astro` imports `<t>`'s `Pdf*Tool.tsx`. A spec that
//      also drives another tool's page belongs under `e2e/` instead (DEBT-01).
//   8. Nothing under `src/`, `public/` or `e2e/` may import from `scripts/`
//      (ARCH-22): a script is dev-only real estate - CI checkers, build-time
//      generators, research tooling - none of it ships, so app source
//      depending on it would mean the shipped app depends on files a build
//      never bundles. Like rule 6, this holds at zero violations with no
//      allowlist, and deliberately covers test files too: a checker's own
//      unit test (e.g. `check-editor-dependency-directions.test.mjs`) lives
//      beside the script it tests, in `scripts/`, never under `src/test/`.
//   9. A module in a common layer (`shell`, `editor-ui`, `lib`) needs two or
//      more distinct consumers (ARCH-25): a tool (`src/tools/<name>/`, one
//      identity per tool) or the site (ARCH-26: a page, a layout, an
//      `.astro` component, an `i18n`/`data` module, a `src/site-lib/`
//      helper, or a file a layout loads via `<script src>` - every site
//      file credits one single "site" identity, the same way a tool is one
//      identity no matter how many of its own files import the module). A
//      consumer reached only through a chain of other common-layer modules
//      still counts, credited to whichever tool or the site the chain
//      eventually reaches. `editor` is out of scope for this rule: it is a
//      layered headless core whose adapters serve one tool by design, and
//      its shape is already governed by `check-editor-dependency-directions.mjs`
//      and, for field detection, by ARCH-24. `SignatureDialog.tsx` was the
//      one module this genuinely miscategorized, moved into `src/tools/sign/`
//      in the same change that added this rule, alongside `useCoarsePointer.ts`
//      (its only real consumer was always Sign). No exception list of any
//      kind: unlike the allowlist in rules 1-5, this holds at zero
//      violations like rules 6 and 8, so a module that fails it moves into
//      the tool that actually uses it, or is deleted if nothing does.
//
// An `.astro` file's own `<script src="...">` tag is an edge the main scan
// (buildEdges(), rules 1-8 and the allowlist) does not see
// (`src/layouts/HomePageLayout.astro:479` loads `../site-lib/homeWorkspace.ts`
// this way): that graph only follows `import`/`export ... from`/dynamic
// `import()`, not markup attributes, and DEBT-10 deliberately left it
// unparsed rather than teaching that pass HTML. Rule 9 alone reads it, in
// its own separate astroScriptSrcEdges() pass below, since otherwise a
// module loaded only this way would misread as having no site consumer.
//
// Anything not covered by these nine rules is not checked here (test
// infrastructure under src/test/ importing a tool gets one narrower rule of
// its own, below, because it is not part of the target layout
// docs/module-boundaries.md describes); this file is deliberately narrower
// than a full dependency-cruiser config.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const ALLOWLIST_PATH = path.join(__dirname, 'module-boundaries-allowlist.json');

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.astro'];
const TEST_FILE = /\.(?:test|contract|spec)\.[cm]?[jt]sx?$/;

// --- classification: one row per folder the target layout names --------------
// Order matters: a more specific prefix is checked before the generic
// src/components/ and site buckets. Tools need no row: classify() below
// recognizes src/tools/<name>/ directly (ARCH-17/18 moved every tool there).
const MODULE_PREFIXES = [
  ['src/shell/', () => 'shell'],
  ['src/editor-ui/', () => 'editor-ui'],
  ['src/editor/', () => 'editor'],
  // DEBT-05: site-only/build-only helpers with no tool, shell, editor or lib
  // consumer (contentMarkup, markdownRender, gitLastModified, cspHash,
  // localeOfflinePacks, acceptNegotiation). Distinct string from src/lib/, so
  // this row's position relative to it does not matter, but it is listed
  // before the generic 'site' buckets below since that is this table's
  // convention for anything more specific than a broad site prefix.
  ['src/site-lib/', () => 'site'],
  ['src/lib/', () => 'lib'],
  ['src/constants/', () => 'lib'],
  ['src/i18n/', () => 'site-i18n'],
  ['src/data/', () => 'site-data'],
  ['src/pages/', () => 'site'],
  ['src/layouts/', () => 'site'],
  ['src/content/', () => 'site'],
  ['src/styles/', () => 'site'],
  // Cross-cutting test infrastructure (setup.js, astroContentStub.js,
  // mockFileShare.js, setInputFiles.js, fixtures/): may import any core module
  // to build its harness, but never a tool - a helper reaching into one
  // tool's internals is the same laundering hazard a `null`/unclassified
  // module used to hide. src/test/**/*.test.js (the repo-wide guards) are
  // test files themselves, excluded from this main edge scan by TEST_FILE -
  // that exclusion is only true of this pass, though: rule 6's separate
  // testImportViolations() pass scans test files directly, and classifies
  // everything under src/test/ (cross-tool/ included) as `test-support` too,
  // which is why that folder is exempt from rule 6 rather than needing a
  // special case for it.
  ['src/test/', () => 'test-support'],
];

export function classify(relPath) {
  const toolFolder = relPath.match(/^src\/tools\/([^/]+)\//);
  if (toolFolder) return `tool:${toolFolder[1]}`;
  for (const [prefix, moduleOf] of MODULE_PREFIXES) {
    if (relPath.startsWith(prefix)) return moduleOf();
  }
  if (relPath.startsWith('src/components/')) {
    return relPath.endsWith('.astro') ? 'site' : 'components';
  }
  return null; // src/assets, src/content.config.ts, ...: outside the module graph
}

const isTool = (m) => typeof m === 'string' && m.startsWith('tool:');
const isSite = (m) => m === 'site' || m === 'site-i18n' || m === 'site-data';
const CORE_MODULES = new Set(['shell', 'editor-ui', 'editor', 'lib']);

// A tool's own island entry point: src/tools/<name>/Pdf*Tool.tsx. Every tool
// moved out of the flat src/components/ under ARCH-17/18, so this is the only
// shape rule 4 recognizes now.
function isToolEntryPoint(relPath) {
  return /^src\/tools\/[^/]+\/Pdf[A-Za-z0-9]*Tool\.tsx$/.test(relPath);
}

export function ruleViolation(fromModule, toModule, toRelPath) {
  if (!fromModule || !toModule || fromModule === toModule) return null;

  // Rule 1: a tool may not import another tool, the site surface, or `components`.
  if (isTool(fromModule) && isTool(toModule)) {
    return 'a tool may not import another tool';
  }
  if (isTool(fromModule) && (toModule === 'site' || toModule === 'components')) {
    return 'a tool may import site-i18n and site-data but not site (pages/layouts/content/styles) or the flat components module';
  }
  // Rule 2: shell/editor-ui/editor/lib may not import a tool or `components`.
  if (CORE_MODULES.has(fromModule) && isTool(toModule)) {
    return `${fromModule} may not import a tool`;
  }
  if (CORE_MODULES.has(fromModule) && toModule === 'components') {
    return `${fromModule} may not import the components module`;
  }
  if (CORE_MODULES.has(fromModule) && toModule === 'site') {
    return `${fromModule} may import site-i18n and site-data but not site (pages/layouts/content/styles)`;
  }
  // Rule 3: editor is headless.
  if (fromModule === 'editor' && (toModule === 'editor-ui' || toModule === 'shell')) {
    return 'editor is headless: it may not import editor-ui or shell';
  }
  // Rule 4: site may reach a tool only through its island entry point.
  if (isSite(fromModule) && isTool(toModule) && !isToolEntryPoint(toRelPath)) {
    return 'site may reach a tool only through its Pdf*Tool.tsx island entry point';
  }
  // Rule 5: `components` (HeroDemo/, compareFigure.css) may not import a tool.
  if (fromModule === 'components' && isTool(toModule)) {
    return 'the components module may not import a tool';
  }
  // Test infrastructure under src/test/: not part of the target layout, but
  // the same laundering hazard applies - it may build its harness out of any
  // core module, but never reach into one tool's internals.
  if (fromModule === 'test-support' && isTool(toModule)) {
    return 'test infrastructure under src/test/ may not import a tool';
  }
  return null;
}

// Rule 6: a test file may not launder a cross-tool import a real (non-test)
// file at the same location would be forbidden from making. Pure decision
// logic only, so it is unit-testable without walking the tree; the pass
// that calls it (testImportViolations(), below buildEdges()) supplies the
// two resolved relative paths. Both `shell`/`editor-ui`/`editor`/`lib` tests
// and a tool's own tests are covered by the same two checks; `src/test/`
// (cross-tool/ included) is exempt implicitly, because classify() puts it
// in `test-support`, neither a core module nor a tool.
export function testImportViolation(fromRelPath, toRelPath) {
  const fromModule = classify(fromRelPath);
  const toModule = classify(toRelPath);
  if (!fromModule || !toModule || fromModule === toModule) return null;
  if (CORE_MODULES.has(fromModule) && isTool(toModule)) {
    return `a test under ${fromModule} may not import a tool`;
  }
  if (isTool(fromModule) && isTool(toModule)) {
    return `a ${fromModule} test may not import another tool`;
  }
  return null;
}

// Rule 6's own pass: same file walk and import-specifier scan buildEdges()
// (below) uses, over test files instead of the rest of src/, checked against
// testImportViolation() instead of ruleViolation(). No allowlist - this must
// be green with zero entries. Placed here (function declarations are
// hoisted, so the forward references to collectSourceFiles/importSpecifiers/
// resolveRelativeImport/relOf/edgeKey below are fine) rather than at the end
// of the file, so a sibling change adding a further rule does not collide
// with this one on the same lines.
export function testImportViolations() {
  const files = collectSourceFiles(SRC, [], { testFiles: true });
  const seen = new Set();
  const violations = [];
  for (const file of files) {
    const from = relOf(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue; // bare package, out of scope
      const resolved = resolveRelativeImport(file, specifier);
      if (!resolved) continue;
      const to = relOf(resolved);
      if (to === from) continue;
      const key = edgeKey(from, to);
      if (seen.has(key)) continue;
      seen.add(key);
      const reason = testImportViolation(from, to);
      if (reason) violations.push({ from, to, fromModule: classify(from), toModule: classify(to), reason });
    }
  }
  return violations;
}

// --- import graph: relative-only, mirrors check-editor-dependency-directions.mjs ---
// Exported (with importSpecifiers and IMPORT_PATTERN) so
// scripts/check-module-boundaries.import-scan.test.mjs can diff this scan against
// a real TypeScript AST parse of the same files; main() only runs from the CLI.
// `testFiles: true` inverts the TEST_FILE filter to collect only test files
// (rule 6's subject) instead of the default of everything but test files
// (every other rule's subject); same walker, same extension list, no second
// directory walk.
export function collectSourceFiles(dir, out = [], { testFiles = false } = {}) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSourceFiles(full, out, { testFiles });
    else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name)) && TEST_FILE.test(entry.name) === testFiles) out.push(full);
  }
  return out;
}

// Matches `import ... from '...'`, `export ... from '...'`, a bare
// `import '...'` side-effect import, and `import('...')`. Deliberately static
// (no template-literal specifiers), same limitation as the editor guard. The
// import clause is matched by shape (`* as ns`, a `{ ... }` list, a default,
// or default plus one of those) rather than "anything up to `from`", so a
// `{` list spanning several lines counts: the first version stopped at the
// line break and missed every multi-line import (ARCH-20 prep found one).
const IMPORT_CLAUSE = String.raw`(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\}|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+[\w$]+))?)`;
export const IMPORT_PATTERN = new RegExp(
  String.raw`(?:^|\n)\s*(?:import|export)\s+${IMPORT_CLAUSE}\s*from\s+['"]([^'"]+)['"]`
  + String.raw`|import\s*\(\s*['"]([^'"]+)['"]\s*\)`
  + String.raw`|(?:^|\n)\s*import\s*['"]([^'"]+)['"]`,
  'g',
);

export function importSpecifiers(source) {
  const specifiers = [];
  let match;
  IMPORT_PATTERN.lastIndex = 0;
  while ((match = IMPORT_PATTERN.exec(source)) !== null) {
    specifiers.push(match[1] || match[2] || match[3]);
  }
  return specifiers;
}

// TS source imports routinely spell a `.ts` file's specifier with a `.js`
// extension (Node ESM resolution rules); try the exact path first, then swap
// any existing extension for each candidate before falling back to appending
// one, then to an index file.
function resolveRelativeImport(fromFile, specifierRaw) {
  const specifier = specifierRaw.split('?')[0]; // strip Vite's `?raw` etc.
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null; // bare package
  const base = specifier.startsWith('/') ? path.join(ROOT, specifier) : path.resolve(path.dirname(fromFile), specifier);
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((e) => stem + e),
    ...SOURCE_EXTENSIONS.map((e) => base + e),
    ...SOURCE_EXTENSIONS.map((e) => path.join(base, `index${e}`)),
  ];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

function relOf(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join('/');
}

export function buildEdges() {
  const files = collectSourceFiles(SRC);
  const seen = new Set();
  const edges = [];
  for (const file of files) {
    const from = relOf(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue; // bare package, out of scope
      const resolved = resolveRelativeImport(file, specifier);
      if (!resolved) continue; // unresolved relative import is not this script's concern
      const to = relOf(resolved);
      if (to === from) continue;
      // A file can import the same target from more than one statement (a
      // value import and a type import, say); the boundary rules care about
      // the file-to-file edge existing at all, not how many times.
      const key = edgeKey(from, to);
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from, to });
    }
  }
  return { files, edges };
}

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return [];
  const parsed = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${relOf(ALLOWLIST_PATH)} must be a JSON array`);
  return parsed;
}

function edgeKey(from, to) {
  return `${from} -> ${to}`;
}

function main() {
  const { files, edges } = buildEdges();

  const violations = [];
  for (const { from, to } of edges) {
    const reason = ruleViolation(classify(from), classify(to), to);
    if (reason) violations.push({ from, to, reason });
  }

  const allowlist = loadAllowlist();
  const allowlistKeys = new Map(allowlist.map((entry) => [edgeKey(entry.from, entry.to), entry]));
  const violationKeys = new Set(violations.map((v) => edgeKey(v.from, v.to)));

  const unallowed = violations.filter((v) => !allowlistKeys.has(edgeKey(v.from, v.to)));
  const stale = allowlist.filter((entry) => !violationKeys.has(edgeKey(entry.from, entry.to)));

  const testViolations = testImportViolations();
  const specRouteIssues = toolSpecRouteViolations();
  const scriptsViolations = scriptsImportViolations();
  const consumerViolations = commonLayerConsumerViolations();

  if (
    unallowed.length > 0 || stale.length > 0 || testViolations.length > 0
    || specRouteIssues.length > 0 || scriptsViolations.length > 0 || consumerViolations.length > 0
  ) {
    console.error('Module boundary check failed:');
    if (unallowed.length > 0) {
      console.error('\nNew violations (not on the allowlist):');
      for (const v of unallowed) console.error(`  ${v.from} -> ${v.to} (${v.reason})`);
    }
    if (stale.length > 0) {
      console.error('\nStale allowlist entries (no longer violate; remove them from scripts/module-boundaries-allowlist.json):');
      for (const entry of stale) console.error(`  ${entry.from} -> ${entry.to}`);
    }
    if (testViolations.length > 0) {
      console.error('\nTest files crossing a tool boundary (rule 6, no allowlist):');
      for (const v of testViolations) console.error(`  ${v.from} -> ${v.to} (${v.reason})`);
    }
    if (specRouteIssues.length > 0) {
      console.error("\nRule 7 violations (a tool's e2e spec referencing another tool's route):");
      for (const v of specRouteIssues) {
        console.error(`  ${v.file}: references '${v.route}' (owned by tool:${v.owner}) - move this spec under e2e/`);
      }
    }
    if (scriptsViolations.length > 0) {
      console.error('\nsrc/, public/ or e2e/ importing scripts/ (rule 8, no allowlist):');
      for (const v of scriptsViolations) console.error(`  ${v.from} -> ${v.to} (${v.reason})`);
    }
    if (consumerViolations.length > 0) {
      console.error('\nCommon-layer module with fewer than two consumers (rule 9, shell/editor-ui/lib, no exceptions):');
      for (const v of consumerViolations) {
        const named = v.consumers.length > 0 ? v.consumers.join(', ') : 'none';
        console.error(`  ${v.file} (${v.module}): ${v.consumers.length} consumer(s) - ${named}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  const testFileCount = collectSourceFiles(SRC, [], { testFiles: true }).length;
  console.log(
    `Module boundary check passed: ${files.length} files scanned, ${edges.length} relative import edges, `
    + `${allowlist.length} allowlisted violation(s) remaining (all still real, none new); `
    + `${testFileCount} test files scanned for rule 6, every tool e2e spec for rule 7, `
    + `src/, public/, e2e/ scanned for rule 8, and every shell/editor-ui/lib module `
    + `checked for two or more consumers (rule 9, editor out of scope), 0 violations.`,
  );
}

// --- rule 7: a tool's own e2e spec may only reference that tool's own routes ---
// Separate, self-contained pass added for DEBT-01, kept at the end of the file
// so a parallel addition (DEBT-02's rule 6, for test-file imports) merges
// cleanly above it. Same static stance as the import scan above: string/regex
// literals only, no evaluation, comments stripped first so a route mentioned
// only in prose never counts.
//
// The tool -> routes map is derived, never hand-written: a top-level
// src/pages/<slug>.astro that imports `../tools/<t>/Pdf*Tool` maps route
// `/<slug>` to tool folder `<t>` (so /compress/ and /compress-image/ both
// belong to `compress`, /unlock/ to `security`, /pdf-to-image/ to `to-image`,
// /edit-pdf/ to `edit-pages`) - see docs/module-boundaries.md and
// buildToolRouteMap() below.

const SPEC_FILE = /\.spec\.[cm]?[jt]sx?$/;
const PAGE_TOOL_IMPORT = /\.\.\/tools\/([^/]+)\/Pdf[A-Za-z0-9]*Tool/;

// Scans top-level src/pages/*.astro only (not src/pages/[locale]/, which
// renders several tools from one dynamic route and so cannot name "the" tool
// for a slug the way a real, single-tool page can). Returns a Map of
// '/<slug>' (no trailing slash) -> tool folder name.
export function buildToolRouteMap(pagesDir = path.join(SRC, 'pages')) {
  const routeMap = new Map();
  if (!fs.existsSync(pagesDir)) return routeMap;
  for (const entry of fs.readdirSync(pagesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.astro')) continue;
    const source = fs.readFileSync(path.join(pagesDir, entry.name), 'utf8');
    const match = source.match(PAGE_TOOL_IMPORT);
    if (!match) continue;
    const slug = entry.name.slice(0, -'.astro'.length);
    routeMap.set(`/${slug}`, match[1]);
  }
  return routeMap;
}

// Line and block comments stripped before scanning, so a route mentioned only
// in prose (a header comment explaining a hand-off, say) never counts. The
// `(^|[^:])` guard keeps a `https://` scheme intact rather than treating it as
// a line comment.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// Regex literals spell a route's slashes escaped (`\/redact\/`); collapsing
// `\/` to `/` first means one pattern below finds a route whether it came
// from a quoted string, a template literal, or a regex literal, with no need
// to tell the three apart.
function unescapeRegexSlashes(source) {
  return source.replace(/\\\//g, '/');
}

// Matches `/<slug>` with an optional trailing slash and an optional
// two-letter locale prefix (`/he/redact`), and refuses to match a longer slug
// that merely starts the same way (`/redact` must not match `/redaction`).
function routeMentionPattern(slug) {
  return new RegExp(String.raw`\/(?:[a-z]{2}(?:-[A-Za-z]+)?\/)?${slug}\/?(?![\w-])`);
}

// The pure check: given one spec file's repo-relative path and source text,
// plus the tool -> route map, return every foreign route it mentions ({route,
// owner}, owner being the tool that actually owns that route). Returns []
// for a spec outside src/tools/<t>/e2e/, for one that stays on its own tool's
// routes, and for `/` (never in routeMap, so never flagged). Exported so
// scripts/check-module-boundaries.rules.test.mjs can drive it with a small literal
// routeMap and no dependency on the real src/pages/.
export function specRouteViolation(specRelPath, source, routeMap) {
  const ownerMatch = specRelPath.match(/^src\/tools\/([^/]+)\/e2e\//);
  if (!ownerMatch) return [];
  const owner = ownerMatch[1];
  const scanText = unescapeRegexSlashes(stripComments(source));

  const violations = [];
  for (const [route, tool] of routeMap) {
    if (tool === owner) continue;
    if (routeMentionPattern(route.slice(1)).test(scanText)) {
      violations.push({ route, owner: tool });
    }
  }
  return violations;
}

function collectToolSpecFiles(toolsDir) {
  const out = [];
  if (!fs.existsSync(toolsDir)) return out;
  for (const toolEntry of fs.readdirSync(toolsDir, { withFileTypes: true })) {
    if (!toolEntry.isDirectory()) continue;
    const e2eDir = path.join(toolsDir, toolEntry.name, 'e2e');
    if (!fs.existsSync(e2eDir)) continue;
    collectSpecFilesRecursive(e2eDir, out);
  }
  return out;
}

function collectSpecFilesRecursive(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSpecFilesRecursive(full, out);
    else if (SPEC_FILE.test(entry.name)) out.push(full);
  }
  return out;
}

// The file-walking wrapper main() calls: every `src/tools/<t>/e2e/**/*.spec.js`
// file against the real, derived route map, flattened to one entry per
// (file, foreign route) pair.
export function toolSpecRouteViolations() {
  const routeMap = buildToolRouteMap();
  const specFiles = collectToolSpecFiles(path.join(SRC, 'tools'));
  const violations = [];
  for (const file of specFiles) {
    const rel = relOf(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const v of specRouteViolation(rel, source, routeMap)) {
      violations.push({ file: rel, route: v.route, owner: v.owner });
    }
  }
  return violations;
}

// --- rule 8: nothing under src/, public/ or e2e/ may import from scripts/ -----
// ARCH-22: scripts/ is dev-only real estate; app source may never depend on
// it. Same shape as rule 6 - no allowlist, holds at zero violations, and
// deliberately scans test files too - a checker's own unit test (e.g.
// check-editor-dependency-directions.test.mjs) lives beside the script it
// tests, in scripts/, never under src/test/. Rules 1-7
// only ever needed to walk src/ (buildEdges()'s SRC-only collectSourceFiles());
// this pass walks public/ and e2e/ too, of its own accord, rather than
// widening that shared walk - public/ has no ES imports today (public/sw.js
// is a plain script) and e2e/ is Playwright specs that may import fixtures,
// so either could gain a real edge into scripts/ the src/-only walk would miss.
const RULE8_ROOTS = [SRC, path.join(ROOT, 'public'), path.join(ROOT, 'e2e')];

export function scriptsImportViolation(toRelPath) {
  if (!toRelPath.startsWith('scripts/')) return null;
  return 'scripts/ is dev-only; nothing under src/, public/ or e2e/ may import from it';
}

// The file-walking wrapper main() calls: every file under src/, public/ and
// e2e/ (test files included, unlike the default rules-1-5 walk), scanned the
// same way buildEdges() scans src/ - resolved relative imports only, flattened
// to one entry per (from, to) edge whose target lands under scripts/.
export function scriptsImportViolations() {
  const violations = [];
  const seen = new Set();
  for (const root of RULE8_ROOTS) {
    if (!fs.existsSync(root)) continue;
    const files = [
      ...collectSourceFiles(root, [], { testFiles: false }),
      ...collectSourceFiles(root, [], { testFiles: true }),
    ];
    for (const file of files) {
      const from = relOf(file);
      const source = fs.readFileSync(file, 'utf8');
      for (const specifier of importSpecifiers(source)) {
        if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue; // bare package, out of scope
        const resolved = resolveRelativeImport(file, specifier);
        if (!resolved) continue;
        const to = relOf(resolved);
        if (to === from) continue;
        const reason = scriptsImportViolation(to);
        if (!reason) continue;
        const key = edgeKey(from, to);
        if (seen.has(key)) continue;
        seen.add(key);
        violations.push({ from, to, reason });
      }
    }
  }
  return violations;
}

// --- rule 9: a common-layer module needs two or more consumers ---------------
// ARCH-25: docs/module-boundaries.md defines "common" - a shell/editor-ui/lib
// module earns its place only when two or more distinct consumers use it.
// `editor` is out of scope for this rule: it is a layered headless core whose
// per-tool adapters (form detection, the signing adapter, the redaction
// adapter, and the like) serve one tool by design, not by oversight, and its
// shape is already governed by `check-editor-dependency-directions.mjs` and,
// for field detection specifically, by ARCH-24 - a second "two consumers"
// check on top of that one would only be fighting the same layer with two
// rules. `editor` modules are still walked when computing another layer's
// consumers (see the CORE_MODULES chain-walk below): an `editor` module is
// simply never itself checked for a consumer count.
//
// A consumer is a tool (`src/tools/<name>/`: one identity per tool, no
// matter how many of its own files import the module) or the site - ARCH-26:
// every site file (a page, a layout, an `.astro` component, an `i18n`/`data`
// module, a `src/site-lib/` helper, or a file a layout loads via
// `<script src>`) credits the same single `SITE_CONSUMER` identity, exactly
// like a tool is one identity regardless of how many of its own files reach
// back here - "the site" is one consumer, not one per file. A consumer
// reached only through a chain of other common-layer modules still counts,
// credited to whichever tool or the site the chain eventually reaches: a
// `lib` module consumed only by `shell` (or another `lib` module) counts via
// the tools that reach `shell`, and the same holds when the chain passes
// through `editor` or `editor-ui` on its way to a tool. Test files never
// count (TEST_FILE already excludes them from collectSourceFiles()'s default
// walk, the same exclusion every rule above but rule 6/8 relies on).
//
// DEBT-10 deliberately left `.astro` `<script src="...">` unparsed for the
// main edge scan above (buildEdges()), and that decision stands: rules 1-8
// and the allowlist still see only the plain-import graph. This rule reads
// `<script src="...">` in a separate pass (astroScriptSrcEdges(), below)
// solely to answer "does the site consume this module" - without it, a
// module loaded only through a layout's `<script src>`, with no ordinary
// import anywhere, would misread as consumed by nobody, when the site
// genuinely depends on it.
const SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

// Same relative-only stance as importSpecifiers/resolveRelativeImport: a
// bare specifier or an absolute/protocol URL is not a src/ edge.
export function scriptSrcSpecifiers(source) {
  const specifiers = [];
  let match;
  SCRIPT_SRC.lastIndex = 0;
  while ((match = SCRIPT_SRC.exec(source)) !== null) {
    const specifier = match[1];
    if (specifier.startsWith('.') || specifier.startsWith('/')) specifiers.push(specifier);
  }
  return specifiers;
}

// One edge per (astro file, script target) pair, over every `.astro` file in
// src/ - not only layouts, since a page or component could carry its own
// `<script src>` too and this pass has no reason to assume otherwise.
// Exported so a test can prove the wiring end to end against the real tree
// (a module like `src/site-lib/homeWorkspace.ts`, loaded only this way, needs
// this pass to be reachable at all) rather than only against a fixture.
export function astroScriptSrcEdges() {
  const edges = [];
  for (const file of collectSourceFiles(SRC).filter((f) => f.endsWith('.astro'))) {
    const from = relOf(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const specifier of scriptSrcSpecifiers(source)) {
      const resolved = resolveRelativeImport(file, specifier);
      if (!resolved) continue;
      const to = relOf(resolved);
      if (to === from) continue;
      edges.push({ from, to });
    }
  }
  return edges;
}

// The single identity every site file (a page, a layout, an `.astro`
// component, an `i18n`/`data` module, or a `src/site-lib/` helper) shares
// (ARCH-26). Distinct from any `tool:<name>` string, so it can never collide
// with a tool identity.
const SITE_CONSUMER = 'site';

// The pure graph algorithm: given the reverse ("who imports me") adjacency
// built from every (from, to) edge - the ordinary import graph plus
// astroScriptSrcEdges() - find which tools and the site ultimately consume
// `target`. Walks backwards from `target` and keeps walking through any
// core-module node (shell/editor-ui/editor/lib) it reaches, the
// "common-layer-internal chain" the doc describes - `editor` included, even
// though rule 9 never checks an `editor` file's own consumer count (see the
// rule 9 header comment above), because a chain can still legitimately pass
// through it on the way to a tool; a tool or a qualifying site file stops
// that branch and is recorded (by `tool:<name>`, or by the fixed
// `SITE_CONSUMER` identity - every site file credits the same one, since the
// site is one consumer, exactly like a tool is, no matter how many of its own
// files reach back here (ARCH-26)); anything else (`components`,
// `test-support`, an unclassified path) is a dead end - recorded as nothing,
// walked no further. Exported and given a plain `Map` so a test can hand it a
// small literal graph, the same style rule 7's specRouteViolation() uses a
// literal route map.
export function commonLayerConsumers(target, reverseEdges) {
  const consumers = new Set();
  const visited = new Set([target]);
  const stack = [...(reverseEdges.get(target) || [])];
  while (stack.length) {
    const node = stack.pop();
    if (visited.has(node)) continue;
    visited.add(node);
    const nodeModule = classify(node);
    if (isTool(nodeModule)) {
      // A tool is one identity regardless of which of its own files
      // reaches back here, and nothing legitimately imports further past
      // a tool boundary (rule 1 forbids tool-to-tool, rule 4 forbids site
      // reaching past a tool's entry point), so this branch stops here.
      consumers.add(nodeModule);
      continue;
    }
    if (isSite(nodeModule)) {
      // The site is one identity, not one per file (ARCH-26): a page and
      // the layout it renders through both credit SITE_CONSUMER, not two
      // separate entries. The site is itself a graph (a page imports a
      // layout imports a component), so keep walking past it too, the same
      // as a common-layer node, to find every path the chain takes - it
      // just no longer matters how many distinct site files are on it.
      consumers.add(SITE_CONSUMER);
    }
    if (CORE_MODULES.has(nodeModule) || isSite(nodeModule)) {
      for (const next of reverseEdges.get(node) || []) stack.push(next);
    }
    // `components`, `test-support`, or unclassified (null): dead end.
  }
  return consumers;
}

// The file-walking wrapper main() calls: every non-test file classified
// shell/editor-ui/lib (RULE9_LAYERS - editor is out of scope, see the header
// comment above), checked against the combined reverse graph (ordinary
// imports plus `<script src>`). No allowlist, like rules 6 and 8, and no
// exception list either: ARCH-25 measured the tree at exactly one violation
// once editor was taken out of scope, `SignatureDialog.tsx`, moved into
// `src/tools/sign/` in the same change that added this rule, so it holds at
// zero from the start. A module that later fails this check belongs in a
// tool instead, or should be deleted if nothing uses it - not exempted.
const RULE9_LAYERS = new Set(['shell', 'editor-ui', 'lib']);

export function commonLayerConsumerViolations() {
  const { edges } = buildEdges();
  const allEdges = [...edges, ...astroScriptSrcEdges()];
  const reverseEdges = new Map();
  for (const { from, to } of allEdges) {
    if (!reverseEdges.has(to)) reverseEdges.set(to, new Set());
    reverseEdges.get(to).add(from);
  }

  const violations = [];
  for (const file of collectSourceFiles(SRC)) {
    const rel = relOf(file);
    const moduleOf = classify(rel);
    if (!RULE9_LAYERS.has(moduleOf)) continue;
    const consumers = commonLayerConsumers(rel, reverseEdges);
    if (consumers.size < 2) violations.push({ file: rel, module: moduleOf, consumers: [...consumers] });
  }
  return violations;
}

// Kept last so every helper above (including rule 7's) is defined before
// main() can possibly run.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
