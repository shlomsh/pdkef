/**
 * Per-page import closures over an in-memory view of dist/ (MEM-15).
 *
 * Pure: nothing here touches the file system. A caller reads dist/ into a
 * view and hands it in, so scripts/check-lazy-modules.js (which asks what a
 * page loads on first paint) and scripts/generate-precache-manifest.mjs
 * (which asks what a page needs to work offline) walk imports one way.
 *
 * `view` is `{ files: Map<relativePath, text>, paths: Iterable<relativePath> }`:
 * `files` holds every text file the walk reads (html, js, css), `paths` lists
 * every file in dist/ so a reference can be checked against what exists.
 * Paths are relative to dist/ ("_astro/x.js", "sign/index.html"); the
 * closures return public URLs ("/_astro/x.js", "/sign/").
 */
import path from 'node:path';

const QUOTE = '["\'`]';
const STATIC_IMPORT = new RegExp(
  // `import "./x.js"`, `import a from"./x.js"`, `import{a as b}from"./x.js"`.
  // The character class excludes `(` so a dynamic `import("./x.js")` cannot match.
  `(?:^|[;}\\s])import\\s*(?:[^"'\`()]*?from\\s*)?${QUOTE}\\./([^"'\`]+\\.m?js)${QUOTE}`,
  'g',
);
const REEXPORT = new RegExp(`export\\s*(?:\\*|\\{[^}]*\\})\\s*from\\s*${QUOTE}\\./([^"'\`]+\\.m?js)${QUOTE}`, 'g');
const DYNAMIC_IMPORT = new RegExp(`import\\(\\s*${QUOTE}\\./([^"'\`]+\\.m?js)${QUOTE}\\s*\\)`, 'g');
// Vite's preload list, assigned inside `__vite__mapDeps`: `m.f=["_astro/a.js","_astro/b.css"]`, relative to
// the site root. The minifier picks the variable's letter, so any identifier matches.
const MAP_DEPS = /(?<![\w$])[\w$]+\.f=\[([^\]]*)\]/g;
const QUOTED = new RegExp(`${QUOTE}([^"'\`]+)${QUOTE}`, 'g');
// A worker or chunk spelled as an absolute path string.
const ASTRO_STRING = new RegExp(`${QUOTE}(/_astro/[^"'\`\\s]+\\.(?:m?js|css|wasm))${QUOTE}`, 'g');
// A same-origin image a chunk names (the offline sample PDF and its preview); the byte policy drops runtime-only directories.
const IMAGES_STRING = new RegExp(`${QUOTE}(/images/[^"'\`\\s]+\\.[A-Za-z0-9]+)${QUOTE}`, 'g');
const URL_FROM_META = new RegExp(`new URL\\(\\s*${QUOTE}(\\.{1,2}/[^"'\`]+)${QUOTE}\\s*,\\s*import\\.meta\\.url`, 'g');
const WASM_DIR = '/pdfjs-dist-wasm/';
const CSS_URL = /url\(\s*(["']?)([^)"']+)\1\s*\)/g;

const matchAll = (source, pattern, group = 1) => [...source.matchAll(pattern)].map((match) => match[group]);

export function toPublicUrl(relative) {
  if (relative === 'index.html') return '/';
  if (relative.endsWith('/index.html')) return `/${relative.slice(0, -'index.html'.length)}`;
  return `/${relative}`;
}

/** The dist-relative path a root-relative URL names, or null when it names none (external, data:, anchor). */
function toRelative(url) {
  if (!url.startsWith('/') || url.startsWith('//')) return null;
  const clean = url.split(/[?#]/)[0];
  return clean === '/' ? 'index.html' : clean.slice(1);
}

const pathSet = (view) => (view.paths instanceof Set ? view.paths : new Set(view.paths));

/** Dist-relative file a URL names, when it exists. Directory URLs resolve to their index.html. */
function resolveExisting(url, paths) {
  const relative = toRelative(url);
  if (relative === null) return null;
  if (paths.has(relative)) return relative;
  if (relative.endsWith('/') && paths.has(`${relative}index.html`)) return `${relative}index.html`;
  return null;
}

/** Entry points a browser fetches for this page without any interaction (all under /_astro/). */
export function pageEntries(html) {
  return [...new Set([
    ...matchAll(html, /<script[^>]+src="(\/_astro\/[^"]+)"/g),
    ...matchAll(html, /<link[^>]+rel="modulepreload"[^>]+href="(\/_astro\/[^"]+)"/g),
    ...matchAll(html, /(?:component-url|renderer-url)="(\/_astro\/[^"]+)"/g),
  ])];
}

function inlineBlocks(html, tag, skipTypes = []) {
  const blocks = [];
  for (const match of html.matchAll(new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)</${tag}>`, 'g'))) {
    if (/\ssrc=/.test(match[1])) continue;
    const type = /\stype="([^"]*)"/.exec(match[1])?.[1];
    if (type && skipTypes.includes(type)) continue;
    blocks.push(match[2]);
  }
  return blocks;
}

function cssUrls(css, baseUrl) {
  const urls = [];
  for (const raw of matchAll(css, CSS_URL, 2)) {
    if (/^(?:data:|https?:|\/\/|#)/.test(raw)) continue;
    urls.push(raw.startsWith('/') ? raw : path.posix.join(path.posix.dirname(baseUrl), raw));
  }
  return urls;
}

/**
 * Every same-origin file a page's HTML references: script src, modulepreload,
 * stylesheet and font preloads, astro-island entry URLs, absolute /_astro/
 * strings in inline scripts, url(...) in inline CSS, and the src and every
 * srcset candidate of an `<img>` without loading="lazy" (the header logo is
 * on screen at first paint, so it must be cached by the first visit). Links to
 * other pages (`<a href>`, canonical, alternate), lazy `<img>` and `<source>`
 * are not references in this sense. `icons` adds the icon and manifest links (the shell).
 */
export function htmlRefs(html, { icons = false } = {}) {
  const refs = new Set(pageEntries(html));
  for (const attr of ['component-url', 'renderer-url', 'before-hydration-url']) {
    for (const url of matchAll(html, new RegExp(`${attr}="([^"]+)"`, 'g'))) refs.add(url);
  }
  const rels = ['stylesheet', 'modulepreload', 'preload', ...(icons ? ['icon', 'apple-touch-icon', 'manifest'] : [])];
  for (const link of html.matchAll(/<link\b[^>]*>/g)) {
    const rel = /\brel="([^"]*)"/.exec(link[0])?.[1];
    const href = /\bhref="([^"]*)"/.exec(link[0])?.[1];
    if (rel && href && rel.split(/\s+/).some((r) => rels.includes(r))) refs.add(href);
  }
  for (const img of html.matchAll(/<img\b[^>]*>/g)) {
    if (/\bloading="lazy"/.test(img[0])) continue;
    const src = /\ssrc="([^"]*)"/.exec(img[0])?.[1];
    if (src) refs.add(src);
    const srcset = /\ssrcset="([^"]*)"/.exec(img[0])?.[1] ?? '';
    for (const candidate of srcset.split(',')) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) refs.add(url);
    }
  }
  for (const block of inlineBlocks(html, 'script', ['application/json', 'application/ld+json'])) {
    for (const url of matchAll(block, ASTRO_STRING)) refs.add(url);
  }
  for (const block of inlineBlocks(html, 'style')) {
    for (const url of cssUrls(block, '/')) refs.add(url);
  }
  return [...refs];
}

