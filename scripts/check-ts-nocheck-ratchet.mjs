#!/usr/bin/env node
// ARCH-80: the number of src/ files that opt out of type-checking with a
// `@ts-nocheck` pragma only shrinks. The record is scripts/ts-nocheck-limit.json
// ({ "src": N }). A higher count fails; a lower one passes and, outside CI,
// rewrites the record lower (in CI it only prints).
//
//   node scripts/check-ts-nocheck-ratchet.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT_FILE = path.join(root, 'scripts', 'ts-nocheck-limit.json');

// Pure: does the source carry the pragma in its leading comments (the only place
// TypeScript honours it)? A string or a comment after code does not count.
export function hasNoCheckPragma(source) {
  const ranges = ts.getLeadingCommentRanges(source, 0) ?? [];
  return ranges.some((r) => /^(\/\/|\/\*)\s*@ts-nocheck\b/.test(source.slice(r.pos, r.end)));
}

// Pure: { [file]: source } -> how many files carry the pragma.
export function countNoCheck(sources) {
  return Object.values(sources).filter(hasNoCheckPragma).length;
}

// Pure: recorded vs current count.
export function compareNoCheck(recorded, current) {
  return { failed: current > recorded, lowered: current < recorded };
}

function readSources() {
  const files = execFileSync('git', ['ls-files', 'src'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter((f) => /\.(js|jsx|mjs|ts|tsx)$/.test(f) && fs.existsSync(path.join(root, f)));
  const sources = {};
  for (const f of files) sources[f] = fs.readFileSync(path.join(root, f), 'utf8');
  return sources;
}

function main() {
  const record = JSON.parse(fs.readFileSync(LIMIT_FILE, 'utf8'));
  const current = countNoCheck(readSources());
  const { failed, lowered } = compareNoCheck(record.src, current);
  if (failed) {
    console.error(`ts-nocheck ratchet: ${current} files under src/ carry @ts-nocheck, the record is ${record.src}. Type-check the new file instead of raising the record.`);
    return 1;
  }
  if (lowered) {
    if (process.env.CI) {
      console.log(`ts-nocheck ratchet: ${record.src} -> ${current} can be recorded (run it locally to rewrite scripts/ts-nocheck-limit.json).`);
    } else {
      fs.writeFileSync(LIMIT_FILE, `${JSON.stringify({ ...record, src: current }, null, 2)}\n`);
      console.log(`ts-nocheck ratchet: lowered ${record.src} -> ${current} in scripts/ts-nocheck-limit.json.`);
    }
  }
  console.log(`ts-nocheck ratchet: ok (${current} files under src/).`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main());
}
