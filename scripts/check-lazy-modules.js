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
// MEM-31: chunks are dist/shared/<name>.js; only the workers are still content-hashed in dist/_astro.
const ASSET_DIRS = ['_astro', 'shared'].map((dir) => path.join(DIST, dir));

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
  // MEM-44: the code a tool loads late is grouped per tool (`<tool>-late`), so these rows name the bundle that
  // now holds each module. Each keeps its meaning: never in a first paint, reachable from the pages listed.
  { chunk: /^sign-vendor\./, why: "Sign's font library and what it pulls in (MEM-44): the third-party half of Sign's late code, a file of its own so an edit to Sign does not re-download it", reachableFrom: ['sign', 'he/sign'] },
  { chunk: /^sign-late\./, why: "Sign's late code, field detection among it - the one entry point (ARCH-24, MEM-44)", reachableFrom: ['sign'] },
  {
    chunk: /^pdf-lib\./,
    why: 'pdf-lib, 628 KiB: nothing needs it until a file is opened',
    // Every tool that writes a PDF. /pdf-to-image/ is deliberately absent: it
    // reads with pdf.js and never builds a document, so it should not reach
    // pdf-lib at all, and listing it here would make that a requirement.
    reachableFrom: ['sign', 'redact', 'highlight-pdf', 'merge', 'split', 'compress', 'unlock', 'image-to-pdf', 'scan-to-pdf', 'organize-pdf', 'rotate-pdf', 'remove-pages', 'add-page-numbers-to-pdf', 'extract-pdf-pages'],
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
    chunk: /^scan-late\./,
    why: 'Scan\'s warp, filters, edge guess (SCAN-01) and live camera (SCAN-08): nothing loads them until a photo is in or Start scanning (MEM-44)',
    reachableFrom: ['scan-to-pdf'],
  },
  { chunk: /^page\.worker-/, why: "Scan's page worker (SCAN-21): the pipeline starts it once the first photo is in", reachableFrom: ['scan-to-pdf'] },
  { chunk: /^highlight-late\./, why: "Highlight's late code, the rough.js pencil outline loaded on the first open mark among it (READ-13, MEM-44)", reachableFrom: ['highlight-pdf'] },
  { chunk: /^editor-late\./, why: 'the editors\' late code: rough.js and its pencil hatch (READ-13, READ-14), the PDF writers (MEM-44)', reachableFrom: ['highlight-pdf', 'sign', 'redact'] },
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
  'add-page-numbers-to-pdf', 'extract-pdf-pages', 'pdf-to-image', 'highlight-pdf',
  'he/sign', 'he/merge', 'he/compress',
  'about', 'blur-vs-blackout-vs-delete-pdf', 'he/photo-and-signature-size-for-forms',
];

/**
 * MEM-37: the home page's bundle (`home.js`) belongs to the home pages alone. A page script that also runs on tool
 * pages (OfflineProof, VideoPoster, PinnedNotes) once counted as "home" and dragged its 121 KB onto /sign/.
 */
const HOME_ONLY = { chunk: /^home\./, pages: new Set(['', 'he']) };

/**
 * MEM-37: Preact's runtime (`preact.js`) is for pages that have an island. The island client entry once counted as
 * site-wide and folded into site.js, which hauled Preact onto every static content page.
 */
const ISLAND_RUNTIME = /^preact\./;

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

const STRIP = /^(?:_astro|shared)\//;
const names = (closure) => new Set([...closure].filter((file) => STRIP.test(file)).map((file) => file.replace(STRIP, '')));

const errors = [];
const notes = [];

if (!ASSET_DIRS.every((dir) => fs.existsSync(dir))) {
  console.error('No dist/_astro or dist/shared. Run `npm run build` first.');
  process.exit(1);
}

const view = readDist();