const isScript = (relative) => relative.endsWith('.js') || relative.endsWith('.mjs');
const fileDir = (relative) => path.posix.dirname(relative);
const joinRelative = (relative, ref) => path.posix.join(fileDir(relative), ref);

/** Relative `./x.js` static imports and re-exports of one JS source, as dist-relative paths. */
function staticDeps(relative, source) {
  return [...matchAll(source, STATIC_IMPORT), ...matchAll(source, REEXPORT)].map((ref) => joinRelative(relative, `./${ref}`));
}

function dynamicDeps(relative, source) {
  const found = matchAll(source, DYNAMIC_IMPORT).map((ref) => joinRelative(relative, `./${ref}`));
  const lists = matchAll(source, MAP_DEPS);
  // Chunks and CSS named only in this list are reached only through it; a form we cannot read must break the build, not drop files.
  if (source.includes('__vite__mapDeps') && lists.length === 0) {
    throw new Error(`${relative} mentions __vite__mapDeps but no preload list matched MAP_DEPS in scripts/precacheClosure.mjs; the minifier output changed shape`);
  }
  for (const list of lists) found.push(...matchAll(list, QUOTED));
  for (const url of matchAll(source, ASTRO_STRING)) found.push(url.slice(1));
  for (const url of matchAll(source, IMAGES_STRING)) found.push(url.slice(1));
  for (const ref of matchAll(source, URL_FROM_META)) found.push(joinRelative(relative, ref));
  return found;
}

