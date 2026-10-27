import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

/*
 * Budgets what the service worker downloads: the shell, and the closure of
 * each page (dist/precache-manifest.json, "pages"), summed in brotli bytes at
 * the quality check-page-weight.js uses. Also refuses a page whose closure
 * carries another tool's island entry chunk.
 *
 * These are budgets, not ratchets (CLAUDE.md): a number is raised only by a
 * decision, never to make a red run green. Measured 2026-10-27 (brotli bytes, from `--table`):
 *
 *     shell                         305,151   (37 urls)
 *     /sign/ and /he/sign/        1,640,826   (60 urls, heaviest tool)
 *     /redact/                    1,165,846
 *     /merge/, /he/merge/         1,086,721 / 1,090,931
 *     other tool routes           1,020,339 to 1,061,471
 *     /                              96,124   (heaviest page without a tool)
 *     article and trust pages        17,455 to 35,274
 *
 * Each budget is the heaviest measured closure of its kind, rounded up to the
 * next 100 KB (400K, 1.7M, 100K), plus about 15% headroom.
 */
export const BUDGETS = {
  shell: 460_000,
  tool: 1_950_000,
  other: 115_000,
};

/*
 * Source-level cross-tool imports are already refused by test:module-boundaries
 * (a tool may not import another tool), so this check does not re-derive them.
 * It catches the build-level leak: a shared chunk that grew another tool's
 * island, or a manifest that listed one.
 */

// Tool islands are the Pdf*Tool entry chunks Astro names in component-url.
const TOOL_ISLAND = /^\/_astro\/Pdf\w+Tool\.[\w-]+\.js$/;

export function closureBytes(files, sizes) {
  let total = 0;
  for (const f of new Set(files)) total += sizes[f] ?? 0;
  return total;
}

export function findBudgetFailures({ shell, pages, toolPages, sizes, budgets }) {
  const failures = [];
  const shellBytes = closureBytes(shell, sizes);
  if (shellBytes > budgets.shell) {
    failures.push(`shell: ${shellBytes} brotli bytes, budget ${budgets.shell}`);
  }
  for (const [page, files] of Object.entries(pages)) {
    const bytes = closureBytes(files, sizes);
    const budget = toolPages.has(page) ? budgets.tool : budgets.other;
    if (bytes > budget) {
      const heaviest = [...new Set(files)].sort((a, b) => (sizes[b] ?? 0) - (sizes[a] ?? 0))[0];
      failures.push(`${page}: closure is ${bytes} brotli bytes, budget ${budget} (heaviest asset ${heaviest}, ${sizes[heaviest] ?? 0} bytes)`);
    }
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

export function checkPrecache({ shell, pages, islands, sizes, budgets }) {
  const toolPages = new Set(Object.keys(islands).filter((p) => islands[p].length > 0));
  return [
    ...findBudgetFailures({ shell, pages, toolPages, sizes, budgets }),
    ...findForeignIslands({ pages, islands, sizes }),
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
      sizes[url] = fs.existsSync(file) ? brotli(fs.readFileSync(file)) : 0;
    }
  };
  [...manifest.shell, ...Object.values(manifest.pages).flat()].forEach(sizeOf);

  const islands = {};
  for (const page of Object.keys(manifest.pages)) {
    const html = fs.readFileSync(path.join(dist, fileOf(page)), 'utf8');
    islands[page] = [...html.matchAll(/component-url="([^"]+)"/g)].map((m) => m[1]).filter((u) => TOOL_ISLAND.test(u));
  }

  if (process.argv.includes('--table')) {
    const rows = Object.entries(manifest.pages).map(([p, f]) => [closureBytes(f, sizes), f.length, p]).sort((a, b) => b[0] - a[0]);
    console.log(`shell: ${manifest.shell.length} urls, ${closureBytes(manifest.shell, sizes)} brotli`);
    for (const [b, n, p] of rows) console.log(`${p}\t${n} urls\t${b}`);
  }

  const failures = checkPrecache({ shell: manifest.shell, pages: manifest.pages, islands, sizes, budgets: BUDGETS });
  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`FAIL: ${failures.length} precache budget problem(s)`);
    process.exit(1);
  }
  console.log(`PASS: shell and ${Object.keys(manifest.pages).length} page closures within budget`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
