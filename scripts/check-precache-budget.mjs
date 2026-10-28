import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { pageHash } from './pageHash.mjs';
import { findRepoOnlyFiles } from './repoOnlyFiles.mjs';

/*
 * Budgets what the service worker downloads: the shell, and the closure of
 * each page (dist/precache-manifest.json, "pages"), summed in brotli bytes at
 * the quality check-page-weight.js uses. Also refuses a page whose closure
 * carries another tool's island entry chunk or lacks its own, and any
 * script, style or wasm file in dist/_astro/ that no list of the install names.
 *
 * These are budgets, not ratchets (CLAUDE.md): a number is raised only by a
 * decision, never to make a red run green. Measured 2026-10-27 (brotli bytes, from `--table`):
 *
 *     shell                          360,580   (41 urls)
 *     whole install                3,203,299   (183 urls, shell plus every page)
 *     /sign/ and /he/sign/         1,453,772   (heaviest tool)
 *     /redact/                       978,780
 *     / and /he/                     151,553 / 148,841   (carry the Redact sample PDF)
 *     heaviest article (/open/)       35,329
 *
 * Per-page budgets are the heaviest measured closure of their kind plus 15 to
 * 20% headroom (tool pages: 1,700,000, +17%). The install budget is a decision, not headroom (see below).
 */
export const BUDGETS = {
  shell: 460_000,
  tool: 1_700_000, // measured 1,453,772 for /sign/ (and /he/sign/), +17%
  home: 180_000, // measured 151,553 for / (148,841 /he/), +19%: the home pages carry the Redact sample PDF on purpose
  other: 42_000, // measured 35,329 for the heaviest article (/open/), +19%
  // Not headroom: the line Shlomi drew on 2026-10-27 (MEM-15). The whole app is
  // precached only while it stays under 5 MB (measured 3,203,299, 183 urls);
  // past it, bring per-tool caching back instead of raising this.
  install: 5_000_000,
};

// A localized home is `/` or `/<xx>/`.
const HOME_PAGE = /^\/(?:[a-z]{2}\/)?$/;

/*
 * Source-level cross-tool imports are already refused by test:module-boundaries
 * (a tool may not import another tool), so this check does not re-derive them.
 * It catches the build-level leak: a shared chunk that grew another tool's
 * island, or a manifest that listed one.
 */

// Tool islands are the Pdf*Tool entry chunks Astro names in component-url.
// MEM-25: /site/Pdf<X>Tool.js is the stable name; a hashed /_astro/ name still counts.
export const TOOL_ISLAND = /^\/(?:_astro|site)\/Pdf\w+Tool(?:\.[\w-]+)?\.js$/;

// `sizes` holds only files that exist in dist/; a listed URL with no entry is reported by findMissingFiles.
export function closureBytes(files, sizes) {
  let total = 0;
  for (const f of new Set(files)) total += sizes[f] ?? 0;
  return total;
}

// What the worker installs: the shell plus every page closure, each URL once.
export function installUrls({ shell, pages }) {
  return [...new Set([...shell, ...Object.values(pages).flat()])];
}

export function findMissingFiles({ shell, pages, sizes }) {
  const failures = [];
  for (const f of new Set(shell)) if (!(f in sizes)) failures.push(`shell: lists ${f}, which is not in dist/`);
  for (const [page, files] of Object.entries(pages)) {
    for (const f of new Set(files)) if (!(f in sizes)) failures.push(`${page}: closure lists ${f}, which is not in dist/`);
  }
  return failures;
}

// Extensions scripts/precacheClosure.mjs knows how to walk or carry; anything else in dist/_astro/ could escape every closure.
const HANDLED_ASTRO_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.wasm', '.webp', '.png', '.jpg', '.jpeg', '.gif', '.avif', '.svg']);

