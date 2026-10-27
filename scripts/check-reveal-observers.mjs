#!/usr/bin/env node
// Reveal-observer guard (ARCH-84): never reveal with an IntersectionObserver what JS first hid. Scans src/ file text for every new [window.|globalThis.]IntersectionObserver( (split across lines too); test/e2e files are skipped.
import { readFileSync, globSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pairSites } from './allowlist-sites.mjs';

const PATTERN = /new\s+(?:(?:window|globalThis)\s*\.\s*)?IntersectionObserver\s*\(/;

export const isScanned = (file) =>
  !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file) && !/(^|\/)(e2e|test)\//.test(file) && !/test-helper\./.test(file);

// Each allowlist entry covers exactly one site; an extra site or a stale entry both fail.
export function findObservers({ file, text, allow }) {
  return pairSites({ files: [{ file, text }], allow: allow.filter((a) => file.endsWith(a.file)), pattern: PATTERN });
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const allow = JSON.parse(readFileSync(new URL('./reveal-observers-allowlist.json', import.meta.url), 'utf8'));
  const files = globSync('src/**/*.{js,jsx,ts,tsx,mjs,astro}', { cwd: root }).filter(isScanned).sort();
  const hits = pairSites({ files: files.map((file) => ({ file, text: readFileSync(resolve(root, file), 'utf8') })), allow, pattern: PATTERN });
  for (const h of hits) console.error(h.kind === 'stale' ? `${h.file}  stale allowlist entry (no matching site): ${h.text}` : `${h.file}:${h.line}  unlisted IntersectionObserver\n    ${h.text}`);
  if (hits.length) {
    console.error(`\ncheck-reveal-observers: ${hits.length} problem(s). Each allowlist entry in scripts/reveal-observers-allowlist.json covers exactly one site: add an entry with a reason for a new site, remove an entry whose site is gone. Never reveal with an observer what JS first hid (CLAUDE.md).`);
    process.exit(1);
  }
  console.log('check-reveal-observers: every site is allowlisted, one entry each.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
