#!/usr/bin/env node
// Never-say guard (SEO-37): fails when English copy uses a phrase the positioning protocol bans.
// The list is docs/seo-competitive-findings.md section 7 (the "what we must never say" column and
// the voice rule "plain facts over intensifiers") plus the strings SEO-36 removed. Keep both in sync.
//
// Scope: English copy fields only. Whole files for src/data/tools.js, src/data/homeContent.js and
// src/content/**/*.yaml (the localized-* folders are other languages and are skipped). For
// src/i18n/*Messages.ts only the English objects count: a block that starts at a top-level
// `const english...` line and ends at the next line that is exactly `};` (the Hebrew and
// Indonesian objects sit in their own blocks and are never scanned).
import { readFileSync, globSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BANNED = [
  { re: /100\s?%/, why: '"100%" intensifier' },
  { re: /\bsecure\b/i, why: '"secure" as a privacy claim (say "private"; "protect" is Unlock\'s verb)' },
  { re: /client-side/i, why: '"client-side" is jargon (say "on your device")' },
  { re: /guaranteeing/i, why: '"guaranteeing" over-promises' },
  { re: /\binstantly\b/i, why: '"instantly" intensifier' },
  { re: /free forever/i, why: '"Free Forever" is a promise we do not make' },
  { re: /military-grade/i, why: '"military-grade" security jargon' },
  { re: /breach-proof/i, why: '"breach-proof" over-promises' },
  { re: /free tier/i, why: '"free tier" implies a paid version' },
];

// Legitimate uses. Each entry matches one banned hit by file suffix and a substring of the line.
export const ALLOW = [
  { file: 'src/data/tools.js', includes: 'Add a password to secure your PDF', reason: "Unlock's gridDescription uses 'secure' as a verb, not as a privacy claim" },
  { file: 'sign-pdf-no-signup.yaml', includes: 'the free tier, and stop one person', reason: 'explains why other services meter usage; says nothing about our own product (rewording would restale the Hebrew sourceHash)' },
];

export const FILES = [
  'src/data/tools.js',
  'src/data/homeContent.js',
  'src/content/content-pages/*.yaml',
  'src/i18n/*Messages.ts',
];

// Lines of a *Messages.ts file that belong to an English object.
export function englishLines(text) {
  const out = [];
  let inEnglish = false;
  text.split('\n').forEach((line, i) => {
    if (/^(export )?const english\w*/.test(line)) inEnglish = true;
    if (inEnglish) out.push({ line: i + 1, text: line });
    if (inEnglish && /^};?\s*$/.test(line)) inEnglish = false;
  });
  return out;
}

export function findViolations({ file, text, banned = BANNED, allow = ALLOW }) {
  const lines = /Messages\.ts$/.test(file)
    ? englishLines(text)
    : text.split('\n').map((t, i) => ({ line: i + 1, text: t }));
  const isComment = (t) => /^\s*(\/\/|\*|\/\*)/.test(t); // code comments are not copy
  const hits = [];
  for (const { line, text: t } of lines) {
    if (isComment(t)) continue;
    for (const { re, why } of banned) {
      if (!re.test(t)) continue;
      if (allow.some((a) => file.endsWith(a.file) && t.includes(a.includes))) continue;
      hits.push({ file, line, why, text: t.trim() });
    }
  }
  return hits;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const hits = FILES.flatMap((pattern) => globSync(pattern, { cwd: root }).sort())
    .flatMap((file) => findViolations({ file, text: readFileSync(resolve(root, file), 'utf8') }));
  for (const h of hits) console.error(`${h.file}:${h.line}  ${h.why}\n    ${h.text}`);
  if (hits.length) {
    console.error(`\ncheck:never-say: ${hits.length} hit(s). See docs/seo-competitive-findings.md section 7; reword, or allowlist a true use in scripts/check-never-say.mjs with a reason.`);
    process.exit(1);
  }
  console.log('check:never-say: no banned phrases in English copy.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
