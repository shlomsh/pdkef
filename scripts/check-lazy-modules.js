#!/usr/bin/env node
/**
 * Some chunks must never be in a page's first paint. This is what proves it.
 *
 * Two kinds are listed below. Form-field detection is Sign-only work. The two
 * PDF libraries are every tool's work, but none of it until somebody opens a
 * file, and together they are 1 MB (DEBT-20: pdf-lib alone was eager on all
 * eleven tool pages and on both home pages, because five shape modules imported
 * it for a colour constructor).
 *
 * Nothing in the language stops a future `import { detectPageRegions } from
 * '...'`, or an `import { rgb } from '@cantoo/pdf-lib'`, at the top of a shared
 * module from pulling the whole thing into the chunk every tool loads on first
 * paint. It would still build, still pass every unit test, and still work. It
 * would just cost every visitor a payload they have no use for, silently. That
 * is exactly how pdf-lib got there, and it sat there unnoticed because the
 * chunk was named `es.<hash>.js` after the package's entry file.
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
 * The two library rows are only this legible because `astro.config.mjs` names
 * those chunks deliberately; read the comment there before renaming either.
 *
 * `reachableFrom` is the other half of each row, and it is not optional
 * bookkeeping. Absence alone is cheap to satisfy: delete the feature and the
 * guard goes green. So each row also names pages that must still reach the
 * chunk *lazily*, which is what proves the deferral works rather than that the
 * code is gone. List the pages whose core job needs it, not every page that
 * touches it.
 */
const LAZY_ONLY = [
  { chunk: /^formWidgets\./, why: 'AcroForm widget reading', reachableFrom: ['sign'] },
  { chunk: /^formGrid\./, why: 'comb and checkbox detection', reachableFrom: ['sign'] },
  { chunk: /^formCells\./, why: 'closed-cell detection', reachableFrom: ['sign'] },
  { chunk: /^pageInk\./, why: 'the content-stream ink walk', reachableFrom: ['sign'] },
  { chunk: /^fieldRegions\./, why: 'cross-source reconciliation', reachableFrom: ['sign'] },
  {
    chunk: /^pdf-lib\./,
    why: 'pdf-lib, 628 KiB: nothing needs it until a file is opened',
    // Every tool that writes a PDF. /pdf-to-image/ is deliberately absent: it
    // reads with pdf.js and never builds a document, so it should not reach
    // pdf-lib at all, and listing it here would make that a requirement.
    reachableFrom: ['sign', 'redact', 'merge', 'split', 'compress', 'unlock', 'image-to-pdf', 'edit-pdf'],
  },
  {
    chunk: /^pdf\./,
    why: 'pdf.js, 421 KiB: nothing needs it until a file is opened',
    // Already true when this row was added, and guarded so it stays true.
    // `/^pdf\./` needs the literal dot: it must not also match `pdf-lib.`,
    // whose row is right above and means something different.
    reachableFrom: ['sign', 'redact', 'compress', 'split', 'pdf-to-image'],
  },
];

/**
 * Pages to check. Every one must be free of the list above.
 *
 * All ten tool pages, both localized tool pages, and both home pages. The home
 * pages are here because that is where this last went wrong unseen: the Hebrew
 * home was carrying 628 KiB of pdf-lib through the editor registry, and no
 * budget or ratchet said a word. '' is the site root.
 */
const PAGES = [
  '', 'he',
  'sign', 'redact', 'merge', 'compress', 'compress-image', 'split',
  'unlock', 'image-to-pdf', 'edit-pdf', 'pdf-to-image',
  'he/sign', 'he/merge', 'he/compress',
];

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
        + '    Find that import and put it behind a dynamic import() on the path that\n'
        + '    actually needs it. Do not delete the row.',
      );
    }
  }
  // And prove the mechanism still works, rather than only that the chunk is
  // absent: a feature deleted outright would pass the check above.
  const owed = LAZY_ONLY.filter(({ reachableFrom }) => reachableFrom.includes(page));
  if (owed.length > 0) {
    const reachable = closure(entries, anyDeps);
    const unreachable = owed
      .filter(({ chunk }) => ![...reachable].some((file) => chunk.test(file)))
      .map(({ why }) => why);
    if (unreachable.length > 0) {
      errors.push(`/${page}/ cannot reach ${unreachable.join('; ')} even lazily - that work could never run.`);
    } else {
      notes.push(`/${page}/ reaches ${owed.length} lazy-only chunk(s), none on first paint`);
    }
  }
}

if (errors.length > 0) {
  console.error('Lazy-module check failed:\n');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Lazy-module check passed: ${PAGES.length} pages, none loads a lazy-only chunk eagerly.`);
for (const note of notes) console.log(`  ${note}`);
