// The src/ import graph, scanned once and shared (ARCH-32). scripts/check-module-boundaries.mjs
// (the boundary rules) and scripts/affected-scope.mjs (e2e selection by file-level reachability)
// both read the same edges, so the two cannot disagree about who imports what. Everything here is
// the scan only: relative imports, re-exports, dynamic `import()`, `new URL(..., import.meta.url)`, `import.meta.glob` and an `.astro` file's own
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

// Comments blanked to spaces (newlines kept, so line numbers hold): prose like "the island import
// (so only ...)" must not read as a call. One pass that tracks '...', "..." and `...` literals
// (backslash escapes honoured; a ' or " literal ends at a newline) so `/*` inside a string is text.
// Regex literals are not tracked.
function blankComments(source) {
  let out = '';
  let quote = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      out += c;
      if (c === '\\') { out += source[i + 1] ?? ''; i++; } else if (c === quote || (c === '\n' && quote !== '`')) quote = null;
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

const lineOf = (source, index) => source.slice(0, index).split('\n').length;
const computedImport = (file, line) => new Error(`import-graph cannot read a computed import at ${file}:${line}; use a literal specifier`);

// Every `import(` call site. The pattern above takes the plain string form; this pass looks at what
// it cannot: a template literal with `${` or any non-literal argument has no static edge, so it
// throws (ARCH-49) rather than leave the graph with an edge it never saw. A template literal with
// no substitution is a plain specifier.
const DYNAMIC_IMPORT = /(?<![.\w$])import\s*\(\s*/g;
const STRING_ARGUMENT = /^(['"])[^'"\n]*\1\s*[,)]/;

function dynamicImportSpecifiers(source, file) {
  const specifiers = [];
  let match;
  DYNAMIC_IMPORT.lastIndex = 0;
  while ((match = DYNAMIC_IMPORT.exec(source)) !== null) {
    const rest = source.slice(match.index + match[0].length);
    if (STRING_ARGUMENT.test(rest)) continue; // the main pattern has it
    if (rest.startsWith(')')) continue; // `import()` with no argument is prose in a string, not a call
    const template = /^`([^`$\\]*)`\s*[,)]/.exec(rest);
    if (template) { specifiers.push(template[1]); continue; }
    // Test files and build-time scripts load modules dynamically on purpose; the boundary rules govern product code.
    if (TEST_FILE.test(path.basename(file)) || file.startsWith('scripts/')) continue;
    throw computedImport(file, lineOf(source, match.index));
  }
  return specifiers;
}

// `new URL('<relative literal>', import.meta.url)` is how bundlers find workers and assets: an edge.
const URL_IMPORT = /new\s+URL\s*\(\s*(['"`])(\.{1,2}\/[^'"`$\n]*)\1\s*,\s*import\.meta\.url\s*\)/g;

export function importSpecifiers(source, file = '<source>') {
  const specifiers = [];
  let match;
  IMPORT_PATTERN.lastIndex = 0;
  while ((match = IMPORT_PATTERN.exec(source)) !== null) {
    specifiers.push(match[1] || match[2] || match[3]);
  }
  const code = blankComments(source);
  specifiers.push(...dynamicImportSpecifiers(code, file));
  URL_IMPORT.lastIndex = 0;
  while ((match = URL_IMPORT.exec(code)) !== null) specifiers.push(match[2]);
  return specifiers;
}

// `import.meta.glob('<literal pattern>')` (or an array of literals) is an edge to every file the
// pattern matches. A non-literal argument cannot be expanded, so it throws like a computed import.
const GLOB_CALL = /import\.meta\.glob\s*\(\s*/g;
const GLOB_ARGUMENT = /^(?:(['"`])([^'"`$\n]+)\1|\[((?:\s*(['"`])[^'"`$\n]+\4\s*,?)+)\s*\])/;

export function importGlobPatterns(rawSource, file = '<source>') {
  const source = blankComments(rawSource);
  const patterns = [];
  let match;
  GLOB_CALL.lastIndex = 0;
  while ((match = GLOB_CALL.exec(source)) !== null) {
    const arg = GLOB_ARGUMENT.exec(source.slice(match.index + match[0].length));
    if (!arg) throw computedImport(file, lineOf(source, match.index));
    if (arg[2]) patterns.push(arg[2]);
    else patterns.push(...[...arg[3].matchAll(/(['"`])([^'"`]+)\1/g)].map((m) => m[2]));
  }
  return patterns.filter((p) => !p.startsWith('!'));
}

function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { i++; out += '(?:.*/)?'; } else out += '.*'; } else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else if (c === '{') out += '(?:';
    else if (c === '}') out += ')';
    else if (c === ',' && /\{[^}]*$/.test(glob.slice(0, i))) out += '|';
    else out += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

// Files (absolute paths) a glob pattern, relative to `fromFile` or rooted at `root` for a leading
// `/`, matches. Walks only the pattern's static directory prefix.
export function expandGlob(fromFile, pattern, root = REPO_ROOT) {
  const rooted = pattern.startsWith('/');
  const baseDir = rooted ? root : path.dirname(fromFile);
  const absolute = path.resolve(baseDir, rooted ? `.${pattern}` : pattern);
  const segments = absolute.split(path.sep);
  const firstGlob = segments.findIndex((seg) => /[*?{]/.test(seg));
  if (firstGlob === -1) return fs.existsSync(absolute) && fs.statSync(absolute).isFile() ? [absolute] : [];
  const staticDir = segments.slice(0, firstGlob).join(path.sep) || path.sep;
  if (!fs.existsSync(staticDir)) return [];
  const matcher = globToRegExp(absolute.split(path.sep).join('/'));
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (matcher.test(full.split(path.sep).join('/'))) out.push(full);
    }
  };
  walk(staticDir);
  return out;
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
    const targets = [];
    for (const specifier of importSpecifiers(source, from)) {
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue; // bare package, out of scope
      const resolved = resolveRelativeImport(file, specifier, root);
      if (resolved) targets.push(resolved); // unresolved relative import is not this scan's concern
    }
    for (const pattern of importGlobPatterns(source, from)) targets.push(...expandGlob(file, pattern, root));
    for (const target of targets) {
      const to = relOf(target, root);
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
// `to-image`, /organize-pdf/ to `edit-pages`) - see docs/module-boundaries.md. Scans top-level
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
// shipped code imports (the export harness imports editor modules directly), and the walk needs to see
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
