import fs from 'node:fs';
import path from 'node:path';
import { computeBuildId } from './buildId.mjs';
import { commitFromEnv, hasPlaceholder, stampBuildCommit } from './buildCommit.mjs';
import { minifyServiceWorker } from './minifyServiceWorker.mjs';
import { shouldPrecache } from '../src/site-lib/precachePolicy.js';

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

function toPublicUrl(filePath) {
  const relative = path.relative(distDir, filePath).split(path.sep).join('/');
  if (relative === 'index.html') return '/';
  if (relative.endsWith('/index.html')) return `/${relative.slice(0, -'index.html'.length)}`;
  return `/${relative}`;
}

if (!fs.existsSync(distDir)) {
  throw new Error('dist/ does not exist. Run Astro build before generating the precache manifest.');
}

const allFiles = walk(distDir).sort();

const files = allFiles.filter((filePath) => {
  const relative = path.relative(distDir, filePath).split(path.sep).join('/');
  return shouldPrecache(relative, { manifestName, workerName });
});

const urls = files.map(toPublicUrl);
const manifest = JSON.stringify({ urls }, null, 2);

// Hashed from every file already in dist/ (the manifest and sw.js are written
// below, after this), not just the precache list - see buildId.mjs for why a
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

console.log(`✅ Precaching ${urls.length} build assets (pdkef-${buildId}), commit ${commit || 'none (no commit)'} on ${stamped} pages.`);
