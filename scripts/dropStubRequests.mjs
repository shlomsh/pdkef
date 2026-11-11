/*
 * MEM-37: a request per file is what Vercel bills, and after bundling most client entries are
 * one-line stubs: `import"../shared/site.js";` for a page script, `export{t as default}from"../shared/x.js";`
 * for an island. This post-build step (after `astro build`, before the precache manifest and the CSP
 * check) points each page straight at the file the stub names:
 *   - `<script type="module" src=stub>` becomes a script for the stub's target; a later tag that resolves
 *     to a target already loaded on the page is dropped. Module evaluation order is what a browser does
 *     with the first reference to each module, and that is kept (checked, see `evaluatedModules`).
 *   - `<astro-island component-url=stub component-export=default>` gets component-url = the chunk and
 *     component-export = the chunk's own export name (Astro reads `module[componentExport]`).
 *     renderer-url stays: the island runtime destructures `default` from it.
 * The stub FILES stay in dist/: nothing new references them, so no precache closure carries them, but a
 * tab or a back-navigation still holding the previous build's HTML asks for them and must not get a 404
 * (a failed <script type=module> load fires no handler of ours; a failed island import only logs).
 *
 * Pure decisions first (no file I/O), one thin function that reads dist and writes the pages, then the
 * checks over the final dist. A violation or a build that matched nothing exits non-zero.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUOTED = '(?:"([^"]*)"|\'([^\']*)\')';
const IMPORT_STUB = new RegExp(`^import\\s*${QUOTED};?$`);
const REEXPORT_STUB = new RegExp(`^export\\s*\\{([^}]*)\\}\\s*from\\s*${QUOTED};?$`);
const stripSourceMap = (code) => code.replace(/\n?\/\/[#@]\s*sourceMappingURL=\S*\s*$/, '').trim();

/** The specifier a file's one-and-only statement imports for effect, or null when the file is anything else. */
export function isImportStub(code) {
  const m = IMPORT_STUB.exec(stripSourceMap(code));
  return m ? (m[1] ?? m[2]) : null;
}

/**
 * `{ target, exportName }` for a file that only re-exports names from one other file, one of them as `default`:
 * exportName is what the target calls that export. Other re-exported names are carried along and not needed.
 */
export function isReexportStub(code) {
  const m = REEXPORT_STUB.exec(stripSourceMap(code));
  if (!m) return null;
  for (const part of m[1].split(',')) {
    const [local, exported = local] = part.trim().split(/\s+as\s+/);
    if (exported === 'default' && /^[\w$]+$/.test(local)) return { target: m[2] ?? m[3], exportName: local };
  }
  return null;
}

/** Follows import stubs that point at import stubs, so a script always lands on a file with real code. */
export function resolveStubChains(stubs) {
  const out = new Map();
  for (const [url, stub] of stubs) {
    let { target } = stub;
    const seen = new Set([url]);
    while (!stub.exportName && stubs.has(target) && !stubs.get(target).exportName && !seen.has(target)) {
      seen.add(target);
      target = stubs.get(target).target;
    }
    out.set(url, { ...stub, target });
  }
  return out;
}

const attrPattern = (name) => new RegExp(`(\\s${name}=)(?:"([^"]*)"|'([^']*)')`);
const getAttr = (tag, name) => {
  const m = attrPattern(name).exec(tag);
  return m ? (m[2] ?? m[3]) : undefined;
};
const setAttr = (tag, name, value) => tag.replace(attrPattern(name), (whole, head) => `${head}${whole.endsWith("'") ? `'${value}'` : `"${value}"`}`);

const SCRIPT_TAG = /<script\b([^>]*)>\s*<\/script>/g;
const ISLAND_TAG = /<astro-island\b[^>]*>/g;
const isModuleSrc = (attrs) => getAttr(attrs, 'type') === 'module' && getAttr(attrs, 'src') !== undefined;
const resolved = (stubs, url) => stubs.get(url)?.target ?? url;

/** Every module URL a page's module scripts and islands name, for the caller to look at. */
export function referencedModuleUrls(html) {
  const urls = [];
  for (const m of html.matchAll(SCRIPT_TAG)) if (isModuleSrc(m[1])) urls.push(getAttr(m[1], 'src'));
  for (const m of html.matchAll(ISLAND_TAG)) {
    const url = getAttr(m[0], 'component-url');
    if (url !== undefined) urls.push(url);
  }
  return [...new Set(urls)];
}

