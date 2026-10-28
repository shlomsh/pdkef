import { describe, it, expect } from 'vitest';
import { typecheckSteps, parseArgs, summaryLine, unitsDetail, GUARD_STEPS, guardSteps } from './check-fast.mjs';
import { ALWAYS_GUARD_STEPS } from './check-push.mjs';
import { ORACLE_FILES } from './unit-scope.mjs';

describe('typecheckSteps', () => {
  it('runs tsc alone once .astro/types.d.ts exists', () => {
    expect(typecheckSteps({ astroTypesExist: true })).toEqual(['tsc']);
  });

  it('syncs astro types first when they are missing', () => {
    expect(typecheckSteps({ astroTypesExist: false })).toEqual(['astro-sync', 'tsc']);
  });
});

describe('parseArgs', () => {
  it('defaults to no --since', () => {
    expect(parseArgs([])).toEqual({ since: undefined });
  });

  it('reads --since <ref>', () => {
    expect(parseArgs(['--since', 'abc1234'])).toEqual({ since: 'abc1234' });
  });

  it('rejects --since without a ref', () => {
    expect(parseArgs(['--since'])).toHaveProperty('error');
    expect(parseArgs(['--since', '--other'])).toHaveProperty('error');
  });
});

describe('unitsDetail', () => {
  it('counts seeds, or says skipped when none', () => {
    expect(unitsDetail({ seeds: ['a', 'b'] })).toBe('2 seeds');
    expect(unitsDetail({ seeds: [] })).toBe('skipped');
  });
});

describe('summaryLine', () => {
  const steps = [
    { name: 'guards', seconds: 1.3 },
    { name: 'units', seconds: 9.4, detail: '5 seeds' },
    { name: 'tsc', seconds: 2 },
  ];

  it('reports a pass with per-step times and the --since ref', () => {
    expect(summaryLine({ ok: true, since: 'abc1234', base: 'abc1234', steps })).toBe(
      'check:fast PASS in 12.7s, since abc1234: guards 1.3s, units 9.4s (5 seeds), tsc 2.0s',
    );
  });

  it('names the failed step and the merge-base when no --since was given', () => {
    expect(summaryLine({ ok: false, failed: 'units', base: 'deadbeefcafe', steps: steps.slice(0, 2) })).toBe(
      'check:fast FAIL at units in 10.7s, since merge-base deadbee: guards 1.3s, units 9.4s (5 seeds)',
    );
  });
});

it('is itself an oracle file, so changing it widens the unit run', () => {
  expect(ORACLE_FILES.has('scripts/check-fast.mjs')).toBe(true);
});

describe('GUARD_STEPS', () => {
  // A subagent iterates with check:fast alone; a ratchet it skips fails only at check:push or in CI.
  it('runs every ratchet and shape check check:push runs, in the same order', () => {
    const ratchets = ALWAYS_GUARD_STEPS.filter((s) => /ratchet|unused-exports|untested-modules|e2e-sleeps|tool-shape|import-aliases|js-typed/.test(s));
    expect(GUARD_STEPS.filter((s) => ratchets.includes(s))).toEqual(ratchets);
  });
});

describe('guardSteps (QUAL-41, QUAL-39)', () => {
  const SPEC_READS = 'test:spec-file-reads';

  it('always runs the unit-shard check, which costs a third of a second', () => {
    expect(GUARD_STEPS).toContain('check:unit-shards');
  });

  it.each([
    'src/lib/foo.test.js',
    'src/tools/sign/e2e/a.spec.js',
    'e2e/home/b.spec.js',
    'scripts/unit-scope.mjs',
    'scripts/unowned-verdicts.mjs',
    'scripts/affected-scope.mjs',
    'src/tools/sign/project.json',
    'nx.json',
  ])('adds the spec-read guard (9s, one Nx graph) when the diff touches %s', (file) => {
    expect(guardSteps([file])).toContain(SPEC_READS);
  });

  it('leaves it out for a diff that cannot change what a spec reads or which rule selects it', () => {
    expect(guardSteps(['src/lib/foo.js', 'docs/a.md'])).not.toContain(SPEC_READS);
    expect(guardSteps([])).toEqual(GUARD_STEPS);
  });
});
