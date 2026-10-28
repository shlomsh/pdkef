#!/usr/bin/env node
/* ARCH-88: color literals (hex, rgb(), rgba(), hsl(), hsla()) live in `:root`
   tokens in src/styles/global.css, never in a stylesheet or CSS Module. This
   scans every .css under src/ and fails on a literal outside a `:root` or
   `@theme` block, naming file:line. Genuine non-theme colors (flag colors,
   user presets) are listed with a reason in scripts/color-literal-allowlist.json.
   ARCH-125: the same scan covers color literals inside JSX `style=` props in
   .tsx files (tests and specs excluded); document data such as a text mark's
   default ink is allowlisted the same way. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const LITERAL = /(?<![\w-])(?:#[0-9a-fA-F]{8}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\([^)]*\)/g;

const TEST_FILE = /\.(test|spec)\.[jt]sx?$/;
const blank = (s) => s.replace(/[^\n]/g, ' ');
const stripNoise = (css) =>
  css.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/url\([^)]*\)/g, blank);
const isTokenBlock = (prelude) => /^(:root\b|@theme\b)/.test(prelude.trim());

/** Pure: every color literal outside :root / @theme blocks, as {line, literal}. */
export function findColorLiterals(css) {
  const text = stripNoise(css);
  const out = [];
  const stack = [];
  let segStart = 0;
  const lineAt = (i) => text.slice(0, i).split('\n').length;
  const scan = (from, to) => {
    if (stack.some(Boolean) || !stack.length) return;
    const seg = text.slice(from, to);
    for (const m of seg.matchAll(LITERAL)) out.push({ line: lineAt(from + m.index), literal: m[0] });
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      stack.push(isTokenBlock(text.slice(segStart, i)));
      segStart = i + 1;
    } else if (c === ';' || c === '}') {
      scan(segStart, i);
      if (c === '}') stack.pop();
      segStart = i + 1;
    }
  }
  return out;
}

const blankComments = (src) => src.replace(/\/\*[\s\S]*?\*\/|(?<![:'"\w(])\/\/[^\n]*/g, blank);

/* End index (exclusive) of a JS string/template starting at src[i], or -1. */
function skipQuoted(src, i) {
  const q = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') j++;
    else if (src[j] === q) return j + 1;
    else if (q === '`' && src[j] === '$' && src[j + 1] === '{') {
      const end = skipBraces(src, j + 1);
      if (end < 0) return -1;
      j = end - 1;
    }
  }
  return -1;
}

/* End index (exclusive) of the balanced `{...}` starting at src[i], or -1. */
function skipBraces(src, i) {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') {
      j = skipQuoted(src, j) - 1;
      if (j < 0) return -1;
    } else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return j + 1;
  }
  return -1;
}

/** Pure: color literals inside JSX `style=` props only, as {line, literal}. */
export function findStylePropColorLiterals(source) {
  const text = blankComments(source);
  const out = [];
  const lineAt = (i) => text.slice(0, i).split('\n').length;
  for (const m of text.matchAll(/\bstyle=(?=[{"'])/g)) {
    const start = m.index + m[0].length;
    const end = text[start] === '{' ? skipBraces(text, start) : skipQuoted(text, start);
    if (end < 0) continue;
    for (const l of text.slice(start, end).matchAll(LITERAL)) out.push({ line: lineAt(start + l.index), literal: l[0] });
  }
  return out;
}

/** Pure: `files` is {path: source}; allowlist entries are {path, literal, reason}. */
export function checkFiles(files, allowlist) {
  const failures = [];
  const used = new Set();
  for (const [path, css] of Object.entries(files)) {
    const find = path.endsWith('.tsx') ? findStylePropColorLiterals : findColorLiterals;
    for (const { line, literal } of find(css)) {
      const idx = allowlist.findIndex((a) => a.path === path && a.literal === literal);
      if (idx >= 0) used.add(idx);
      else failures.push(`${path}:${line} ${literal}`);
    }
  }
  const stale = allowlist.filter((_, i) => !used.has(i)).map((a) => `stale allowlist entry ${a.path} ${a.literal}`);
  return { failures, stale };
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith('.css') || (name.endsWith('.tsx') && !TEST_FILE.test(name))) acc.push(p);
  }
  return acc;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(import.meta.url), '..', '..');
  const allowlist = JSON.parse(readFileSync(join(root, 'scripts/color-literal-allowlist.json'), 'utf8'));
  const files = {};
  for (const p of walk(join(root, 'src'))) files[relative(root, p)] = readFileSync(p, 'utf8');
  const { failures, stale } = checkFiles(files, allowlist);
  for (const f of [...failures, ...stale]) console.error(f);
  if (failures.length || stale.length) {
    console.error(`FAIL: ${failures.length} color literal(s) outside :root or in a style prop; use a token from global.css`);
    process.exit(1);
  }
  console.log('PASS: no color literals outside :root');
}
