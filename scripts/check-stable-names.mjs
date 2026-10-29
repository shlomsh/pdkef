import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageClosure } from './precacheClosure.mjs';
import { CSS_MODULE_CLASS, HOT_SHARED_CHUNKS, cssModuleClassName } from './stableNames.mjs';

/*
 * MEM-25: the build gives every client entry one URL (/site/<name>.js) and the hot shared modules
 * another (/shared/<name>.js), so a change to a shared module renames neither the pages nor the chunks
 * that import it. This guard fails the build output when that stops holding: a page naming a hashed
 * /_astro/ script or island, a hot chunk the build no longer emits, or a hashed file name in the stable
 * folders. A hashed name in a page means every shared-module change rewrites every page.
 *
 * MEM-26: client CSS keeps one name too (/shared/<name>.css), and so does prerender's, because Astro
 * drops a client stylesheet when a page inlines one of the same name. A name no longer says the two hold
 * the same rules, so this also checks the outcome: every CSS Module class a page's code can render has
 * its rule in that page's inline CSS or in a stylesheet the page can load.
 */

const HASHED_ASTRO_URL = [
  ['script src', /<script\b[^>]*\ssrc="(\/_astro\/[^"]*)"/g],
  ['modulepreload', /<link\b[^>]*\brel="modulepreload"[^>]*\shref="(\/_astro\/[^"]*\.m?js)"/g],
  ['component-url', /\bcomponent-url="(\/_astro\/[^"]*)"/g],
  ['renderer-url', /\brenderer-url="(\/_astro\/[^"]*)"/g],
  ['before-hydration-url', /\bbefore-hydration-url="(\/_astro\/[^"]*)"/g],
];

// `name.AbCd1234.js`: stable names carry no inner dot (entryFileName turns dots into `_`), so any
// dot before the extension marks a hash, whatever its length.
const HASHED_NAME = /\.[^.]+\.(?:m?js|css)$/;

/**
 * Pure core. `pages` maps a dist-relative html path to its text; `site`, `shared` and `astro` list the
 * file names in dist/site, dist/shared and dist/_astro; `hot` is HOT_SHARED_CHUNKS. Returns the problems,
 * one string each.
 */
export function findStableNameProblems({ pages, site, shared, astro = [], hot }) {
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
  for (const name of astro.filter((file) => file.endsWith('.css'))) {
    problems.push(`_astro/${name}: client CSS must be dist/shared/<name>.css (MEM-26: a lazy chunk's preload list names its CSS file, so a hashed CSS name renames that chunk and its importers on every style edit)`);
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

// The classes of each CSS Module source, as built (cssModuleClassName), and the ones with no rule of their
// own: a class whose every rule holds only `composes` emits no CSS, so no page can carry it.
export function moduleClasses(modules) {
  const all = new Set();
  const ruleless = new Set();
  for (const { file, css } of modules) {
    const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const names = new Set([...source.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
    const blocks = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    for (const name of names) {
      const token = cssModuleClassName(name, file);
      all.add(token);
      const selects = new RegExp(`\\.${name.replace(/-/g, '\\-')}(?![\\w-])`);
      const ruled = blocks.some(([, selector, body]) => selects.test(selector) && body.replace(/composes\s*:[^;]*;?/g, '').trim());
      if (!ruled) ruleless.add(token);
    }
  }
  return { all, ruleless };
}

const CLASS_TOKEN = new RegExp(CSS_MODULE_CLASS.source, 'g');

/**
 * Pure core. `pages` lists each page's code (the JS its closure can load) and CSS (inline plus the
 * stylesheets its closure names); `classes` is moduleClasses(). Returns the problems, one string each.
 */
export function findMissingClassRules({ pages, classes }) {
  const problems = [];
  for (const { page, js, css } of pages) {
    const rendered = new Set(js.match(CLASS_TOKEN));
    const ruled = new Set(css.match(CLASS_TOKEN));
    const missing = [...rendered].filter((token) => classes.all.has(token) && !classes.ruleless.has(token) && !ruled.has(token));
    if (missing.length) problems.push(`${page}: ${missing.length} CSS Module class(es) its code can render have no rule on the page (${missing.slice(0, 5).join(', ')}); Astro dropped a client stylesheet whose name matched an inlined one but whose rules did not (MEM-26)`);
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

function sourceFiles(dir, suffix, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, suffix, out);
    else if (entry.name.endsWith(suffix)) out.push(full);
  }
  return out;
}

function main() {
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const list = (dir) => (fs.existsSync(path.join(dist, dir)) ? fs.readdirSync(path.join(dist, dir)) : []);
  const pages = Object.fromEntries(htmlFiles(dist).map((rel) => [rel, fs.readFileSync(path.join(dist, rel), 'utf8')]));
  const problems = findStableNameProblems({ pages, site: list('site'), shared: list('shared'), astro: list('_astro'), hot: HOT_SHARED_CHUNKS });
  const root = path.dirname(dist);
  const modules = sourceFiles(path.join(root, 'src'), '.module.css').map((file) => ({ file, css: fs.readFileSync(file, 'utf8') }));
  const code = Object.fromEntries(['_astro', 'site', 'shared'].flatMap((dir) => list(dir).filter((name) => /\.(?:m?js|css)$/.test(name)).map((name) => [`${dir}/${name}`, fs.readFileSync(path.join(dist, dir, name), 'utf8')])));
  const view = { files: new Map([...Object.entries(pages), ...Object.entries(code)]), paths: [...Object.keys(pages), ...Object.keys(code)] };
  const closures = Object.entries(pages).map(([page, html]) => {
    const files = pageClosure(view, page).slice(1).map((url) => url.slice(1));
    const text = (names) => names.map((name) => view.files.get(name) ?? '').join('\n');
    const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
    return { page, js: text(files.filter((name) => /\.m?js$/.test(name))), css: `${inline}\n${text(files.filter((name) => name.endsWith('.css')))}` };
  });
  problems.push(...findMissingClassRules({ pages: closures, classes: moduleClasses(modules) }));
  if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`FAIL: ${problems.length} stable-name problem(s)`);
    process.exit(1);
  }
  console.log(`PASS: ${Object.keys(pages).length} pages name only /site/ entries, ${HOT_SHARED_CHUNKS.length} hot chunks stable, no hashed CSS`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
