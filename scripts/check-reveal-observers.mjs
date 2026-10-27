#!/usr/bin/env node
// Reveal-observer guard (ARCH-84): CLAUDE.md says "Never reveal with an IntersectionObserver what JS
// first hid; derive reveal state from scroll position (animation-timeline: view())". This scans src/
// for every `new IntersectionObserver(` and fails on one that is not in
// scripts/reveal-observers-allowlist.json, where each entry says what the observer watches and why
// it reveals nothing JS hid. Test, e2e and support files are not scanned.
import { readFileSync, globSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PATTERN = /new\s+IntersectionObserver\s*\(/;

export const isScanned = (file) =>
  !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file) && !/(^|\/)(e2e|test)\//.test(file);

const isComment = (t) => /^\s*(\/\/|\*|\/\*)/.test(t);

export function findObservers({ file, text, allow }) {
  const hits = [];
  text.split('\n').forEach((t, i) => {
    if (isComment(t) || !PATTERN.test(t)) return;
    if (allow.some((a) => file.endsWith(a.file) && t.includes(a.includes))) return;
    hits.push({ file, line: i + 1, text: t.trim() });
  });
  return hits;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const allow = JSON.parse(readFileSync(new URL('./reveal-observers-allowlist.json', import.meta.url), 'utf8'));
  const files = globSync('src/**/*.{js,jsx,ts,tsx,mjs,astro}', { cwd: root }).filter(isScanned).sort();
  const hits = files.flatMap((file) => findObservers({ file, text: readFileSync(resolve(root, file), 'utf8'), allow }));
  for (const h of hits) console.error(`${h.file}:${h.line}  unlisted IntersectionObserver\n    ${h.text}`);
  if (hits.length) {
    console.error(`\ncheck:reveal-observers: ${hits.length} unlisted observer(s). Never reveal with an observer what JS first hid (CLAUDE.md); derive reveal from scroll position. If this one reveals nothing JS hid, allowlist it in scripts/reveal-observers-allowlist.json with a reason.`);
    process.exit(1);
  }
  console.log('check:reveal-observers: every IntersectionObserver is allowlisted.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