// Non-vacuity, first: a guard that matches nothing passes forever. Every
// lazy-only module must still exist as a chunk of its own, or the chunk naming
// changed underneath this check and it is no longer looking at anything.
const built = ASSET_DIRS.flatMap((dir) => fs.readdirSync(dir));
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
  if (!HOME_ONLY.pages.has(page)) {
    const homeChunks = [...eager].filter((file) => HOME_ONLY.chunk.test(file));
    if (homeChunks.length > 0) {
      errors.push(
        `/${page}/ loads ${homeChunks.join(', ')} (the home pages' bundle) on first paint.\n`
        + '    A client script that runs on this page is classified as home in astro.config.mjs\n'
        + '    entryKind(). Only entries listed in HOME_ENTRY may be home; the rest are site-wide.',
      );
    }
  }
  if (!html.includes('<astro-island')) {
    const runtime = [...eager].filter((file) => ISLAND_RUNTIME.test(file));
    if (runtime.length > 0) {
      errors.push(
        `/${page}/ has no island but loads ${runtime.join(', ')} (Preact's runtime) on first paint.\n`
        + '    The island client entry is classified as site-wide in astro.config.mjs entryKind().\n'
        + '    It is its own kind, `client`, so pages without an island never load it.',
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


/**
 * MEM-44: a tool's late code comes as `<tool>-late.js`, code several editors share as `editor-late.js` and code
 * other tools share as `tools-late.js`. Three promises, read off every built page (not only PAGES):
 *   1. no page loads a `*-late.js` on first paint (a late group that became eager costs every visit);
 *   2. `<tool>-late.js` is in the closure of that tool's pages only, the ones that load `<tool>-tool.js` eagerly,
 *      so no tool carries another tool's code; `editor-late.js` only in Sign, Redact and Highlight;
 *   3. a page's lazy JS file count stays at its measured figure, the files a worker install fetches beyond what
 *      the page loaded (pdf.js, pdf-lib and the workers are the engine and not counted).
 */
const LATE = /^(?:[\w-]+-late|sign-vendor)\.js$/;
// Every late bundle expected today. One going missing means a grouping rule broke, not that the code is gone.
const EXPECTED_LATE = ['sign-late', 'sign-vendor', 'redact-late', 'scan-late', 'compress-late', 'merge-late', 'highlight-late', 'editor-late', 'tools-late'];
const EDITOR_TOOL_BUNDLES = ['sign-tool.js', 'redact-tool.js', 'highlight-tool.js'];
const ENGINE = /^(?:pdf|pdf-lib)\.js$|[Ww]orker/;
// Set to the measured counts. Budgets only go down. A page with no entry is not an island page and has 1.
const LAZY_FILE_BUDGET = { '': 3, he: 3, sign: 7, 'he/sign': 7, redact: 6, 'highlight-pdf': 6, merge: 5, 'he/merge': 5, compress: 5, 'he/compress': 5, 'compress-image': 5, 'scan-to-pdf': 5, split: 4, unlock: 4, 'image-to-pdf': 4, 'organize-pdf': 4, 'rotate-pdf': 4, 'remove-pages': 4, 'add-page-numbers-to-pdf': 4, 'extract-pdf-pages': 4, 'pdf-to-image': 4, 'he/split': 4, 'he/image-to-pdf': 4, 'he/pdf-to-image': 4 };

const lateBuilt = built.filter((file) => LATE.test(file));
for (const name of EXPECTED_LATE) {
  if (!lateBuilt.includes(`${name}.js`)) errors.push(`No dist/shared/${name}.js: a late bundle of astro.config.mjs (MEM-44) is not built, so its modules are loose files again.`);
}
for (const [relative, html] of view.files) {
  if (!relative.endsWith('index.html') && !relative.endsWith('.html')) continue;
  const page = relative === 'index.html' ? '' : relative.replace(/\/?index\.html$/, '').replace(/\.html$/, '');
  const entries = pageEntries(html);
  const eager = names(staticClosure(view, entries));
  const reach = names(fullClosure(view, entries));
  for (const file of eager) {
    if (LATE.test(file)) errors.push(`/${page}/ loads ${file} on first paint. A late bundle holds only modules no entry reaches statically (astro.config.mjs lateBundleOf).`);
  }
  for (const file of reach) {
    if (!LATE.test(file)) continue;
    const owner = file.replace(/-(?:late|vendor)\.js$/, '');
    if (owner === 'tools') continue;
    const allowed = owner === 'editor' ? EDITOR_TOOL_BUNDLES.some((bundle) => eager.has(bundle)) : eager.has(`${owner}-tool.js`);
    if (!allowed) errors.push(`/${page}/ lists ${file} but does not run the ${owner === 'editor' ? 'Sign, Redact or Highlight' : owner} tool: a tool's late bundle may be reached by its own pages only.`);
  }
  if (page in LAZY_FILE_BUDGET) {
    const lazy = [...reach].filter((file) => /\.js$/.test(file) && !eager.has(file) && !ENGINE.test(file));
    if (lazy.length > LAZY_FILE_BUDGET[page]) {
      errors.push(`/${page}/ has ${lazy.length} lazy JS files (${lazy.join(', ')}), budget ${LAZY_FILE_BUDGET[page]}. Each is a request on a first visit (MEM-44).`);
    } else {
      notes.push(`/${page}/ lazy JS files: ${lazy.length} of ${LAZY_FILE_BUDGET[page]}`);
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
