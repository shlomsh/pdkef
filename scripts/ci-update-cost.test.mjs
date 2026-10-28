import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

// The update-cost job's own text, from its key to the next job.
function updateCostJob() {
  const start = ci.indexOf('\n  update-cost:\n');
  expect(start).toBeGreaterThan(-1);
  const next = ci.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  return next === -1 ? ci.slice(start) : ci.slice(start, start + 1 + next);
}

describe('ci.yml update-cost (MEM-21)', () => {
  // Astro hashes each island's absolute source path into its `uid`, so two builds at two paths
  // differ on every island page; measured 2026-10-28, that was about 880 KB of a 907 KB reading.
  it('builds both deploys at one path', () => {
    const job = updateCostJob();
    const adds = [...job.matchAll(/git worktree add\s+("[^"]*"|\S+)/g)].map((m) => m[1]);
    expect(adds).toHaveLength(1);
    expect(adds[0]).not.toMatch(/\$side|\$\{\{/);
  });
});
