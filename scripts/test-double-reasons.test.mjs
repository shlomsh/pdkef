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

  it('finds none in the repository', () => {
    expect(repoReasonProblems(fileURLToPath(new URL('..', import.meta.url)))).toEqual([]);
  });
});
