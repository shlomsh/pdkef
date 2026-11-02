#!/usr/bin/env node
/* An absolutely positioned child (`.host > svg|img|canvas|*`) leaves `.host` with no in-flow content, so inside a
   flex row it shrinks to 0 px wide unless it carries its own size (the underline thickness rows of Highlight's
   LookControls shipped empty this way). Heuristic over CSS Modules under src/: every such host must declare a
   width, flex, aspect-ratio or similar in the same file. It cannot see a host's other classes, so hosts sized by a
   sibling class go in the allowlist below with a reason.
   Usage: node scripts/check-css-sized-hosts.mjs [file.css | -]   (a path or stdin checks just that one) */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWLIST = [
  { file: 'src/tools/highlight/components/LookControls.module.css', host: 'paper', reason: 'always rendered with .face (width: calc(4ch + 8px)) in LookControls.tsx' },
  { file: 'src/tools/highlight/components/LookControls.module.css', host: 'faceLine', reason: 'always rendered with .face (width: calc(4ch + 8px)) in LookControls.tsx' },
];

const SIZING = /(^|;)\s*(width|min-width|inline-size|min-inline-size|flex|flex-grow|flex-basis|aspect-ratio|grid-column|inset)\s*:|(^|;)\s*(justify-self|align-self)\s*:\s*stretch\b/;
const CHILD = /^\.([\w-]+)\s*>\s*(svg|img|canvas|\*)$/;

/** Pure: [{host, line}] for each absolute `.host > child` whose `.host` declares no size. */
export function findUnsizedHosts(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const rules = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const lead = m[1].match(/^\s*/)[0];
    const line = text.slice(0, m.index + lead.length).split('\n').length;
    for (const sel of m[1].split(',')) rules.push({ sel: sel.trim(), body: m[2], line });
  }
  const sized = new Set(rules.filter((r) => SIZING.test(r.body)).map((r) => r.sel));
  const out = [];
  const seen = new Set();
  for (const r of rules) {
    const c = r.sel.match(CHILD);
    if (!c || !/(^|;)\s*position\s*:\s*absolute\b/.test(r.body)) continue;
    const key = `${c[1]}`;
    if (sized.has(`.${c[1]}`) || seen.has(key)) continue;
    seen.add(key);
    out.push({ host: c[1], line: r.line });
  }
  return out;
}

/** Pure: findings for one file after the allowlist. */
export function checkCss(file, css, allow = ALLOWLIST) {
  return findUnsizedHosts(css).filter((f) => !allow.some((a) => a.file === file && a.host === f.host));
}

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.module.css') ? [p] : [];
  });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(import.meta.url), '..', '..');
  const arg = process.argv[2];
  const inputs = arg
    ? [{ file: arg === '-' ? '<stdin>' : arg, css: readFileSync(arg === '-' ? 0 : arg, 'utf8') }]
    : walk(join(root, 'src')).map((p) => ({ file: relative(root, p), css: readFileSync(p, 'utf8') }));
  let bad = 0;
  for (const { file, css } of inputs) {
    for (const f of checkCss(file, css)) {
      bad++;
      console.error(`${file}:${f.line}: .${f.host} holds only absolute children but declares no width/flex/aspect-ratio; in a flex row it collapses to 0 px. Size it, or allowlist it with a reason.`);
    }
  }
  if (bad) process.exit(1);
  console.log(`CSS sized hosts: ${inputs.length} file(s) checked, no unsized absolute-child host.`);
}
