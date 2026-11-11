import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { staticClosure, toPublicUrl } from './precacheClosure.mjs';
import { installPaths } from './check-precache-budget.mjs';

/*
 * Budgets the requests a new visitor costs, per page, in two numbers (MEM-33,
 * step 0 of docs/request-budget.md; MEM-39 split them): `first visit` is what
 * the page asks for on load, and `after a file is opened` is what the service
 * worker then adds, since it registers only once a person has opened a file
 * (sw.js, the manifest, and the install set the page did not already load).
 * Vercel's Hobby plan counts requests, not bytes, so a change that adds files
 * to a closure or to the install is invisible to test:weight and visible here.
 *
 * Not counted: lazy chunks loaded when a file is opened, fonts CSS requests at
 * runtime, telemetry beacons, Vercel Analytics and /api/*.
 */

const PAGES = ['/', '/redact/', '/sign/'];

// Set to the measured figures. Budgets only go down.
export const BUDGETS = {
  '/': { firstVisit: 19, afterOpen: 9 },
  '/redact/': { firstVisit: 24, afterOpen: 36 },
  '/sign/': { firstVisit: 23, afterOpen: 35 },
};

const WORKER_REQUESTS = ['/sw.js', '/precache-manifest.json'];
const LINK_RELS = ['stylesheet', 'modulepreload', 'icon', 'apple-touch-icon', 'manifest'];
const ISLAND_URL_ATTRS = ['component-url', 'renderer-url', 'before-hydration-url'];
const sameOrigin = (url) => url.startsWith('/') && !url.startsWith('//');
const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** Same-origin URLs one page's HTML asks for on load: module scripts and the links a browser fetches. */
export function pageRefs(html) {
  const refs = [];
  for (const tag of html.match(/<script\b[^>]*>/g) ?? []) {
    if (attr(tag, 'type') === 'module' && attr(tag, 'src')) refs.push(attr(tag, 'src'));
  }
  for (const tag of html.match(/<link\b[^>]*>/g) ?? []) {
    const rels = (attr(tag, 'rel') ?? '').split(/\s+/);
    if (rels.some((rel) => LINK_RELS.includes(rel)) && attr(tag, 'href')) refs.push(attr(tag, 'href'));
  }
  // An island's own scripts are fetched by Astro's inline hydration runtime, not a <script src>, so they
  // are read from its attributes. Every island counts: client:idle and client:visible ones load during
  // an ordinary visit too.
  for (const tag of html.match(/<astro-island\b[^>]*>/g) ?? []) {
    for (const name of ISLAND_URL_ATTRS) if (attr(tag, name)) refs.push(attr(tag, name).replaceAll('&amp;', '&'));
  }
  return [...new Set(refs.filter(sameOrigin))];
}

/** The URLs a page requests on load: itself, its refs and the static-import closure of its scripts. No worker yet (MEM-39). */
export function pageSet(page, view, htmlRelative) {
  const html = view.files.get(htmlRelative);
  // Without the HTML the refs are empty and the total tiny: a guard that passes on nothing.
  if (!html) throw new Error(`${page}: no HTML to count at dist/${htmlRelative}`);
  const refs = pageRefs(html).map((url) => url.split(/[?#]/)[0]);
  const scripts = refs.filter((url) => /\.m?js$/.test(url));
  const closure = [...staticClosure(view, scripts)].map(toPublicUrl);
  return new Set([page, ...refs, ...closure]);
}

/**
 * What the worker install asks for (MEM-35, MEM-40): the `/` document plus the closure of each page
 * open at install, the same rule `installPaths` budgets in bytes.
 */
export function installSet(manifest, openPages) {
  return new Set(['/', ...openPages.flatMap((page) => installPaths(manifest.pages, page))]);
}

/**
 * Install reads each file the page already loaded from the HTTP cache first
 * (MEM-34, `force-cache` checked against the manifest hash), so only the rest
 * of the install set costs a request: the page's lazy chunks, mostly. Those
 * and the worker's own two files are what opening a file adds (MEM-39).
 */
export function countRequests(page, install) {
  const extra = [...install].filter((url) => !page.has(url)).length;
  return { firstVisit: page.size, afterOpen: WORKER_REQUESTS.length + extra };
}

const FIGURES = [['firstVisit', 'first visit'], ['afterOpen', 'after a file is opened']];

/** One message per page and figure that exceeds its budget. */
export function overBudget(rows, budgets) {
  return rows.flatMap((row) => FIGURES
    .filter(([key]) => row[key] > budgets[row.page][key])
    .map(([key, label]) => `${row.page}: ${label} ${row[key]} requests, budget ${budgets[row.page][key]}`));
}

function readDist(distDir) {
  const paths = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else paths.push(path.relative(distDir, full).split(path.sep).join('/'));
    }
  };
  walk(distDir);
  const files = new Map(
    paths.filter((p) => /\.(?:html|m?js)$/.test(p)).map((p) => [p, fs.readFileSync(path.join(distDir, p), 'utf8')]),
  );
  return { files, paths };
}

function main() {
  const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  if (!fs.existsSync(distDir)) {
    console.error('dist/ does not exist. Run `npm run build` first.');
    process.exit(1);
  }
  const view = readDist(distDir);
  const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'precache-manifest.json'), 'utf8'));
  let rows;
  try {
    rows = PAGES.map((page) => {
      const relative = page === '/' ? 'index.html' : `${page.slice(1)}index.html`;
      return { page, ...countRequests(pageSet(page, view, relative), installSet(manifest, [page])) };
    });
  } catch (error) {
    console.error(`Request-count check cannot run: ${error.message}`);
    process.exit(1);
  }
  console.table(rows.map((row) => ({
    page: row.page,
    'first visit': row.firstVisit,
    'budget (first visit)': BUDGETS[row.page].firstVisit,
    'after a file is opened': row.afterOpen,
    'budget (after)': BUDGETS[row.page].afterOpen,
  })));
  console.log('Not counted: lazy chunks loaded on file open, fonts requested by CSS at runtime, telemetry beacons, Vercel Analytics, /api/*.');
  const failures = overBudget(rows, BUDGETS);
  if (failures.length > 0) {
    console.error(`Request-count budget exceeded:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
