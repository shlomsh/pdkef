import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// QUAL-39: the unit suite runs as two parallel shards; QUAL-41: the spec-read guard runs in `checks`.
const jobs = parse(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')).jobs;
const runs = (job) => (jobs[job].steps ?? []).map((s) => s.run ?? '');

describe('ci.yml units (QUAL-39)', () => {
  it('is a two-shard matrix that does not cancel the other shard', () => {
    expect(jobs.units.strategy.matrix.shard).toEqual([1, 2]);
    expect(jobs.units.strategy['fail-fast']).toBe(false);
  });

  it('each shard runs vitest with its own --shard of the job total, once', () => {
    const vitest = runs('units').filter((r) => /vitest run/.test(r));
    expect(vitest).toHaveLength(1);
    expect(vitest[0]).toContain('npx vitest run --shard=${{ matrix.shard }}/${{ strategy.job-total }}');
  });

  it('still installs poppler-utils and checks out full history in every shard', () => {
    expect(runs('units').some((r) => r.includes('poppler-utils'))).toBe(true);
    expect(jobs.units.steps.find((s) => String(s.uses ?? '').startsWith('actions/checkout')).with['fetch-depth']).toBe(0);
  });

  it('checks proves the shards cover the suite exactly once', () => {
    expect(runs('checks')).toContain('npm run check:unit-shards');
  });
});

describe('ci.yml checks (QUAL-41)', () => {
  it('runs the spec-read guard', () => {
    expect(runs('checks')).toContain('npm run test:spec-file-reads');
  });
});
