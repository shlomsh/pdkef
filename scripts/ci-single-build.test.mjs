import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// QUAL-42: CI resolves scope and builds dist/ once, in `plan`; every other job downloads it.
const doc = parse(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
const jobs = doc.jobs;
const stepsOf = (job) => jobs[job].steps ?? [];
const runs = (job) => stepsOf(job).map((s) => s.run ?? '');
const needsOf = (job) => [].concat(jobs[job].needs ?? []);
const PLAN_CONSUMERS = ['build', 'e2e', 'e2e-webkit', 'font-guards', 'export-guards'];
const usesDist = (job) =>
  stepsOf(job).some((s) => String(s.uses ?? '').startsWith('actions/download-artifact') && s.with?.name === 'dist');

describe('ci.yml builds once (QUAL-42)', () => {
  it('has a plan job', () => {
    expect(jobs.plan).toBeDefined();
  });

  it('npm run build runs only in plan and update-cost', () => {
    const builders = Object.keys(jobs).filter((j) => runs(j).some((r) => /npm run build\b/.test(r)));
    expect(builders.sort()).toEqual(['plan', 'update-cost']);
  });

  it('affected-scope.mjs runs only in plan', () => {
    const users = Object.keys(jobs).filter((j) => runs(j).some((r) => r.includes('scripts/affected-scope.mjs')));
    expect(users).toEqual(['plan']);
  });

  it('every job that runs playwright or a dist guard needs plan, downloads dist and does not build', () => {
    const distGuard = /playwright test|test:(csp|seo|redirects|css|weight|lazy-modules|precache-budget|stable-names)\b/;
    const consumers = Object.keys(jobs).filter((j) => runs(j).some((r) => distGuard.test(r)));
    expect(consumers.sort()).toEqual([...PLAN_CONSUMERS].sort());
    for (const j of consumers) {
      expect(needsOf(j), j).toContain('plan');
      expect(usesDist(j), j).toBe(true);
      expect(stepsOf(j).some((s) => s.name === 'Build'), j).toBe(false);
    }
  });

  it('plan uploads dist with hidden files', () => {
    const up = stepsOf('plan').find((s) => String(s.uses ?? '').startsWith('actions/upload-artifact'));
    expect(up?.with?.name).toBe('dist');
    expect(up?.with?.path).toBe('dist/');
    expect(up?.with?.['include-hidden-files']).toBe(true);
    // A "Re-run all jobs" repeats the upload in the same run; without overwrite it fails on the existing name.
    expect(up?.with?.overwrite).toBe(true);
    // A failed consumer is often re-run the next day.
    expect(up?.with?.['retention-days']).toBeGreaterThanOrEqual(3);
  });

  it('plan keeps the full history it checked out: no depth-limited fetch before the build', () => {
    // A `git fetch --depth=1` turns a full clone shallow, and the site build then dates every older page to the boundary commit.
    const shallow = stepsOf('plan').filter((s) => /git fetch[^\n]*--depth/.test(s.run ?? ''));
    expect(shallow.map((s) => s.name)).toEqual([]);
  });

  it('plan checks out full history', () => {
    const co = stepsOf('plan').find((s) => String(s.uses ?? '').startsWith('actions/checkout'));
    expect(co?.with?.['fetch-depth']).toBe(0);
  });

  it('the e2e matrix is sized by plan and sharded by job-total', () => {
    expect(jobs.e2e.strategy.matrix.shard).toContain('fromJSON(needs.plan.outputs.e2e_shards');
    expect(runs('e2e').join('\n')).toContain('--shard=${{ matrix.shard }}/${{ strategy.job-total }}');
  });

  it('dependency-gate is gone, with every reference', () => {
    expect(jobs['dependency-gate']).toBeUndefined();
    expect(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')).not.toContain('dependency-gate');
  });

  it('every job that reads a plan output lists plan in needs', () => {
    for (const [name, job] of Object.entries(jobs)) {
      if (JSON.stringify(job).includes('needs.plan.')) expect(needsOf(name), name).toContain('plan');
    }
  });

  it('every consumer requires plan to have succeeded', () => {
    for (const j of PLAN_CONSUMERS) expect(jobs[j].if, j).toContain("needs.plan.result == 'success'");
  });
});
