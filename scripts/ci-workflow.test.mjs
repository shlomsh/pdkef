import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// ci.yml is read and parsed once; each describe below pins one structure of it.
const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const lines = ci.split('\n');
const jobs = parse(ci).jobs;
const stepsOf = (job) => jobs[job].steps ?? [];
const runs = (job) => stepsOf(job).map((s) => s.run ?? '');

describe('ci.yml nightly dispatch', () => {
  // The one schedule-only gate on purpose: the step with `id: nightly` must never
  // skip a manual nightly as "unchanged".
  function nightlyStepIfLine() {
    const idAt = lines.findIndex((l) => /^\s*id: nightly\s*$/.test(l));
    expect(idAt).toBeGreaterThan(-1);
    for (let i = idAt + 1; i < lines.length; i++) {
      if (/^\s*if:/.test(lines[i])) return i;
      if (/^\s*- name:/.test(lines[i])) break;
    }
    throw new Error('no if: in the nightly step');
  }

  it('workflow_dispatch has a boolean nightly input defaulting to false', () => {
    const at = lines.findIndex((l) => /^\s*nightly:\s*$/.test(l));
    expect(at).toBeGreaterThan(-1);
    const block = lines.slice(at, at + 4).join('\n');
    expect(block).toMatch(/type: boolean/);
    expect(block).toMatch(/default: false/);
  });

  it("every schedule gate also accepts a nightly dispatch, except the 'nightly' step", () => {
    const skip = nightlyStepIfLine();
    const gates = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l, i }) => l.includes("github.event_name == 'schedule'") && i !== skip);
    expect(gates.length).toBeGreaterThan(0);
    for (const { l } of gates) expect(l).toContain('inputs.nightly');
    expect(lines[skip]).not.toContain('inputs.nightly');
  });

  it('scope accepts a nightly dispatch; the baseline step is unchanged', () => {
    const scopeAt = lines.findIndex((l) => /^  scope:\s*$/.test(l));
    const scopeIf = lines.slice(scopeAt, scopeAt + 5).find((l) => /^\s*if:/.test(l));
    expect(scopeIf).toContain('inputs.nightly');
    expect(ci).toMatch(/if: \$\{\{ always\(\) && inputs\.update-export-render-baseline \}\}/);
  });
});

// QUAL-39: the unit suite runs as two parallel shards; QUAL-41: the spec-read guard runs in `checks`.
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

describe('ci.yml update-cost (MEM-21)', () => {
  // The update-cost job's own text, from its key to the next job.
  function updateCostJob() {
    const start = ci.indexOf('\n  update-cost:\n');
    expect(start).toBeGreaterThan(-1);
    const next = ci.slice(start + 1).search(/\n {2}[\w-]+:\n/);
    return next === -1 ? ci.slice(start) : ci.slice(start, start + 1 + next);
  }

  // Astro hashes each island's absolute source path into its `uid`, so two builds at two paths
  // differ on every island page; measured 2026-10-28, that was about 880 KB of a 907 KB reading.
  it('builds both deploys at one path', () => {
    const job = updateCostJob();
    const adds = [...job.matchAll(/git worktree add\s+("[^"]*"|\S+)/g)].map((m) => m[1]);
    expect(adds).toHaveLength(1);
    expect(adds[0]).not.toMatch(/\$side|\$\{\{/);
  });

  // MEM-26, MEM-27: report-only from 2026-10-28 until a style edit stopped renaming chunks (MEM-26) and
  // re-downloading every tool page (MEM-27); a reading over target is a real regression now.
  it('fails the nightly when the update cost is over target', () => {
    expect(updateCostJob()).not.toMatch(/continue-on-error/);
  });
});

// QUAL-42: CI resolves scope and builds dist/ once, in `plan`; every other job downloads it.
describe('ci.yml builds once (QUAL-42)', () => {
  const needsOf = (job) => [].concat(jobs[job].needs ?? []);
  const PLAN_CONSUMERS = ['build', 'e2e', 'e2e-webkit', 'font-guards', 'export-guards'];
  const usesDist = (job) =>
    stepsOf(job).some((s) => String(s.uses ?? '').startsWith('actions/download-artifact') && s.with?.name === 'dist');

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
    expect(ci).not.toContain('dependency-gate');
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
