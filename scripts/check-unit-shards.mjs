import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * QUAL-39: CI runs the unit suite as parallel `vitest run --shard=i/N` jobs. A shard split that
 * silently drops or doubles a test file would pass every job and still lose coverage, so this guard
 * lists what vitest would run in full and per shard (every project in vitest.config.js) and fails
 * unless the shards cover the full list exactly once, with none empty.
 * The `browser` project is sharded apart, in `units-browser`.
 * Usage: node scripts/check-unit-shards.mjs
 */

export function compareShards(full, shards) {
  const fullSet = new Set(full);
  const seen = new Map();
  shards.forEach((files) => {
    for (const f of new Set(files)) seen.set(f, (seen.get(f) ?? 0) + 1);
  });
  return finish({
    missing: full.filter((f) => !seen.has(f)),
    extra: [...seen.keys()].filter((f) => !fullSet.has(f)),
    duplicated: [...seen].filter(([, n]) => n > 1).map(([f]) => f),
    empty: shards.map((files, i) => (files.length === 0 ? i + 1 : 0)).filter(Boolean),
  });
}

function finish(parts) {
  const ok = Object.values(parts).every((a) => a.length === 0);
  return { ok, ...parts };
}

// The matrices of the `units` and `units-browser` jobs (scripts/ci-workflow.test.mjs holds ci.yml to these).
export const UNIT_SHARDS = 4;
export const BROWSER_SHARDS = 2;

const BROWSER_PROJECT = 'browser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// `vitest list` ignores --shard, so ask vitest's own node API instead: glob the specs of every
// project and apply the configured sequencer's shard(), exactly as `vitest run --shard` does.
// One entry per project and file: a file run by two projects counts twice, as vitest runs it twice.
async function listFiles(shard, project) {
  const { createVitest } = await import('vitest/node');
  const ctx = await createVitest('test', { watch: false, root, ...(shard ? { shard } : {}), ...(project ? { project } : {}) });
  try {
    let specs = await ctx.globTestSpecifications();
    if (shard) specs = await new ctx.config.sequence.sequencer(ctx).shard(Array.from(specs));
    return specs.map((s) => `${s.project.name}: ${path.relative(root, s.moduleId)}`);
  } finally {
    await ctx.close();
  }
}

async function main() {
  const full = await listFiles();
  const shards = [];
  for (let k = 1; k <= UNIT_SHARDS; k++) shards.push(await listFiles(`${k}/${UNIT_SHARDS}`, [`!${BROWSER_PROJECT}`]));
  for (let k = 1; k <= BROWSER_SHARDS; k++) shards.push(await listFiles(`${k}/${BROWSER_SHARDS}`, [BROWSER_PROJECT]));
  const r = compareShards(full, shards);
  if (!r.ok) {
    console.error('unit shards: the split does not cover the suite exactly once');
    if (r.missing.length) console.error(`  run by no shard:\n    ${r.missing.join('\n    ')}`);
    if (r.extra.length) console.error(`  not in the full suite:\n    ${r.extra.join('\n    ')}`);
    if (r.duplicated.length) console.error(`  run by several shards:\n    ${r.duplicated.join('\n    ')}`);
    if (r.empty.length) console.error(`  empty shards: ${r.empty.join(', ')}`);
    process.exit(1);
  }
  console.log(`unit shards: ${UNIT_SHARDS} unit and ${BROWSER_SHARDS} ${BROWSER_PROJECT} shards cover ${full.length} files exactly once`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
