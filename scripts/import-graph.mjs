// The src/ import graph, scanned once and shared (ARCH-32). scripts/check-module-boundaries.mjs
// (the boundary rules) and scripts/affected-scope.mjs (e2e selection by file-level reachability)
// both read the same edges, so the two cannot disagree about who imports what. Everything here is
// the scan only: relative imports, re-exports, dynamic `import()` and an `.astro` file's own
// `<script src>`; bare package imports are out of scope. No rule, no classification lives here.
//
// Every function that touches the disk takes a `root` (the repo root) defaulting to this checkout,
// so a caller can scan another tree - the replay that measures ARCH-32 extracts historical commits
// into a temp dir and scans each one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.astro'];
export const TEST_FILE = /\.(?:test|contract|spec)\.[cm]?[jt]sx?$/;

// `testFiles: true` inverts the TEST_FILE filter to collect only test files (rule 6's subject)
// instead of everything but test files (every other rule's subject); same walker, same extension
// list, no second directory walk.
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
export function resolveRelativeImport(fromFile, specifierRaw, root = REPO_ROOT) {
  const specifier = specifierRaw.split('?')[0]; // strip Vite's `?raw` etc.
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null; // bare package
  const base = specifier.startsWith('/') ? path.join(root, specifier) : path.resolve(path.dirname(fromFile), specifier);
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

export function relOf(absPath, root = REPO_ROOT) {
  return path.relative(root, absPath).split(path.sep).join('/');
}

// One deduped (from, to) edge per file pair over `files` (absolute paths). A file can import the
// same target from more than one statement (a value import and a type import, say); the callers
// care about the file-to-file edge existing at all, not how many times.
export function edgesOfFiles(files, root = REPO_ROOT) {
  const seen = new Set();
  const edges = [];
  for (const file of files) {
    const from = relOf(file, root);
    const source = fs.readFileSync(file, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue; // bare package, out of scope
      const resolved = resolveRelativeImport(file, specifier, root);
      if (!resolved) continue; // unresolved relative import is not this scan's concern
      const to = relOf(resolved, root);
      if (to === from) continue;
      const key = `${from} -> ${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from, to });
    }
  }
  return edges;
}

// The ordinary import graph of src/ without test files (the boundary rules' subject).
export function buildEdges(root = REPO_ROOT) {
  const files = collectSourceFiles(path.join(root, 'src'));
  return { files, edges: edgesOfFiles(files, root) };
}

// An `.astro` file's own `<script src="...">` tag is an edge the import scan does not see
// (`src/layouts/HomePageLayout.astro` loads `../site-lib/homeWorkspace.ts` this way). Read in its
// own pass; a bare specifier or an absolute/protocol URL is not a src/ edge.
const SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

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

// One edge per (astro file, script target) pair, over every `.astro` file in src/ - not only
// layouts, since a page or component could carry its own `<script src>` too.
export function astroScriptSrcEdges(root = REPO_ROOT) {
  const edges = [];
  for (const file of collectSourceFiles(path.join(root, 'src')).filter((f) => f.endsWith('.astro'))) {
    const from = relOf(file, root);
    const source = fs.readFileSync(file, 'utf8');
    for (const specifier of scriptSrcSpecifiers(source)) {
      const resolved = resolveRelativeImport(file, specifier, root);
      if (!resolved) continue;
      const to = relOf(resolved, root);
      if (to === from) continue;
      edges.push({ from, to });
    }
  }
  return edges;
}

// "Who imports me": to -> Set(from).
export function reverseEdgeMap(edges) {
  const reverse = new Map();
  for (const { from, to } of edges) {
    if (!reverse.has(to)) reverse.set(to, new Set());
    reverse.get(to).add(from);
  }
  return reverse;
}

// The tool -> routes map is derived, never hand-written: a top-level src/pages/<slug>.astro that
// imports `../tools/<t>/Pdf*Tool` maps route `/<slug>` to tool folder `<t>` (so /compress/ and
// /compress-image/ both belong to `compress`, /unlock/ to `security`, /pdf-to-image/ to
// `to-image`, /edit-pdf/ to `edit-pages`) - see docs/module-boundaries.md. Scans top-level
// src/pages/*.astro only (not src/pages/[locale]/, which renders several tools from one dynamic
// route and so cannot name "the" tool for a slug). Returns '/<slug>' (no trailing slash) -> tool.
const PAGE_TOOL_IMPORT = /\.\.\/tools\/([^/]+)\/Pdf[A-Za-z0-9]*Tool/;

export function buildToolRouteMap(pagesDir = path.join(REPO_ROOT, 'src', 'pages')) {
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

// Everything file-level e2e selection needs, in one scan of `root`: the reverse graph over
// source AND test/spec files plus `<script src>` edges (a spec under src/tools/<t>/e2e/ imports
// what it exercises, so it belongs in the walk), the set of files the scan knows (a changed file
// outside it - CSS, YAML, an image - is something the graph cannot speak for), and the route map.
// `middleware.ts` and `api/` are the request-time entry points outside src/ (CLAUDE.md: the two
// exceptions to "no server"); they are scanned too, so a src/ module they import reaches a file
// that is no tool and the walk widens instead of calling the change tool-local. `e2e/` is scanned
// for the other direction: the guard specs and harnesses there import src/ modules that no
// shipped code imports (the shaping harness imports liveFontCoverage), and the walk needs to see
// that edge to know where such a module ends.
export function buildReachGraph(root = REPO_ROOT) {
  const srcDir = path.join(root, 'src');
  const apiDir = path.join(root, 'api');
  const e2eDir = path.join(root, 'e2e');
  const middleware = path.join(root, 'middleware.ts');
  const files = [
    ...collectSourceFiles(srcDir, [], { testFiles: false }),
    ...collectSourceFiles(srcDir, [], { testFiles: true }),
    ...(fs.existsSync(e2eDir) ? [...collectSourceFiles(e2eDir, [], { testFiles: false }), ...collectSourceFiles(e2eDir, [], { testFiles: true })] : []),
    ...(fs.existsSync(apiDir) ? collectSourceFiles(apiDir, [], { testFiles: false }) : []),
    ...(fs.existsSync(middleware) ? [middleware] : []),
  ];
  const edges = [...edgesOfFiles(files, root), ...astroScriptSrcEdges(root)];
  return {
    knownFiles: new Set(files.map((f) => relOf(f, root))),
    reverseEdges: reverseEdgeMap(edges),
    routeMap: buildToolRouteMap(path.join(srcDir, 'pages')),
  };
}