/**
 * The distinct modules a page's tags evaluate, stubs resolved to their targets, in order of first reference.
 * Scripts and islands are listed apart: a script runs at load, an island's module when its island hydrates.
 */
export function evaluatedModules(html, stubs) {
  const scripts = new Set();
  const islands = new Set();
  for (const m of html.matchAll(SCRIPT_TAG)) if (isModuleSrc(m[1])) scripts.add(resolved(stubs, getAttr(m[1], 'src')));
  for (const m of html.matchAll(ISLAND_TAG)) {
    const url = getAttr(m[0], 'component-url');
    if (url !== undefined) islands.add(resolved(stubs, url));
  }
  return { scripts: [...scripts], islands: [...islands] };
}

/**
 * `stubs` maps a file URL to `{ target }` (an import stub) or `{ target, exportName }` (a re-export stub).
 * Returns the page with its stub references replaced and the stub URLs it no longer asks for.
 */
export function rewritePage(html, stubs) {
  const removed = new Set();
  const loaded = new Map(); // target -> whether the tag that loaded it was a stub
  let out = html.replace(SCRIPT_TAG, (tag, attrs) => {
    if (!isModuleSrc(attrs)) return tag;
    const src = getAttr(attrs, 'src');
    const stub = stubs.get(src);
    const target = resolved(stubs, src);
    if (loaded.has(target) && (stub || loaded.get(target))) {
      if (stub) removed.add(src);
      return '';
    }
    loaded.set(target, Boolean(stub));
    if (!stub) return tag;
    removed.add(src);
    return tag.replace(attrs, setAttr(attrs, 'src', target));
  });
  out = out.replace(ISLAND_TAG, (tag) => {
    const url = getAttr(tag, 'component-url');
    const stub = url === undefined ? undefined : stubs.get(url);
    const named = getAttr(tag, 'component-export');
    if (!stub?.exportName || (named !== undefined && named !== 'default')) return tag;
    removed.add(url);
    let next = setAttr(tag, 'component-url', stub.target);
    next = named === undefined ? next.replace(/>$/, ` component-export="${stub.exportName}">`) : setAttr(next, 'component-export', stub.exportName);
    return next;
  });
  return { html: out, removed: [...removed] };
}

// ---- checks over the final dist: `view` is { pages: Map<url, html>, code: Map<url, text>, urls: Set<url> } ----

const CODE_URL = /^\/(?:site|shared|_astro)\//;
const URL_ATTRS = ['src', 'href', 'component-url', 'renderer-url', 'before-hydration-url'];

