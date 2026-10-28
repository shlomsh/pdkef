import { describe, expect, it } from 'vitest';
import { pushRanges, renderShare, tallyVerdicts } from './narrowing-share.mjs';

describe('pushRanges', () => {
  it('pairs each run with the next older head and drops the oldest', () => {
    const runs = [{ head_sha: 'c' }, { head_sha: 'b' }, { head_sha: 'a' }];
    expect(pushRanges(runs)).toEqual([{ base: 'b', head: 'c' }, { base: 'a', head: 'b' }]);
  });

  it('collapses re-runs of the same head', () => {
    const runs = [{ head_sha: 'c' }, { head_sha: 'c' }, { head_sha: 'b' }, { head_sha: 'b' }, { head_sha: 'a' }];
    expect(pushRanges(runs)).toEqual([{ base: 'b', head: 'c' }, { base: 'a', head: 'b' }]);
  });

  it('returns nothing for zero or one run', () => {
    expect(pushRanges([])).toEqual([]);
    expect(pushRanges([{ head_sha: 'a' }])).toEqual([]);
  });
});

describe('tallyVerdicts', () => {
  it('counts per kind, the total, and everything reasons', () => {
    const tally = tallyVerdicts([
      { kind: 'docs_only' },
      { kind: 'everything', reason: 'ci.yml changed' },
      { kind: 'everything', reason: 'core project' },
      { kind: 'everything', reason: 'core project' },
      { kind: 'narrowed' },
      { kind: 'unknown' },
    ]);
    expect(tally.total).toBe(6);
    expect(tally.counts).toEqual({ docs_only: 1, narrowed: 1, everything: 3, nothing: 0, unknown: 1 });
    expect(tally.reasons).toEqual({ 'ci.yml changed': 1, 'core project': 2 });
  });
});

describe('renderShare', () => {
  const tally = tallyVerdicts([
    { kind: 'docs_only' },
    { kind: 'everything', reason: 'a' },
    { kind: 'everything', reason: 'b' },
    { kind: 'everything', reason: 'b' },
    { kind: 'narrowed' },
    { kind: 'narrowed' },
    { kind: 'narrowed' },
  ]);
  const md = renderShare(tally, { window: 7 });

  it('has a heading, rounded percents and the replay sentence', () => {
    expect(md).toContain('## ');
    expect(md).toContain('| everything | 3 | 43% |');
    expect(md).toContain('| narrowed | 3 | 43% |');
    expect(md).toContain('| docs_only | 1 | 14% |');
    expect(md).toContain('| nothing | 0 | 0% |');
    expect(md).toContain('today');
  });

  it('lists everything reasons sorted by count', () => {
    expect(md.indexOf('b (2)')).toBeGreaterThan(-1);
    expect(md.indexOf('b (2)')).toBeLessThan(md.indexOf('a (1)'));
  });

  it('does not divide by zero', () => {
    expect(renderShare(tallyVerdicts([]), { window: 0 })).toContain('| narrowed | 0 | 0% |');
  });
});
