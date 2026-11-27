import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { reasonProblems, repoReasonProblems } from './test-double-reasons.mjs';

const ok = '  // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom has no camera to refuse a photo';

describe('test double reasons', () => {
  it('passes a per-line disable that gives its reason', () => {
    expect(reasonProblems('a.test.ts', `${ok}\n  vi.fn();`)).toEqual([]);
  });

  it('names a disable wider than one line, and one with no reason', () => {
    expect(reasonProblems('a.test.ts', [
      '/* oxlint-disable landmines/no-test-doubles */',
      '// oxlint-disable-next-line landmines/no-test-doubles',
      '// oxlint-disable-next-line landmines/no-test-doubles -- Forced: x',
      '// eslint-disable-next-line landmines/no-test-doubles -- Forced: jsdom has no camera here',
    ].join('\n'))).toEqual([
      'a.test.ts:1: disable the rule on one line, with oxlint-disable-next-line',
      'a.test.ts:2: give the reason as "-- Forced: <why nothing real can do it here>"',
      'a.test.ts:3: give the reason as "-- Forced: <why nothing real can do it here>"',
      'a.test.ts:4: give the reason as "-- Forced: <why nothing real can do it here>"',
    ]);
  });

  it('holds the LAND-07 rules to one line with a reason too', () => {
    expect(reasonProblems('a.ts', [
      '// oxlint-disable-next-line landmines/no-silent-catch -- best-effort cleanup, the preview is gone either way',
      '// oxlint-disable-next-line landmines/no-elapsed-time-bound -- mobile-cost budget, runs alone in PERF_BUDGETS',
      '/* oxlint-disable landmines/no-parameter-branch */',
      '// oxlint-disable-next-line landmines/no-silent-catch',
      '// oxlint-disable-next-line landmines/no-elapsed-time-bound -- slow',
    ].join('\n'))).toEqual([
      'a.ts:3: disable the rule on one line, with oxlint-disable-next-line',
      'a.ts:4: give the reason as "-- <why losing it is fine>"',
      'a.ts:5: give the reason as "-- <why the bound is deliberate>"',
    ]);
  });

  it('holds no-conditional-expect (LAND-08) to one line with a reason', () => {
    expect(reasonProblems('a.spec.js', [
      '// oxlint-disable-next-line landmines/no-conditional-expect -- only the webkit project taps; chromium hovers, and CI runs both',
      '/* oxlint-disable landmines/no-conditional-expect */',
      '// oxlint-disable-next-line landmines/no-conditional-expect',
    ].join('\n'))).toEqual([
      'a.spec.js:2: disable the rule on one line, with oxlint-disable-next-line',
      'a.spec.js:3: give the reason as "-- <why the branch is the point, and what makes both sides run>"',
    ]);
  });

  it('finds none in the repository', () => {
    expect(repoReasonProblems(fileURLToPath(new URL('..', import.meta.url)))).toEqual([]);
  });
});