/** Pages naming a /site/, /shared/ or /_astro/ file that is not in dist. */
export function findDanglingRefs(view) {
  const problems = [];
  for (const [page, html] of view.pages) {
    for (const tag of html.match(/<(?:script|link|astro-island)\b[^>]*>/g) ?? []) {
      for (const name of URL_ATTRS) {
        const url = getAttr(tag, name)?.split(/[?#]/)[0];
        if (url && CODE_URL.test(url) && !view.urls.has(url)) problems.push(`${page}: ${name} ${url} names a file that does not exist`);
      }
    }
  }
  return problems;
}

/** Pages with a module script that still points at a file that is only an import. */
export function findStubScripts(view) {
  const problems = [];
  for (const [page, html] of view.pages) {
    for (const m of html.matchAll(SCRIPT_TAG)) {
      if (!isModuleSrc(m[1])) continue;
      const src = getAttr(m[1], 'src');
      const code = view.code.get(src.split(/[?#]/)[0]);
      if (code !== undefined && isImportStub(code) !== null) problems.push(`${page}: <script type="module" src="${src}"> still points at a stub that only imports another file`);
    }
  }
  return problems;
}

/** The names a built chunk exports (`export{a as b}`, `export default`, `export function f`). */
export function exportNames(code) {
  const names = new Set();
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const piece = part.trim().split(/\s+as\s+/);
      if (piece[0]) names.add(piece[piece.length - 1]);
    }
  }
  if (/\bexport\s+default\b/.test(code)) names.add('default');
  for (const m of code.matchAll(/\bexport\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([\w$]+)/g)) names.add(m[1]);
  return names;
}

/** Islands whose component-url file is missing or does not export the name in component-export. */
export function findBadIslandExports(view) {
  const problems = [];
  for (const [page, html] of view.pages) {
    for (const tag of html.match(ISLAND_TAG) ?? []) {
      const url = getAttr(tag, 'component-url');
      if (url === undefined) continue;
      const wanted = getAttr(tag, 'component-export') ?? 'default';
      const code = view.code.get(url.split(/[?#]/)[0]);
      if (code === undefined) problems.push(`${page}: island component-url ${url} names a file that is not built JS`);
      else if (!exportNames(code).has(wanted)) problems.push(`${page}: island component-export "${wanted}" is not exported by ${url}`);
    }
  }
  return problems;
}

/** All problems the final dist has; an empty list is a pass. `removedCount` is how many stub references were dropped. */
export function verifyDist(view, { removedCount }) {
  const problems = [...findDanglingRefs(view), ...findStubScripts(view), ...findBadIslandExports(view)];
  if (removedCount < 1) {
    problems.push('no stub request was removed: either the build output shape changed (the stub file or tag patterns in scripts/dropStubRequests.mjs no longer match what astro build emits) or this step already ran on this dist');
  }
  return problems;
}

/** Pages whose evaluated modules differ between two states: `before` and `after` map a page URL to its HTML. */
export function findExecutionChanges(before, after, stubs) {
  const problems = [];
  for (const [page, html] of before) {
    const was = evaluatedModules(html, stubs);
    const now = evaluatedModules(after.get(page) ?? '', stubs);
    if (JSON.stringify(was) !== JSON.stringify(now)) {
      problems.push(`${page}: the modules the page evaluates changed.\n    before ${JSON.stringify(was)}\n    after  ${JSON.stringify(now)}`);
    }
  }
  return problems;
}

// ---- the one thin function that touches the disk ----

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

function readView(distDir) {
  const files = walk(distDir);
  const url = (file) => `/${path.relative(distDir, file).split(path.sep).join('/')}`;
  const pageUrl = (file) => url(file).replace(/index\.html$/, '');
  const pages = new Map(files.filter((f) => f.endsWith('.html')).map((f) => [pageUrl(f), fs.readFileSync(f, 'utf8')]));
  const code = new Map(files.filter((f) => /\.m?js$/.test(f)).map((f) => [url(f), fs.readFileSync(f, 'utf8')]));
  return { pages, code, urls: new Set(files.map(url)) };
}

/** Reads each stub a page references, as { url -> stub } with targets as absolute URLs that exist in dist. */
function readStubs(view) {
  const stubs = new Map();
  for (const html of view.pages.values()) {
    for (const url of referencedModuleUrls(html)) {
      const code = view.code.get(url.split(/[?#]/)[0]);
      if (code === undefined || stubs.has(url)) continue;
      const absolute = (spec) => path.posix.resolve(path.posix.dirname(url), spec);
      const side = isImportStub(code);
      const reexport = side === null ? isReexportStub(code) : null;
      const target = side !== null ? absolute(side) : reexport && absolute(reexport.target);
      if (!target || !view.urls.has(target)) continue;
      stubs.set(url, side !== null ? { target } : { target, exportName: reexport.exportName });
    }
  }
  return resolveStubChains(stubs);
}

export function dropStubRequests(distDir) {
  const view = readView(distDir);
  const stubs = readStubs(view);
  const rewritten = new Map();
  let removedCount = 0;
  for (const [page, html] of view.pages) {
    const out = rewritePage(html, stubs);
    removedCount += out.removed.length;
    rewritten.set(page, out.html);
    if (out.html !== html) fs.writeFileSync(path.join(distDir, page.slice(1), page.endsWith('/') ? 'index.html' : ''), out.html);
  }
  const problems = [...findExecutionChanges(view.pages, rewritten, stubs), ...verifyDist(readView(distDir), { removedCount })];
  if (problems.length > 0) throw new Error(`Stub requests: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  console.log(`Stub requests: ${removedCount} stub requests dropped across ${[...rewritten].filter(([p, h]) => h !== view.pages.get(p)).length} pages, ${stubs.size} stub files kept for pages cached from the previous build.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    dropStubRequests(path.join(process.cwd(), 'dist'));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