export function findUnhandledAssets(astroFiles) {
  return astroFiles
    .filter((f) => !HANDLED_ASTRO_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .map((f) => `${f}: extension not handled by the precache closure walker (scripts/precacheClosure.mjs)`);
}

// Script, style and wasm files in dist/_astro/ that no list of the install may leave out: the worker would never cache them.
const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.wasm']);

// Files that are in dist/ on purpose and in no list, keyed by name without the hash ("PageWorkspace.css"), each with its reason.
export const KNOWN_ORPHANS = {
  'PageWorkspace.css': 'its rules are inlined into the pages that use it and no file or page names the file',
};

const withoutHash = (file) => path.basename(file).replace(/\.[\w-]+(\.[a-z]+)$/i, '$1');

export function findOrphanedAssets({ astroFiles, shell, pages }) {
  const installed = new Set(installUrls({ shell, pages }));
  return astroFiles
    .filter((f) => CODE_EXTENSIONS.has(path.extname(f).toLowerCase()) && !installed.has(`/${f}`) && !(withoutHash(f) in KNOWN_ORPHANS))
    .map((f) => `${f}: in dist/ (_astro, site or shared) but in no list of the install, so it is never cached for offline use (a closure walker gap; list it in KNOWN_ORPHANS with a reason only if nothing needs it)`);
}

// A tool page's own island entry chunk must be in its closure, or the tool cannot start offline.
export function findMissingIslands({ pages, islands }) {
  const failures = [];
  for (const [page, chunks] of Object.entries(islands)) {
    const listed = new Set(pages[page] ?? []);
    for (const chunk of chunks) if (!listed.has(chunk)) failures.push(`${page}: closure lacks its own island ${chunk}`);
  }
  return failures;
}

export function findBudgetFailures({ shell, pages, toolPages, sizes, budgets }) {
  const failures = [];
  const shellBytes = closureBytes(shell, sizes);
  if (shellBytes > budgets.shell) {
    failures.push(`shell: ${shellBytes} brotli bytes, budget ${budgets.shell}`);
  }
  for (const [page, files] of Object.entries(pages)) {
    const bytes = closureBytes(files, sizes);
    const budget = toolPages.has(page) ? budgets.tool : HOME_PAGE.test(page) ? budgets.home : budgets.other;
    if (bytes > budget) {
      const heaviest = [...new Set(files)].sort((a, b) => (sizes[b] ?? 0) - (sizes[a] ?? 0))[0];
      failures.push(`${page}: closure is ${bytes} brotli bytes, budget ${budget} (heaviest asset ${heaviest}, ${sizes[heaviest] ?? 0} bytes)`);
    }
  }
  const installBytes = closureBytes(installUrls({ shell, pages }), sizes);
  if (installBytes > budgets.install) {
    failures.push(`install: ${installBytes} brotli bytes for the whole app, budget ${budgets.install}. Over it, revisit per-tool caching (MEM-15 decision), do not raise the budget`);
  }
  return failures;
}

export function findForeignIslands({ pages, islands, sizes }) {
  const owner = new Map();
  for (const [page, chunks] of Object.entries(islands)) {
    for (const chunk of chunks) if (!owner.has(chunk)) owner.set(chunk, page);
  }
  const failures = [];
  for (const [page, files] of Object.entries(pages)) {
    const own = new Set(islands[page] ?? []);
    for (const f of new Set(files)) {
      if (owner.has(f) && !own.has(f)) {
        failures.push(`${page}: closure carries ${f} (${sizes[f] ?? 0} brotli bytes), the island of ${owner.get(f)}`);
      }
    }
  }
  return failures;
}

export function checkPrecache({ shell, pages, islands, sizes, budgets, astroFiles = [] }) {
  const toolPages = new Set(Object.keys(islands).filter((p) => islands[p].length > 0));
  return [
    ...findMissingFiles({ shell, pages, sizes }),
    ...findBudgetFailures({ shell, pages, toolPages, sizes, budgets }),
    ...findForeignIslands({ pages, islands, sizes }),
    ...findUnhandledAssets(astroFiles),
    ...findOrphanedAssets({ astroFiles, shell, pages }),
    ...findMissingIslands({ pages, islands }),
  ];
}

// Every file in dist/fonts/, as a URL: a font pack fetches them at runtime, so each needs a hash.
export function distFontUrls(distDir) {
  const fontsDir = path.join(distDir, 'fonts');
  return fs.existsSync(fontsDir) ? fs.readdirSync(fontsDir).map((f) => `/fonts/${f}`) : [];
}

// MEM-22: the manifest names its build (the id in sw.js's CACHE_VERSION) and the hash of the final bytes of
// every precached URL that is not a content-hashed /_astro/ file, plus every dist font (a font pack fetches those
// at runtime). `readPage(url)` returns the bytes dist/ holds; `distFonts` lists the /fonts/<name> URLs there.
export function manifestIdentityProblems(manifest, { readPage, workerSource, distFonts = [] }) {
  const problems = [];
  if (!manifest.build) problems.push('manifest: no "build" id');
  else if (workerSource.split(manifest.build).length - 1 < 2) problems.push(`manifest: build ${manifest.build} must appear twice in the worker (BUILD_ID and CACHE_VERSION)`);
  const hashes = manifest.hashes ?? {};
  const expected = new Set([...manifest.shell, ...Object.values(manifest.pages).flat(), ...distFonts].filter((url) => !url.startsWith('/_astro/')));
  for (const url of expected) if (!(url in hashes)) problems.push(`${url}: is served unhashed but has no hash`);
  for (const url of Object.keys(hashes)) {
    if (url.startsWith('/_astro/')) problems.push(`${url}: a content-hashed /_astro/ file needs no hash`);
    else if (!expected.has(url)) problems.push(`${url}: has a hash but is not in the precache set`);
  }
  for (const [url, hash] of Object.entries(hashes)) {
    if (expected.has(url) && pageHash(readPage(url)) !== hash) problems.push(`${url}: hash ${hash} does not match the file in dist/`);
  }
  return problems;
}

// Repo config that public/ copied into dist/ is served to everyone; scripts/repoOnlyFiles.mjs strips it after the build.
export function repoOnlyProblems(distDir) {
  return findRepoOnlyFiles(distDir).map((f) => `${f}: repo config shipped in dist/ (an Nx project.json inside public/ is copied verbatim and served; run scripts/repoOnlyFiles.mjs or move it)`);
}

const BROTLI_PARAMS = { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 };
const brotli = (buffer) => zlib.brotliCompressSync(buffer, { params: BROTLI_PARAMS }).length;

const cacheId = (url, hashes) => (url.startsWith('/_astro/') ? url : hashes[url] ? `${url}#${hashes[url]}` : null);
const validSize = (n) => Number.isFinite(n) && n >= 0;

// QUAL-37: a brotli size depends only on the bytes, so it is reused between runs by content identity: the URL for a
// content-hashed /_astro/ file, `url#hash` for a URL with a manifest hash (cached only once its bytes match that hash,
// so a stale dist/ never poisons it). Any other URL is always compressed. `cache` is { key, sizes }, discarded when its
// key (brotli params, zlib version) differs or it is malformed; `readBytes(url)` returns the bytes or null. Returns the
// sizes and the cache to write back, pruned to this run's ids.
export function brotliSizes(urls, { readBytes, compress, cache, key, hashes = {} }) {
  const cached = cache && cache.key === key && cache.sizes && typeof cache.sizes === 'object' ? cache.sizes : {};
  const sizes = {};
  const kept = {};
  for (const url of urls) {
    if (url in sizes) continue;
    const id = cacheId(url, hashes);
    if (id && validSize(cached[id])) {
      sizes[url] = kept[id] = cached[id];
      continue;
    }
    const bytes = readBytes(url);
    if (bytes == null) continue;
    sizes[url] = compress(bytes);
    if (id && (id === url || pageHash(bytes) === hashes[url])) kept[id] = sizes[url];
  }
  return { sizes, cache: { key, sizes: kept } };
}

const CACHE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.cache', 'pdkef', 'precache-brotli.json');
const CACHE_KEY = `brotli:${JSON.stringify(BROTLI_PARAMS)};zlib:${process.versions.zlib}`;

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(cache) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch {
    // a cache that cannot be written is a cold next run, never a failure
  }
}

