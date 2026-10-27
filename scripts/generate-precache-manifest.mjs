import fs from 'node:fs';
import path from 'node:path';
import { computeBuildId } from './buildId.mjs';
import { sortCspHashes } from './cspHashOrder.mjs';
import { commitFromEnv, hasPlaceholder, stampBuildCommit } from './buildCommit.mjs';
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
const manifest = JSON.stringify({ version: 2, shell, pages }, null, 2);

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

fs.writeFileSync(path.join(distDir, manifestName), `${manifest}\n`);

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

// The deploying commit, also after the hash and for the same reason: it lives
// in HTML only (BaseLayout's `pdkef-build` meta), so a push that changes no
// content keeps the build id and the service worker cache name. No commit
// (a local build) removes the tag. Hard failure if no page carried it.
const commit = commitFromEnv(process.env);
let stamped = 0;
let signHasTag = false;
for (const filePath of allFiles) {
  if (!filePath.endsWith('.html')) continue;
  const html = fs.readFileSync(filePath, 'utf8');
  if (!hasPlaceholder(html)) continue;
  stamped += 1;
  if (filePath === path.join(distDir, 'sign', 'index.html')) signHasTag = true;
  const next = stampBuildCommit(html, commit);
  if (next !== html) fs.writeFileSync(filePath, next);
}
if (stamped === 0) {
  throw new Error('No dist/ page carries the __BUILD_COMMIT__ placeholder (BaseLayout lost it).');
}
if (!signHasTag) {
  throw new Error('dist/sign/index.html is missing the __BUILD_COMMIT__ placeholder.');
}

console.log(`✅ Precache manifest: ${shell.length} shell files and ${Object.keys(pages).length} pages (pdkef-${buildId}), commit ${commit || 'none (no commit)'} on ${stamped} pages.`);
