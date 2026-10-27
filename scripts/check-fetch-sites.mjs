#!/usr/bin/env node
// Fetch-site guard (ARCH-84): "no file bytes ever leave the device" is backstopped at runtime by CSP
// `connect-src 'self'`; this is the static half. Every `fetch(` call site in src/ (and a `fetch`
// passed as a default parameter, or called through a `fetchImpl` alias) must be listed in
// scripts/fetch-sites-allowlist.json with the reason it cannot send file bytes. Telemetry goes
// through navigator.sendBeacon in src/lib/errorReport.ts, not fetch. Test, e2e and support files are
// not scanned.
import { readFileSync, globSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PATTERN = /(?<![\w.$])fetch\s*\(|\bfetchImpl\s*\(|=\s*fetch\b/;

export const isScanned = (file) =>
  !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file) && !/(^|\/)(e2e|test)\//.test(file) && !/test-helper\./.test(file);

const isComment = (t) => /^\s*(\/\/|\*|\/\*)/.test(t);

export function findFetchSites({ file, text, allow }) {
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
  const allow = JSON.parse(readFileSync(new URL('./fetch-sites-allowlist.json', import.meta.url), 'utf8'));
  const files = globSync('src/**/*.{js,jsx,ts,tsx,mjs,astro}', { cwd: root }).filter(isScanned).sort();
  const hits = files.flatMap((file) => findFetchSites({ file, text: readFileSync(resolve(root, file), 'utf8'), allow }));
  for (const h of hits) console.error(`${h.file}:${h.line}  unlisted fetch site\n    ${h.text}`);
  if (hits.length) {
    console.error(`\ncheck:fetch-sites: ${hits.length} unlisted fetch site(s). File bytes never leave the device (CLAUDE.md). If this one cannot send file bytes, allowlist it in scripts/fetch-sites-allowlist.json with a reason.`);
    process.exit(1);
  }
  console.log('check:fetch-sites: every fetch call site is allowlisted.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