/** Walk from entry URLs, following `follow(relative, paths) -> relative[]`. Only existing files are visited. */
function walk(view, entryUrls, follow) {
  const paths = pathSet(view);
  const seen = new Set();
  const queue = entryUrls.map((url) => resolveExisting(url, paths)).filter(Boolean);
  while (queue.length > 0) {
    const relative = queue.pop();
    if (seen.has(relative)) continue;
    seen.add(relative);
    for (const next of follow(relative, paths)) {
      if (paths.has(next) && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

/** The files a page loads without running a dynamic import(): static imports only, JS only. */
export function staticClosure(view, entryUrls) {
  return walk(view, entryUrls, (relative) => (isScript(relative) ? staticDeps(relative, view.files.get(relative) ?? '') : []));
}

/** The name a pdf.js wasm-directory file goes by inside a chunk: "openjpeg" for "openjpeg.wasm". */
const wasmStem = (relative) => path.posix.basename(relative).split('.')[0];

/**
 * Files under /pdfjs-dist-wasm/ that the closure's JS actually names. The
 * directory also holds pdf.js's scripting sandbox (quickjs), which we do not
 * bundle, so naming the directory is not enough: a file's stem must appear
 * in some JS file already in the closure.
 */
function namedWasmFiles(view, closure, paths) {
  const sources = [...closure].filter(isScript).map((relative) => view.files.get(relative) ?? '');
  if (!sources.some((source) => source.includes(WASM_DIR))) return [];
  const dir = WASM_DIR.slice(1);
  return [...paths].filter((candidate) => {
    if (!candidate.startsWith(dir) || candidate.endsWith('_nowasm_fallback.js')) return false;
    const stem = wasmStem(candidate);
    return sources.some((source) => source.includes(stem));
  });
}

/** Everything the entries could ever load: static and dynamic imports, preload lists, workers, wasm, CSS urls. */
export function fullClosure(view, entryUrls) {
  const closure = walk(view, entryUrls, (relative) => {
    const source = view.files.get(relative) ?? '';
    if (relative.endsWith('.css')) return cssUrls(source, `/${relative}`).map(toRelative).filter(Boolean);
    if (!isScript(relative)) return [];
    return [...staticDeps(relative, source), ...dynamicDeps(relative, source)];
  });
  for (const file of namedWasmFiles(view, closure, pathSet(view))) closure.add(file);
  return closure;
}

// Files no closure carries: the no-wasm fallbacks (only for browsers without
// WebAssembly) and the Markdown twins (negotiated, never navigated to).
const excluded = (relative) => relative.endsWith('_nowasm_fallback.js') || relative.endsWith('.md');

/**
 * What one page needs to work offline, as public URLs: the page itself first,
 * then its full closure. `keep(relative)` is the byte policy (shouldPrecache),
 * which is where fonts other than the default drop out.
 */
export function pageClosure(view, htmlRelative, { keep = () => true, icons = false } = {}) {
  const html = view.files.get(htmlRelative) ?? '';
  const entries = htmlRefs(html, { icons });
  const closure = fullClosure(view, entries);
  const files = [...closure].filter((relative) => relative !== htmlRelative && !excluded(relative) && keep(relative)).sort();
  return [toPublicUrl(htmlRelative), ...files.map(toPublicUrl)];
}

/** The shell: the closure of the home page plus the icon and manifest links every page shares. */
export function shellClosure(view, options = {}) {
  return pageClosure(view, 'index.html', { ...options, icons: true });
}
