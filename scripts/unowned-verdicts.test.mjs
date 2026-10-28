import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { unownedVerdictOf, filesForNx, ciChangeTouchesJob, parseHunks, packageJsonReachesE2e } from './unowned-verdicts.mjs';

describe('UNOWNED_VERDICTS (QUAL-34)', () => {
  it('unownedVerdictOf returns null for files outside the table', () => {
    expect(unownedVerdictOf('package.json')).toBeNull();
    expect(unownedVerdictOf('middleware.ts').e2e).toBe('none');
  });

  it('workflow files other than ci.yml run no e2e; ci.yml keeps all', () => {
    expect(unownedVerdictOf('.github/workflows/dependency-advisories.yml')).toEqual({ e2e: 'none' });
    expect(unownedVerdictOf('.github/workflows/new-thing.yaml')).toEqual({ e2e: 'none' });
    expect(unownedVerdictOf('.github/workflows/ci.yml')).toEqual({ e2e: 'all' });
  });

  it('filesForNx drops table files and keeps the rest', () => {
    expect(filesForNx(['middleware.ts', 'vercel.json', 'src/lib/a.ts', 'package.json', 'public/sw.js'])).toEqual(['src/lib/a.ts', 'package.json']);
  });

  it('filesForNx also drops a package.json whose edit stays off the e2e path (Nx marks every project affected by it)', () => {
    expect(filesForNx(['src/lib/a.ts', 'package.json'], { packageJsonOffPath: true })).toEqual(['src/lib/a.ts']);
    expect(filesForNx(['src/lib/a.ts', 'package.json'], { packageJsonOffPath: false })).toEqual(['src/lib/a.ts', 'package.json']);
  });
});

describe('ciChangeTouchesJob (QUAL-34)', () => {
  const ci = [
    'name: CI', // 1
    'on:', // 2
    '  push:', // 3
    'jobs:', // 4
    '  units:', // 5
    '    runs-on: x', // 6
    '    steps:', // 7
    '      - run: a', // 8
    '  font-guards:', // 9
    '    runs-on: x', // 10
    '    steps:', // 11
    '      - run: b', // 12
    '  build:', // 13
    '    runs-on: x', // 14
  ].join('\n');

  it('a hunk inside font-guards touches it', () => {
    expect(ciChangeTouchesJob(ci, [{ start: 12, count: 1 }], 'font-guards')).toBe(true);
  });
  it('a job missing from the file (renamed or deleted) counts as touched, so the font guards run', () => {
    expect(ciChangeTouchesJob(ci, [{ start: 8, count: 1 }], 'font-guards-renamed')).toBe(true);
  });
  it('a hunk inside units does not', () => {
    expect(ciChangeTouchesJob(ci, [{ start: 8, count: 1 }], 'font-guards')).toBe(false);
  });
  it('a hunk on a top-level line touches', () => {
    expect(ciChangeTouchesJob(ci, [{ start: 2, count: 1 }], 'font-guards')).toBe(true);
  });
  it('the jobs: line itself touches', () => {
    expect(ciChangeTouchesJob(ci, [{ start: 4, count: 1 }], 'font-guards')).toBe(true);
  });
  it('a pure deletion inside units does not', () => {
    expect(ciChangeTouchesJob(ci, [{ start: 7, count: 0 }], 'font-guards')).toBe(false);
  });
  it('a pure deletion at the end of units touches the next job header', () => {
    expect(ciChangeTouchesJob(ci, [{ start: 8, count: 0 }], 'font-guards')).toBe(true);
  });
  it('the last job runs to EOF', () => {
    expect(ciChangeTouchesJob(ci, [{ start: 14, count: 1 }], 'build')).toBe(true);
    expect(ciChangeTouchesJob(ci, [{ start: 14, count: 1 }], 'font-guards')).toBe(false);
  });

  it('parseHunks reads new-side ranges, count defaulting to 1', () => {
    const diff = ['diff --git a/x b/x', '@@ -3,2 +3,4 @@ foo', '+a', '@@ -10 +12 @@', '+b', '@@ -20,2 +22,0 @@', '-c'].join('\n');
    expect(parseHunks(diff)).toEqual([{ start: 3, count: 4 }, { start: 12, count: 1 }, { start: 22, count: 0 }]);
  });
});

describe('packageJsonReachesE2e (QUAL-43)', () => {
  const base = {
    name: 'x',
    imports: { '#a': './a.js' },
    dependencies: { a: '1.0.0' },
    scripts: {
      build: 'node scripts/gen.mjs && npm run -s compile',
      compile: 'astro build',
      preview: 'astro preview',
      'test:e2e': 'npm run build && node scripts/run.mjs',
      'test:e2e:fonts': 'playwright test --project=fonts',
      'test:guard': 'node scripts/guard.mjs',
    },
  };
  const edit = (fn) => { const next = JSON.parse(JSON.stringify(base)); fn(next); return JSON.stringify(next); };
  const reaches = (after, before = JSON.stringify(base)) => packageJsonReachesE2e(before, after);

  it('an unchanged or off-path scripts edit does not reach e2e', () => {
    expect(reaches(JSON.stringify(base))).toBe(false);
    expect(reaches(edit((p) => { p.scripts['test:new-guard'] = 'node scripts/new.mjs'; }))).toBe(false);
    expect(reaches(edit((p) => { p.scripts['test:guard'] = 'node scripts/other.mjs'; }))).toBe(false);
    expect(reaches(edit((p) => { delete p.scripts['test:guard']; }))).toBe(false);
  });

  it.each([
    ['a changed build', (p) => { p.scripts.build += ' && true'; }],
    ['a changed script build calls via npm run', (p) => { p.scripts.compile = 'astro build --verbose'; }],
    ['a changed preview', (p) => { p.scripts.preview = 'astro preview --port 1'; }],
    ['a changed test:e2e:fonts', (p) => { p.scripts['test:e2e:fonts'] = 'playwright test'; }],
    ['a new test:e2e script', (p) => { p.scripts['test:e2e:new'] = 'playwright test'; }],
    ['a new prebuild hook', (p) => { p.scripts.prebuild = 'node x.mjs'; }],
    ['a new dependency', (p) => { p.dependencies.b = '2.0.0'; }],
    ['changed imports', (p) => { p.imports['#a'] = './b.js'; }],
  ])('%s reaches e2e', (_, fn) => {
    expect(reaches(edit(fn))).toBe(true);
  });

  it('a script called only by a newly added path script is followed on the after side', () => {
    expect(reaches(edit((p) => { p.scripts['test:e2e:new'] = 'npm run test:guard'; p.scripts['test:guard'] = 'x'; }))).toBe(true);
  });

  it('unparseable text on either side reaches e2e', () => {
    expect(reaches('{not json')).toBe(true);
    expect(packageJsonReachesE2e('', JSON.stringify(base))).toBe(true);
  });

  it('reads the real package.json: test:e2e, build and preview are on the path', () => {
    const real = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    for (const name of ['test:e2e', 'build', 'preview']) {
      const after = JSON.stringify({ ...real, scripts: { ...real.scripts, [name]: `${real.scripts[name]} && true` } });
      expect(packageJsonReachesE2e(JSON.stringify(real), after), name).toBe(true);
    }
    const guard = JSON.stringify({ ...real, scripts: { ...real.scripts, 'test:zz-new-guard': 'node x.mjs' } });
    expect(packageJsonReachesE2e(JSON.stringify(real), guard)).toBe(false);
  });
});
