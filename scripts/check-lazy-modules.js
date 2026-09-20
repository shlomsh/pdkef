#!/usr/bin/env node
/**
 * Form-field detection must stay lazy: a Redact-only visitor never downloads it.
 *
 * The detector is five chunks of PDF geometry and AcroForm parsing that only
 * the Sign tool asks for, and only once somebody opens a file. Nothing in the
 * language stops a future `import { detectPageRegions } from '...'` at the top
 * of a shared module from pulling all five into the chunk every tool loads on
 * first paint - it would still build, still pass every unit test, and still
 * work. It would just cost every Redact and Merge visitor a payload they have
 * no use for, silently.
 *
 * So this walks the built output the way a browser does. For each tool page it
 * takes the real entry points (the island's `component-url`, its renderer, any
 * `<script src>` and any `modulepreload` - a preload is a download, so it
 * counts as eager), follows **static** imports transitively, and fails if a
 * lazy-only chunk turns up in that set. Dynamic `import()` is deliberately not
 * followed: that is the whole mechanism being protected.
 *
 * Runs after `npm run build`, beside `test:csp` and `test:weight`, because
 * chunking is a property of the bundle and `astro dev` does not have one.
 *
 * ARCH-24 will put these modules behind one entry point; when it does, the
 * list below should shrink to that entry point rather than be deleted - a new
 * source (OCR, metadata extraction) is exactly the kind of thing that must not
 * land in everyone's first paint.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const ASSETS = path.join(DIST, '_astro');

/**
 * Chunks no page may load eagerly, by the module each is named after.
 *
 * Rollup names a chunk after its entry module, so this is keyed on the source
 * file's name rather than a hash. If that naming ever changes, the guard would
 * quietly match nothing - which is what the non-vacuity check below is for.
 */
const LAZY_ONLY = [
  { chunk: /^formWidgets\./, why: 'AcroForm widget reading' },
  { chunk: /^formGrid\./, why: 'comb and checkbox detection' },
  { chunk: /^formCells\./, why: 'closed-cell detection' },
  { chunk: /^pageInk\./, why: 'the content-stream ink walk' },
  { chunk: /^fieldRegions\./, why: 'cross-source reconciliation' },
];

/** The page that is allowed to reach these at all, lazily. */
const OWNER = 'sign';

/** Tool pages to check. Every one of them must be free of the list above. */
const PAGES = ['sign', 'redact', 'merge', 'compress', 'split'];

const QUOTE = '["\'`]';
const STATIC_IMPORT = new RegExp(
  // `import "./x.js"`, `import a from"./x.js"`, `import{a as b}from"./x.js"`.
  // The character class excludes `(` so a dynamic `import("./x.js")` cannot match.
  `(?:^|[;}\\s])import\\s*(?:[^"'\`()]*?from\\s*)?${QUOTE}\\./([^"'\`]+\\.js)${QUOTE}`,
  'g',
);
const REEXPORT = new RegExp(`export\\s*(?:\\*|\\{[^}]*\\})\\s*from\\s*${QUOTE}\\./([^"'\`]+\\.js)${QUOTE}`, 'g');
const DYNAMIC_IMPORT = new RegExp(`import\\(\\s*${QUOTE}\\./([^"'\`]+\\.js)${QUOTE}\\s*\\)`, 'g');

const readChunk = (file) => fs.readFileSync(path.join(ASSETS, file), 'utf8');
const matchAll = (source, pattern) => [...source.matchAll(pattern)].map((match) => match[1]);

/** Entry points a browser fetches for this page without any interaction. */
function pageEntries(page) {
  const html = path.join(DIST, page, 'index.html');
  if (!fs.existsSync(html)) return null;
  const source = fs.readFileSync(html, 'utf8');
  return [...new Set([
    ...matchAll(source, /<script[^>]+src="\/_astro\/([^"]+)"/g),
    ...matchAll(source, /<link[^>]+rel="modulepreload"[^>]+href="\/_astro\/([^"]+)"/g),
    ...matchAll(source, /(?:component-url|renderer-url)="\/_astro\/([^"]+)"/g),
  ])];
}

function closure(entries, follow) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file) || !fs.existsSync(path.join(ASSETS, file))) continue;
    seen.add(file);
    queue.push(...follow(file));
  }
  return seen;
}

const staticDeps = (file) => {
  const source = readChunk(file);
  return [...matchAll(source, STATIC_IMPORT), ...matchAll(source, REEXPORT)];
};
const anyDeps = (file) => [...staticDeps(file), ...matchAll(readChunk(file), DYNAMIC_IMPORT)];

const errors = [];
const notes = [];

if (!fs.existsSync(ASSETS)) {
  console.error('No dist/_astro. Run `npm run build` first.');
  process.exit(1);
}

// Non-vacuity, first: a guard that matches nothing passes forever. Every
// lazy-only module must still exist as a chunk of its own, or the chunk naming
// changed underneath this check and it is no longer looking at anything.
const built = fs.readdirSync(ASSETS);
for (const { chunk, why } of LAZY_ONLY) {
  if (!built.some((file) => chunk.test(file))) {
    errors.push(`No built chunk matches ${chunk} (${why}). Chunk naming changed, so this guard is blind - fix the pattern, do not delete the row.`);
  }
}

for (const page of PAGES) {
  const entries = pageEntries(page);
  if (entries === null) {
    errors.push(`dist/${page}/index.html is missing - PAGES is stale.`);
    continue;
  }
  const eager = closure(entries, staticDeps);
  for (const { chunk, why } of LAZY_ONLY) {
    const leaked = [...eager].filter((file) => chunk.test(file));
    if (leaked.length > 0) {
      errors.push(
        `/${page}/ loads ${leaked.join(', ')} (${why}) on first paint.\n`
        + '    Something now imports it statically from a chunk this page already loads.\n'
        + '    Field detection is Sign-only and must stay behind a dynamic import().',
      );
    }
  }
  if (page === OWNER) {
    // And prove the mechanism still works, rather than only that the modules
    // are absent: if Sign stopped reaching them lazily, detection is dead.
    const reachable = closure(entries, anyDeps);
    const missing = LAZY_ONLY
      .filter(({ chunk }) => ![...reachable].some((file) => chunk.test(file)))
      .map(({ why }) => why);
    if (missing.length > 0) {
      errors.push(`/${OWNER}/ cannot reach ${missing.join(', ')} even lazily - detection would never run.`);
    } else {
      const lazyOnly = [...reachable].filter((f) => !eager.has(f) && LAZY_ONLY.some(({ chunk }) => chunk.test(f)));
      notes.push(`/${OWNER}/ reaches all ${lazyOnly.length} detector chunks lazily, none on first paint`);
    }
  }
}

if (errors.length > 0) {
  console.error('Lazy-module check failed:\n');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Lazy-module check passed: ${PAGES.length} tool pages, none loads field detection eagerly.`);
for (const note of notes) console.log(`  ${note}`);
