// QUAL-42: unit tests for the e2e shard-count helper (pure parts only).
import { describe, expect, it } from 'vitest';
import { countSpecFiles, shardsFor } from './e2e-shard-count.mjs';

describe('shardsFor', () => {
  it.each([
    [0, [1]],
    [1, [1]],
    [8, [1]],
    [9, [1, 2]],
    [16, [1, 2]],
    [17, [1, 2, 3]],
    [24, [1, 2, 3]],
    [25, [1, 2, 3, 4]],
    [200, [1, 2, 3, 4]],
  ])('%i spec files -> %j', (n, expected) => {
    expect(shardsFor(n)).toEqual(expected);
  });

  it('honours max and perShard overrides', () => {
    expect(shardsFor(100, { max: 2 })).toEqual([1, 2]);
    expect(shardsFor(5, { perShard: 2 })).toEqual([1, 2, 3]);
  });
});

describe('countSpecFiles', () => {
  const report = {
    suites: [
      {
        title: 'a.spec.js',
        file: 'a.spec.js',
        specs: [
          { title: 't1', file: 'a.spec.js' },
          { title: 't2', file: 'a.spec.js' },
          { title: 't3', file: 'a.spec.js' },
        ],
        suites: [{ title: 'inner', file: 'a.spec.js', specs: [{ title: 't4', file: 'a.spec.js' }] }],
      },
      {
        title: 'b.spec.js',
        file: 'b.spec.js',
        suites: [
          { title: 'x', file: 'b.spec.js', suites: [{ title: 'y', file: 'b.spec.js', specs: [{ file: 'b.spec.js' }] }] },
        ],
      },
    ],
  };

  it('counts distinct files across nested suites', () => {
    expect(countSpecFiles(report)).toBe(2);
    expect(countSpecFiles(JSON.stringify(report))).toBe(2);
  });

  it('returns 0 for an empty report', () => {
    expect(countSpecFiles({ suites: [] })).toBe(0);
  });

  it('returns null for malformed input so the CLI fails open', () => {
    expect(countSpecFiles('not json {')).toBeNull();
    expect(countSpecFiles({})).toBeNull();
    expect(countSpecFiles(null)).toBeNull();
  });
});
