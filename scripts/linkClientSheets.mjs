/*
 * MEM-47: a tool page's CSS comes from two builds. The page build writes the `<link>` sheets, the browser
 * build writes its own, named after its script chunks (`editor-core-*.css`), and lists them as preload
 * dependencies of the late scripts, so the worker's install fetches them although the page already holds most
 * of their rules. Vite skips a preload dependency only when a `<link rel=stylesheet>` with the exact same
 * URL is on the page. So, after the build, a page links a client sheet that holds every rule of one of its
 * linked sheets, and drops that linked sheet: the same rules arrive in one request, and the install has one
 * sheet fewer to fetch. Nothing is merged or rewritten inside a sheet.
 *
 * Pure decisions first, one thin function that reads dist and writes the pages, then the check over the
 * final dist: no page's install fetches a client sheet whose rules its linked sheets already hold.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullClosure, htmlRefs } from './precacheClosure.mjs';

/** Each rule of a stylesheet as text, prefixed with the at-rules around it. A rule held twice counts once. */
export function ruleKeys(css) {
  const keys = new Set();
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const walk = (from, to, prefix) => {
    let i = from;
    while (i < to) {
      let j = i;
      while (j < to && text[j] !== '{' && text[j] !== ';') j++;
      if (j >= to) break;
      if (text[j] === ';') { i = j + 1; continue; }
      let depth = 1;
      let k = j + 1;
      while (k < to && depth > 0) { if (text[k] === '{') depth++; else if (text[k] === '}') depth--; k++; }
      const head = text.slice(i, j).trim();
      const body = text.slice(j + 1, k - 1);
      if (head.startsWith('@') && body.includes('{')) walk(j + 1, k - 1, `${prefix}${head}{`);
      else keys.add(`${prefix}${head}{${body}}`.replace(/\s+/g, ' '));
      i = k;
    }
  };
  walk(0, text.length, '');
  return keys;
}

const isSubset = (small, big) => small.size > 0 && [...small].every((key) => big.has(key));

/**
 * What to change on one page. `linked` and `client` are sheet URLs; `keysOf(url)` is a sheet's rule set. A client
 * sheet is added when it holds a linked sheet whole, and each linked sheet is dropped for the first client sheet that does.
 */
export function planSheets(linked, client, keysOf) {
  const add = [];
  const drop = [];
  for (const sheet of client) {
    const held = keysOf(sheet);
    const covers = linked.filter((l) => !drop.includes(l) && isSubset(keysOf(l), held));
    if (covers.length === 0) continue;
    add.push(sheet);
    drop.push(...covers);
  }
  return { add, drop };
}

const STYLESHEET_LINK = /<link\b[^>]*\brel="stylesheet"[^>]*>/g;
const hrefOf = (tag) => /\bhref="([^"]*)"/.exec(tag)?.[1];

/** The page's linked stylesheet URLs, in document order, leaving out <noscript>. */
export function linkedSheets(html) {
  return [...html.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '').matchAll(STYLESHEET_LINK)].map((m) => hrefOf(m[0])).filter(Boolean);
}

export function rewritePage(html, { add, drop }) {
  if (add.length === 0 && drop.length === 0) return html;
  const kept = html.replace(STYLESHEET_LINK, (tag) => (drop.includes(hrefOf(tag)) ? '' : tag));
  const last = [...kept.matchAll(STYLESHEET_LINK)].at(-1);
  const at = last ? last.index + last[0].length : kept.indexOf('</head>');
  return kept.slice(0, at) + add.map((href) => `<link rel="stylesheet" href="${href}">`).join('') + kept.slice(at);
}

/** Client sheets in the page's install that its linked sheets already hold in full. */
export function findWastedSheets(linked, client, keysOf) {
  const held = new Set(linked.flatMap((l) => [...keysOf(l)]));
  return client.filter((sheet) => isSubset(keysOf(sheet), held));
}

// ---- the thin function that touches the disk ----

function readView(distDir) {
  const files = new Map();
  const pages = new Map();
  const paths = [];
  const walkDir = (dir) => {
    for (const entry of fs.readdirSync(path.join(distDir, dir), { withFileTypes: true })) {
      const relative = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) { walkDir(relative); continue; }
      paths.push(relative);
      if (!/\.(?:html|js|css)$/.test(entry.name)) continue;
      const text = fs.readFileSync(path.join(distDir, relative), 'utf8');
      files.set(relative, text);
      if (relative.endsWith('.html')) pages.set(relative, text);
    }
  };
  walkDir('.');
  return { files, pages, paths };
}

/** Client sheets a page's install fetches that the page does not link (own-origin, from /shared/). */
function clientSheetsOf(view, html) {
  const linked = new Set(linkedSheets(html));
  return [...fullClosure(view, htmlRefs(html))]
    .filter((relative) => relative.startsWith('shared/') && relative.endsWith('.css'))
    .map((relative) => `/${relative}`)
    .filter((url) => !linked.has(url));
}

export function linkClientSheets(distDir) {
  const view = readView(distDir);
  const cache = new Map();
  const keysOf = (url) => {
    if (!cache.has(url)) cache.set(url, ruleKeys(view.files.get(url.slice(1)) ?? ''));
    return cache.get(url);
  };
  let changed = 0;
  const wasted = [];
  for (const [page, html] of view.pages) {
    const client = clientSheetsOf(view, html);
    if (client.length === 0) continue;
    const next = rewritePage(html, planSheets(linkedSheets(html), client, keysOf));
    if (next !== html) { fs.writeFileSync(path.join(distDir, page), next); changed++; }
    for (const sheet of findWastedSheets(linkedSheets(next), clientSheetsOf(view, next), keysOf)) wasted.push(`${page}: the install fetches ${sheet}, whose rules the page's linked sheets already hold`);
  }
  return { changed, wasted };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { changed, wasted } = linkClientSheets(path.resolve(process.argv[2] ?? 'dist'));
  console.log(`Client sheets: ${changed} pages link the browser build's sheet in place of the page sheets it holds.`);
  if (wasted.length > 0) {
    console.error(wasted.join('\n'));
    process.exit(1);
  }
}
