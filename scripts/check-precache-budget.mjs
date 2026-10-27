import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

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
const TOOL_ISLAND = /^\/_astro\/Pdf\w+Tool\.[\w-]+\.js$/;

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
    .map((f) => `${f}: in dist/_astro/ but in no list of the install, so it is never cached for offline use (a closure walker gap; list it in KNOWN_ORPHANS with a reason only if nothing needs it)`);
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

function brotli(buffer) {
  return zlib.brotliCompressSync(buffer, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
}

function main() {
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'precache-manifest.json'), 'utf8'));
  const fileOf = (url) => (url.endsWith('/') ? `${url}index.html` : url);
  const sizes = {};
  const sizeOf = (url) => {
    if (!(url in sizes)) {
      const file = path.join(dist, fileOf(url));
      if (fs.existsSync(file)) sizes[url] = brotli(fs.readFileSync(file));
    }
  };
  [...manifest.shell, ...Object.values(manifest.pages).flat()].forEach(sizeOf);

  const astroDir = path.join(dist, '_astro');
  const astroFiles = fs.existsSync(astroDir) ? fs.readdirSync(astroDir).map((f) => `_astro/${f}`) : [];

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
  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`FAIL: ${failures.length} precache budget problem(s)`);
    process.exit(1);
  }
  console.log(`PASS: shell and ${Object.keys(manifest.pages).length} page closures within budget`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
