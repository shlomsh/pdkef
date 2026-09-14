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
//      may never import the `components` module.
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
// Anything not covered by these six rules is not checked here (test
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
// src/test/moduleBoundariesImportScan.test.js can diff this scan against a real
// TypeScript AST parse of the same files; main() only runs from the CLI.
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

function buildEdges() {
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

  if (unallowed.length > 0 || stale.length > 0 || testViolations.length > 0) {
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
    process.exitCode = 1;
    return;
  }

  const testFileCount = collectSourceFiles(SRC, [], { testFiles: true }).length;
  console.log(
    `Module boundary check passed: ${files.length} files scanned, ${edges.length} relative import edges, `
    + `${allowlist.length} allowlisted violation(s) remaining (all still real, none new); `
    + `${testFileCount} test files scanned for rule 6, 0 violations.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