function main() {
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'precache-manifest.json'), 'utf8'));
  const fileOf = (url) => (url.endsWith('/') ? `${url}index.html` : url);
  const { sizes, cache } = brotliSizes([...manifest.shell, ...Object.values(manifest.pages).flat()], {
    readBytes: (url) => {
      const file = path.join(dist, fileOf(url));
      return fs.existsSync(file) ? fs.readFileSync(file) : null;
    },
    compress: brotli,
    cache: readCache(),
    key: CACHE_KEY,
    hashes: manifest.hashes ?? {},
  });
  writeCache(cache);

  // MEM-25: client code is emitted under _astro (hashed), site (entries) and shared (hot chunks).
  const astroFiles = ['_astro', 'site', 'shared'].flatMap((dir) => {
    const full = path.join(dist, dir);
    return fs.existsSync(full) ? fs.readdirSync(full).map((f) => `${dir}/${f}`) : [];
  });

  const islands = {};
  for (const page of Object.keys(manifest.pages)) {
    const html = fs.readFileSync(path.join(dist, fileOf(page)), 'utf8');
    islands[page] = [...html.matchAll(/component-url="([^"]+)"/g)].map((m) => m[1]).filter((u) => TOOL_ISLAND.test(u));
  }

  if (process.argv.includes('--table')) {
    const rows = Object.entries(manifest.pages).map(([p, f]) => [closureBytes(f, sizes), f.length, p]).sort((a, b) => b[0] - a[0]);
    console.log(`shell: ${manifest.shell.length} urls, ${closureBytes(manifest.shell, sizes)} brotli`);
    for (const [b, n, p] of rows) console.log(`${p}\t${n} urls\t${b}`);
    const all = installUrls(manifest);
    console.log(`install: ${all.length} urls, ${closureBytes(all, sizes)} brotli`);
  }

  const failures = checkPrecache({ shell: manifest.shell, pages: manifest.pages, islands, sizes, budgets: BUDGETS, astroFiles });
  failures.push(...manifestIdentityProblems(manifest, {
    readPage: (url) => fs.readFileSync(path.join(dist, decodeURIComponent(fileOf(url)))),
    workerSource: fs.readFileSync(path.join(dist, 'sw.js'), 'utf8'),
    distFonts: distFontUrls(dist),
  }));
  failures.push(...repoOnlyProblems(dist));
  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`FAIL: ${failures.length} precache budget problem(s)`);
    process.exit(1);
  }
  console.log(`PASS: shell and ${Object.keys(manifest.pages).length} page closures within budget`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
