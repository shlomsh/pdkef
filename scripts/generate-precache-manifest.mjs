import fs from 'node:fs';
import path from 'node:path';
import { computeBuildId } from './buildId.mjs';
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
fs.writeFileSync(workerPath, worker.replaceAll('__BUILD_ID__', buildId));

// The same id, rendered where a person can read it (FORM-11). `sw.js` has no
// `skipWaiting()` on purpose, so a browser can be serving a previous build for
// a while and "which one am I on?" needs an answer that is not the console.
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

console.log(`✅ Precaching ${urls.length} build assets (pdkef-${buildId}).`);
