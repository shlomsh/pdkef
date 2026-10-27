import fs from 'node:fs';
import path from 'node:path';
import { computeBuildId } from './buildId.mjs';
import { sortCspHashes } from './cspHashOrder.mjs';
import { pageHash } from './pageHash.mjs';
import { minifyServiceWorker } from './minifyServiceWorker.mjs';
import { shouldPrecache } from '../src/site-lib/precachePolicy.js';
import { pageClosure, shellClosure, toPublicUrl as relativeToUrl } from './precacheClosure.mjs';

const distDir = path.join(process.cwd(), 'dist');
const manifestName = 'precache-manifest.json';
const workerName = 'sw.js';

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(filePath, files);
    else files.push(filePath);
  }
  return files;
}

if (!fs.existsSync(distDir)) {
  throw new Error('dist/ does not exist. Run Astro build before generating the precache manifest.');
}

const allFiles = walk(distDir).sort();

// Astro lists each page's CSP hash sources in an unstable order, which made every page differ
// per deploy (MEM-20). Sort them before anything below reads or hashes the HTML.
for (const filePath of allFiles.filter((name) => name.endsWith('.html'))) {
  const html = fs.readFileSync(filePath, 'utf8');
  const sorted = sortCspHashes(html);
  if (sorted !== html) fs.writeFileSync(filePath, sorted);
}

// v2 (MEM-15): the shell, and the closure of each page, so the worker installs the union
// of the closures instead of every file in the build.
const relativeOf = (filePath) => path.relative(distDir, filePath).split(path.sep).join('/');
const view = {
  files: new Map(allFiles.filter((filePath) => /\.(?:html|m?js|css)$/.test(filePath)).map((filePath) => [relativeOf(filePath), fs.readFileSync(filePath, 'utf8')])),
  paths: allFiles.map(relativeOf),
};
const keep = (relative) => shouldPrecache(relative, { manifestName, workerName });
const pages = {};
for (const relative of [...view.files.keys()].filter((name) => name.endsWith('.html')).sort()) {
  pages[relativeToUrl(relative)] = pageClosure(view, relative, { keep });
}
const shell = shellClosure(view, { keep });

// Hashed from every file already in dist/ (the manifest and sw.js are written
// below, after this), not just the precache lists - see buildId.mjs for why a
// same-URL asset (fonts, icons, other public/ files) still needs to bust the
// cache when its content changes.
const buildId = computeBuildId(
  allFiles.map((filePath) => ({
    relativePath: path.relative(distDir, filePath).split(path.sep).join('/'),
    content: fs.readFileSync(filePath),
  })),
);

const workerPath = path.join(distDir, workerName);
const worker = fs.readFileSync(workerPath, 'utf8');
if (!worker.includes('__BUILD_ID__')) {
  throw new Error('dist/sw.js is missing the __BUILD_ID__ placeholder.');
}
// Minified on the way into dist/, source stays readable in public/.
fs.writeFileSync(workerPath, minifyServiceWorker(worker.replaceAll('__BUILD_ID__', buildId)));

// The same id, rendered where a person can read it (FORM-11). `sw.js` calls
// `skipWaiting()` only on the MEM-10 message, never on install, so a browser
// can be serving a previous build for a while and "which one am I on?" needs
// an answer that is not the console.
// Substituted here rather than computed in the page because the id is a hash
// of dist/ and the page is part of dist/ - it cannot exist before the build it
// names. Both substitutions happen after the hash, exactly like sw.js's, so
// the printed id describes the build's content and not itself. Hard failure,
// not a skip: a page that quietly lost the placeholder would read as a build
// id nobody can act on.
const aboutPath = path.join(distDir, 'about', 'index.html');
const about = fs.readFileSync(aboutPath, 'utf8');
if (!about.includes('__BUILD_ID__')) {
  throw new Error('dist/about/index.html is missing the __BUILD_ID__ placeholder.');
}
fs.writeFileSync(aboutPath, about.replaceAll('__BUILD_ID__', buildId));

// Written last (MEM-22): `hashes` holds the final bytes' hash of every precached URL that is not a
// content-hashed /_astro/ file (the pages, icons, fonts, wasm...), after the about rewrite above,
// so the worker stores a file only when it is the one this build serves.
const hashes = {};
const unhashedUrls = new Set([...shell, ...Object.values(pages).flat()].filter((url) => !url.startsWith('/_astro/')));
// Fonts are listed though not precached: a font pack fetches them at runtime and the worker checks them here.
const fontsDir = path.join(distDir, 'fonts');
if (fs.existsSync(fontsDir)) {
  for (const f of fs.readdirSync(fontsDir)) if (/^[A-Za-z0-9-]+\.ttf$/.test(f)) unhashedUrls.add(`/fonts/${f}`);
}
for (const url of [...unhashedUrls].sort()) {
  const relative = decodeURIComponent(url.endsWith('/') ? `${url}index.html` : url);
  hashes[url] = pageHash(fs.readFileSync(path.join(distDir, relative)));
}
fs.writeFileSync(path.join(distDir, manifestName), `${JSON.stringify({ version: 2, build: buildId, shell, pages, hashes }, null, 2)}\n`);

console.log(`✅ Precache manifest: ${shell.length} shell files and ${Object.keys(pages).length} pages (pdkef-${buildId}).`);
