// Cited-path guard (ARCH-94): guidance and source comments may only name repo paths that exist.
// Moved files left dead references in rule files, docs and comments (ARCH-45/46 alone orphaned dozens),
// and prose that points at nothing sends an agent hunting. check-guidance-budget.js runs this scan.
//
// What counts as a cited path: a token that starts with a top-level folder (ROOT_DIRS: src/, scripts/,
// docs/, e2e/, api/, public/, .claude/, .github/, patches/, backlog/) or is a bare root file (ROOT_FILES).
// A trailing :line or :line-line and trailing punctuation are stripped. A token with a glob or
// placeholder character (* { } ? < > $ ...) is a pattern, not a path, and is skipped. A token glued
// to a longer path or a URL (preceded by / . : word-char) is skipped, so https://x.dev/src/a.ts and
// ../src/a.ts do not count. Paths relative to the citing file (./x, ../x) are out of scope.
//
// Where it looks: markdown (CLAUDE.md, .claude/**/*.md, docs/*.md, not docs/archive/) takes the whole
// text; source files (.ts .tsx .js .mjs .astro) take comments only: // line comments, block comments
// and <!-- --> in .astro. backlog/ and docs/archive/ are history and are never scanned, and neither is
// a file git ignores (repo-files.mjs).
import { readFileSync, existsSync, globSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoFiles } from './repo-files.mjs';

const ROOT_DIRS = ['src', 'scripts', 'docs', 'e2e', 'api', 'public', '.claude', '.github', 'patches', 'backlog'];
const ROOT_FILES = ['CLAUDE.md', 'README.md', 'TODO.md', 'BACKLOG.md', 'package.json', 'vercel.json', 'middleware.ts', 'astro.config.mjs', 'playwright.config.js', 'vitest.config.js'];
const dirAlt = ROOT_DIRS.map((d) => d.replace('.', '\\.')).join('|');
const fileAlt = ROOT_FILES.map((f) => f.replace(/\./g, '\\.')).join('|');
// Leading context must not be part of a longer path or URL; the token itself swallows pattern characters.
const CITE = new RegExp(`(?<![\\w./:@~-])((?:(?:${dirAlt})/|(?:${fileAlt})(?![\\w/-]))[\\w./@*{}?<>$\\[\\]~-]*)`, 'g');
const PATTERN_CHARS = /[*{}?<>$[\]]/;

export function citedPaths(text) {
  const out = [];
  for (const m of text.matchAll(CITE)) {
    let token = m[1];
    const next = text[m.index + token.length];
    if (PATTERN_CHARS.test(token) || next === '*' || next === '<' || next === '{') continue;
    token = token.replace(/:\d+(?:-\d+)?$/, '').replace(/[.,;:]+$/, '');
    if (token.endsWith('...') || token.includes('..') || /[-_]$/.test(token)) continue; // a wrapped name or an ellipsis
    out.push(token);
  }
  return out;
}

export function commentText(text, file) {
  const parts = [...text.matchAll(/(?<=^|[\s;{}(),])\/\*[\s\S]*?\*\//g)].map((m) => m[0]);
  parts.push(...[...text.matchAll(/(?:^|[\s;{}(),])\/\/[^\n]*/g)].map((m) => m[0]));
  if (file.endsWith('.astro')) parts.push(...(text.match(/<!--[\s\S]*?-->/g) ?? []));
  return parts.join('\n');
}

const isMarkdown = (file) => file.endsWith('.md');
const skipped = (file) => file.startsWith('docs/archive/') || file.startsWith('backlog/');

// Dead paths cited by one file. `exists` is injected so tests need no tree.
export function findDeadPaths({ file, text, exists }) {
  if (skipped(file)) return [];
  const scanned = isMarkdown(file) ? text : commentText(text, file);
  const dead = new Set();
  for (const p of citedPaths(scanned)) if (!exists(p.replace(/\/$/, ''))) dead.add(p);
  return [...dead].map((p) => ({ file, path: p }));
}

const SOURCE = /\.(?:ts|tsx|js|mjs|astro)$/;

export function scanRepo(root) {
  const exists = (p) => existsSync(resolve(root, p));
  const known = repoFiles(root); // gitignored local files are not ours to judge (DEBT-68)
  const files = [
    'CLAUDE.md',
    ...globSync('.claude/**/*.md', { cwd: root }),
    ...globSync('docs/*.md', { cwd: root }),
    ...globSync('{src,scripts,api}/**/*', { cwd: root }).filter((f) => SOURCE.test(f)),
    ...ROOT_FILES.filter((f) => SOURCE.test(f)),
  ].filter((f) => known.has(f) && existsSync(resolve(root, f)));
  return files.flatMap((file) => findDeadPaths({ file, text: readFileSync(resolve(root, file), 'utf8'), exists }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dead = scanRepo(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  for (const d of dead) console.error(`${d.file}: cites ${d.path}, which does not exist`);
  console.log(dead.length ? `${dead.length} dead cited path(s)` : 'Cited paths OK');
  process.exit(dead.length ? 1 : 0);
}
