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
 * ARCH-24 put all five of these modules behind one entry point,
 * `detectFormFields.ts`. Step A stopped the hook assembling `formWidgets.js`,
 * `formGrid.js`, `formCells.js` and `fieldRegions.js` itself; a follow-up
 * closed the last gap by having the entry point export `pageGeometry` and
 * re-export `toPageTextRuns`, so the hook no longer reaches `pageInk.js` (for
 * the page geometry) or `textRuns.js` directly either. With every production
 * importer of `pageInk.js` now behind the one entry point, it no longer builds
 * as a chunk of its own - confirmed on the built output - so the five rows
 * this list used to carry (two, after step A) collapse to the one below. A
 * future source (OCR, metadata extraction) is exactly the kind of thing that
 * must not land in everyone's first paint either, and inherits this guard
 * through the entry point rather than needing its own row.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullClosure, pageEntries, staticClosure } from './precacheClosure.mjs';

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
  { chunk: /^detectFormFields\./, why: 'field detection - the one entry point (ARCH-24)', reachableFrom: ['sign'] },
  {
    chunk: /^pdf-lib\./,
    why: 'pdf-lib, 628 KiB: nothing needs it until a file is opened',
    // Every tool that writes a PDF. /pdf-to-image/ is deliberately absent: it
    // reads with pdf.js and never builds a document, so it should not reach
    // pdf-lib at all, and listing it here would make that a requirement.
    reachableFrom: ['sign', 'redact', 'merge', 'split', 'compress', 'unlock', 'image-to-pdf', 'scan-to-pdf', 'organize-pdf', 'rotate-pdf', 'remove-pages', 'add-page-numbers-to-pdf', 'extract-pdf-pages'],
  },
  {
    chunk: /^pdf\./,
    why: 'pdf.js, 421 KiB: nothing needs it until a file is opened',
    // Already true when this row was added, and guarded so it stays true.
    // `/^pdf\./` needs the literal dot: it must not also match `pdf-lib.`,
    // whose row is right above and means something different.
    reachableFrom: ['sign', 'redact', 'compress', 'split', 'pdf-to-image'],
  },
  {
    chunk: /^scanPipeline\./,
    why: 'Scan\'s warp, filters and edge guess (SCAN-01): nothing needs them until a photo is in',
    reachableFrom: ['scan-to-pdf'],
  },
];

/**
 * Pages to check. Every one must be free of the list above.
 *
 * All ten tool pages and their four landing variants, both localized tool pages, and both home pages. The home
 * pages are here because that is where this last went wrong unseen: the Hebrew
 * home was carrying 628 KiB of pdf-lib through the editor registry, and no
 * budget or ratchet said a word. '' is the site root.
 */
const PAGES = [
  '', 'he',
  'sign', 'redact', 'merge', 'compress', 'compress-image', 'split',
  'unlock', 'image-to-pdf', 'scan-to-pdf', 'organize-pdf', 'rotate-pdf', 'remove-pages',
  'add-page-numbers-to-pdf', 'extract-pdf-pages', 'pdf-to-image',
  'he/sign', 'he/merge', 'he/compress',
];

/** Dist as the pure closure functions see it: every text file, plus the list of all paths. */
function readDist() {
  const files = new Map();
  const paths = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const relative = path.relative(DIST, full).split(path.sep).join('/');
        paths.push(relative);
        if (/\.(?:html|js|css)$/.test(relative)) files.set(relative, fs.readFileSync(full, 'utf8'));
      }
    }
  };
  walk(DIST);
  return { files, paths };
}

const STRIP = '_astro/';
const names = (closure) => new Set([...closure].filter((file) => file.startsWith(STRIP)).map((file) => file.slice(STRIP.length)));

const errors = [];
const notes = [];

if (!fs.existsSync(ASSETS)) {
  console.error('No dist/_astro. Run `npm run build` first.');
  process.exit(1);
}

const view = readDist();

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
  const html = view.files.get(path.posix.join(page, 'index.html'));
  if (html === undefined) {
    errors.push(`dist/${page}/index.html is missing - PAGES is stale.`);
    continue;
  }
  const entries = pageEntries(html);
  const eager = names(staticClosure(view, entries));
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
    const reachable = names(fullClosure(view, entries));
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
