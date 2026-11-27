// CI speed: unit tests for the time-based e2e shard plan (pure parts only).
import { beforeAll, describe, expect, it } from 'vitest';
import { main, specFiles, splitByTime, toFilter, parseShard } from './e2e-shard-plan.mjs';

const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (xs, r) => xs.map((x) => [r(), x]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
const slices = (files, seconds, n) => Array.from({ length: n }, (_, i) => splitByTime(files, seconds, n)[i]);

describe('splitByTime', () => {
  it.each([1, 2, 3, 4])('puts every file in exactly one shard (n=%i)', (n) => {
    const r = rng(n);
    const files = Array.from({ length: 37 }, (_, i) => `e2e/f${i}.spec.js`);
    const seconds = Object.fromEntries(files.filter(() => r() > 0.2).map((f) => [f, r() * 60]));
    const all = slices(files, seconds, n).flat();
    expect(all.sort()).toEqual([...files].sort());
  });

  it('is deterministic whatever the input order', () => {
    const files = Array.from({ length: 20 }, (_, i) => `e2e/f${i}.spec.js`);
    const seconds = Object.fromEntries(files.map((f, i) => [f, (i % 5) + 1]));
    const base = splitByTime(files, seconds, 4);
    expect(splitByTime(shuffle(files, rng(7)), seconds, 4)).toEqual(base);
  });

  it('balances by seconds: the longest file gets a shard alone', () => {
    const s = splitByTime(['a', 'b', 'c', 'd'], { a: 10, b: 3, c: 3, d: 4 }, 2);
    expect(s).toEqual([['a'], ['b', 'c', 'd']]);
  });

  it('gives a file with no recorded time the median of the recorded ones, or 1', () => {
    expect(splitByTime(['a', 'b', 'c', 'x'], { a: 10, b: 2, c: 6 }, 2)).toEqual([['a', 'b'], ['c', 'x']]);
    expect(splitByTime(['a', 'b', 'c'], {}, 3)).toEqual([['a'], ['b'], ['c']]);
  });

  it('ignores a stale weight for a deleted file', () => {
    expect(splitByTime(['a', 'b'], { a: 1, b: 1, gone: 999 }, 2)).toEqual([['a'], ['b']]);
  });

  it('leaves a shard empty when there are fewer files than shards', () => {
    expect(splitByTime(['a'], { a: 5 }, 3)).toEqual([['a'], [], []]);
  });
});

describe('toFilter', () => {
  it('matches exactly one file', () => {
    const re = new RegExp(toFilter('e2e/a.spec.js', '/repo'));
    expect(re.test('/repo/e2e/a.spec.js')).toBe(true);
    expect(re.test('/repo/e2e/aXspec.js')).toBe(false);
    expect(re.test('/repo/src/tools/x/e2e/a.spec.js')).toBe(false);
  });
});

describe('specFiles', () => {
  it('collects distinct sorted files from nested suites, skipping empty ones', () => {
    const report = {
      suites: [
        { file: 'e2e/b.spec.js', specs: [{ file: 'e2e/b.spec.js' }], suites: [{ file: 'e2e/b.spec.js', specs: [{ file: 'e2e/b.spec.js' }] }] },
        { file: 'src/x/e2e/a.spec.js', suites: [{ file: 'src/x/e2e/a.spec.js', specs: [{ file: 'src/x/e2e/a.spec.js' }] }] },
        { file: 'e2e/empty.spec.js', suites: [] },
      ],
    };
    expect(specFiles(report)).toEqual(['e2e/b.spec.js', 'src/x/e2e/a.spec.js']);
  });
});

describe('parseShard', () => {
  it('parses i/n', () => expect(parseShard('2/4')).toEqual({ i: 2, n: 4 }));
  it.each(['0/4', '5/4', '1/0', 'x', '1', '1/2/3', '-1/4', '1.5/4'])('rejects %s', (v) => {
    expect(() => parseShard(v)).toThrow();
  });
});

describe('e2e-shard-plan', () => {
  // main lists the specs through `playwright test --list`, a process start: run it once here.
  const out = [];
  let code;
  beforeAll(() => {
    code = main(['--shard', '1/2', '--paths', 'e2e/export/'], { log: (l) => out.push(String(l)), err: () => {} });
  });
  it('prints an empty shard for paths that hold no chromium spec', () => {
    expect(code).toBe(0);
    expect(out.join('\n').trim()).toBe('');
  });
});
