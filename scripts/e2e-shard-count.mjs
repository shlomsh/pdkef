#!/usr/bin/env node
// QUAL-42: size CI's chromium e2e matrix by how many spec FILES are in scope,
// instead of always running 4 shards.
//
// Usage: node scripts/e2e-shard-count.mjs [--everything] [--paths "<space separated e2e_paths>"]
// Prints one line, `e2e_shards=[1,2,...]`, meant to be appended to $GITHUB_OUTPUT.
//
// PER_SHARD (8 spec files per shard) is a guess, to be tuned from CI timings.
// Any failure to list or parse fails open to all four shards.
import { spawnSync } from 'node:child_process';

export const MAX_SHARDS = 4;
export const PER_SHARD = 8;

/** [1..N] with N = clamp(ceil(count / perShard), 1, max). */
export function shardsFor(specFileCount, { max = MAX_SHARDS, perShard = PER_SHARD } = {}) {
  const n = Math.min(max, Math.max(1, Math.ceil(specFileCount / perShard)));
  return Array.from({ length: n }, (_, i) => i + 1);
}

/** Distinct spec files in a Playwright JSON report (object or string); null if malformed. */
export function countSpecFiles(report) {
  let data = report;
  if (typeof report === 'string') {
    try {
      data = JSON.parse(report);
    } catch {
      return null;
    }
  }
  if (!data || !Array.isArray(data.suites)) return null;
  const files = new Set();
  const walk = (suite) => {
    if (suite.file && (suite.specs?.length || !suite.suites?.length)) files.add(suite.file);
    for (const spec of suite.specs ?? []) if (spec.file) files.add(spec.file);
    for (const child of suite.suites ?? []) walk(child);
  };
  data.suites.forEach(walk);
  return files.size;
}

function parseArgs(argv) {
  const out = { everything: false, paths: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--everything') out.everything = true;
    else if (argv[i] === '--paths') out.paths = argv[++i] ?? '';
  }
  return out;
}

function main() {
  const { everything, paths } = parseArgs(process.argv.slice(2));
  const all = shardsFor(Infinity);
  const emit = (shards) => console.log(`e2e_shards=${JSON.stringify(shards)}`);
  const trimmed = paths.trim();
  if (everything || !trimmed) return emit(all);

  const res = spawnSync(
    'npx',
    ['playwright', 'test', '--list', '--project=chromium', '--reporter=json', ...trimmed.split(/\s+/)],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  if (res.error || res.status !== 0) {
    console.error(`e2e-shard-count: playwright --list failed (${res.error?.message ?? `exit ${res.status}`}), using all shards`);
    return emit(all);
  }
  const count = countSpecFiles(res.stdout);
  if (count === null) {
    console.error('e2e-shard-count: could not parse playwright --list output, using all shards');
    return emit(all);
  }
  emit(shardsFor(count));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
