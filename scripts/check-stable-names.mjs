import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOT_SHARED_CHUNKS } from './stableNames.mjs';

/*
 * MEM-25: the build gives every client entry one URL (/site/<name>.js) and the hot shared modules
 * another (/shared/<name>.js), so a change to a shared module renames neither the pages nor the chunks
 * that import it. This guard fails the build output when that stops holding: a page naming a hashed
 * /_astro/ script or island, a hot chunk the build no longer emits, or a hashed file name in the stable
 * folders. A hashed name in a page means every shared-module change rewrites every page.
 */

const HASHED_ASTRO_URL = [
  ['script src', /<script\b[^>]*\ssrc="(\/_astro\/[^"]*)"/g],
  ['component-url', /\bcomponent-url="(\/_astro\/[^"]*)"/g],
  ['renderer-url', /\brenderer-url="(\/_astro\/[^"]*)"/g],
];

// `name.AbCd1234.js`: stable names carry no inner dot (entryFileName turns dots into `_`), so any
// dot before the extension marks a hash, whatever its length.
const HASHED_NAME = /\.[^.]+\.m?js$/;

/**
 * Pure core. `pages` maps a dist-relative html path to its text; `site` and `shared` list the file
 * names in dist/site and dist/shared; `hot` is HOT_SHARED_CHUNKS. Returns the problems, one string each.
 */
export function findStableNameProblems({ pages, site, shared, hot }) {
  const problems = [];
  for (const [page, html] of Object.entries(pages)) {
    for (const [what, pattern] of HASHED_ASTRO_URL) {
      for (const match of html.matchAll(pattern)) {
        problems.push(`${page}: ${what} ${match[1]} is a content-hashed /_astro/ name; entries must be /site/<name>.js (MEM-25: a hashed name in a page means every shared-module change rewrites every page)`);
      }
    }
  }
  for (const name of hot) {
    if (!shared.includes(`${name}.js`)) {
      problems.push(`dist/shared/${name}.js is missing: ${name} is in HOT_SHARED_CHUNKS (scripts/stableNames.mjs) but the build did not emit it under a stable name (MEM-25)`);
    }
  }
  for (const [dir, names] of [['site', site], ['shared', shared]]) {
    for (const name of names) {
      if (HASHED_NAME.test(name)) {
        problems.push(`${dir}/${name}: looks content-hashed, but dist/${dir}/ holds stable names only (MEM-25: a hashed name here renames every importer on each change)`);
      }
    }
  }
  return problems;
}

function htmlFiles(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, base, out);
    else if (entry.name.endsWith('.html')) out.push(path.relative(base, full));
  }
  return out;
}

function main() {
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const list = (dir) => (fs.existsSync(path.join(dist, dir)) ? fs.readdirSync(path.join(dist, dir)) : []);
  const pages = Object.fromEntries(htmlFiles(dist).map((rel) => [rel, fs.readFileSync(path.join(dist, rel), 'utf8')]));
  const problems = findStableNameProblems({ pages, site: list('site'), shared: list('shared'), hot: HOT_SHARED_CHUNKS });
  if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`FAIL: ${problems.length} stable-name problem(s)`);
    process.exit(1);
  }
  console.log(`PASS: ${Object.keys(pages).length} pages name only /site/ entries, ${HOT_SHARED_CHUNKS.length} hot chunks stable`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
