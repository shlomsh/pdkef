import { describe, expect, it } from 'vitest';
import { unownedVerdictOf, filesForNx, ciChangeTouchesJob, parseHunks } from './unowned-verdicts.mjs';

describe('UNOWNED_VERDICTS (QUAL-34)', () => {
  it('unownedVerdictOf returns null for files outside the table', () => {
    expect(unownedVerdictOf('package.json')).toBeNull();
    expect(unownedVerdictOf('middleware.ts').e2e).toBe('none');
  });

  it('filesForNx drops table files and keeps the rest', () => {
    expect(filesForNx(['middleware.ts', 'vercel.json', 'src/lib/a.ts', 'package.json', 'public/sw.js'])).toEqual(['src/lib/a.ts', 'package.json']);
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
