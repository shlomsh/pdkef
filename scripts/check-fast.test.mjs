import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { typecheckSteps, parseArgs, summaryLine, unitsDetail, GUARD_STEPS, guardSteps, lintScope, lintCommand, guardJobs } from './check-fast.mjs';
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

describe('lintScope (check:fast lints only the changed files)', () => {
  const m = (path, status = 'M') => ({ path, status });

  it('lints the changed lintable files, without deleted ones or other extensions', () => {
    expect(lintScope([m('src/a.ts'), m('src/b.tsx', 'A'), m('src/gone.ts', 'D'), m('docs/x.md'), m('scripts/c.mjs'), m('src/p.astro')])).toEqual(['src/a.ts', 'src/b.tsx', 'scripts/c.mjs', 'src/p.astro'].filter((f) => !f.endsWith('.astro')));
  });

  it('lints everything when the diff touches the oxlint config, package.json, the lockfile or a plugin patch', () => {
    for (const f of ['.oxlintrc.json', 'tsconfig.json', 'tsconfig.node.json', 'package.json', 'package-lock.json', 'patches/@interfere+landmines+0.3.1.patch']) {
      expect(lintScope([m('src/a.ts'), m(f)])).toBeNull();
    }
    expect(lintScope([m('package.json', 'D')])).toBeNull();
  });

  it('lints everything when there is no usable base or too many files', () => {
    expect(lintScope(null)).toBeNull();
    expect(lintScope(Array.from({ length: 400 }, (_, i) => m(`src/f${i}.ts`)))).toBeNull();
  });

  it('is an empty list when nothing lintable changed', () => {
    expect(lintScope([m('docs/x.md'), m('src/gone.ts', 'D')])).toEqual([]);
    expect(lintScope([])).toEqual([]);
  });
});

describe('lintCommand', () => {
  it('lints everything when there is no file list', () => {
    expect(lintCommand(null)).toBe('oxlint');
  });

  it('passes quoted files and keeps ignorePatterns files from failing the run', () => {
    expect(lintCommand(['src/a b.ts'])).toBe(`oxlint --no-error-on-unmatched-pattern -- 'src/a b.ts'`);
  });

  it('says it has nothing to lint for an empty list', () => {
    expect(lintCommand([])).toMatch(/^echo '.*nothing to lint/);
  });
});

describe('guardJobs', () => {
  const scripts = Object.fromEntries(GUARD_STEPS.filter((s) => s !== 'check-orphaned-selectors' && s !== 'check-class-resolution').map((s) => [s, 'echo ' + s]));
  it('keeps the guard order and swaps in the lint and unscripted commands', () => {
    const jobs = guardJobs({ steps: GUARD_STEPS, base: 'abc', lint: ['src/a.ts'], scripts });
    expect(jobs.map((j) => j.name ?? j)).toEqual(GUARD_STEPS);
    const byName = Object.fromEntries(jobs.map((j) => [j.name, j.command]));
    expect(byName['lint:landmines']).toBe(`oxlint --no-error-on-unmatched-pattern -- 'src/a.ts'`);
    expect(byName['check-orphaned-selectors']).toBe('node scripts/check-orphaned-selectors.mjs --base abc');
    expect(byName['check-class-resolution']).toBe('node scripts/check-class-resolution.js');
    expect(byName['test:module-boundaries']).toBe('echo test:module-boundaries');
  });

  it('leaves --base off when there is none', () => {
    const jobs = guardJobs({ steps: ['check-orphaned-selectors'], base: null, lint: null, scripts });
    expect(jobs[0].command).toBe('node scripts/check-orphaned-selectors.mjs');
  });
});

describe('the end of a piped run', () => {
  it('delivers the last line after 2 MB of guard output, with the exit code kept', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cf-pipe-'));
    const here = (f) => fileURLToPath(new URL(f, import.meta.url));
    const file = join(dir, 'pipe.mjs');
    writeFileSync(
      file,
      `import { runGuards } from ${JSON.stringify(here('./run-guards.mjs'))};
import { exitWithMain } from ${JSON.stringify(here('./check-fast.mjs'))};
await exitWithMain(async () => {
  const failed = await runGuards([{ name: 'big', command: "node -e 'process.stdout.write(\\"x\\".repeat(2e6)); process.exitCode=1'" }]);
  console.log('check:fast FAIL at ' + failed.join(','));
  return 1;
}, []);
`,
    );
    const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    const code = await new Promise((done) => child.on('close', done));
    rmSync(dir, { recursive: true, force: true });
    expect(out.length).toBeGreaterThan(2e6);
    expect(out.trimEnd().endsWith('check:fast FAIL at big')).toBe(true);
    expect(code).toBe(1);
  });
});
