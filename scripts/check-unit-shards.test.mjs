import { describe, expect, it } from 'vitest';
import { compareShards } from './check-unit-shards.mjs';

// QUAL-39: the pure core of the unit-shard guard.
describe('compareShards', () => {
  const full = ['a.test.ts', 'b.test.ts', 'c.test.ts', 'd.test.ts'];

  it('passes when the shards cover every file exactly once', () => {
    const r = compareShards(full, [['a.test.ts', 'c.test.ts'], ['b.test.ts', 'd.test.ts']]);
    expect(r).toEqual({ ok: true, missing: [], extra: [], duplicated: [], empty: [] });
  });

  it('reports a file no shard runs', () => {
    const r = compareShards(full, [['a.test.ts'], ['b.test.ts', 'd.test.ts']]);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['c.test.ts']);
  });

  it('reports a file that is not in the full suite', () => {
    const r = compareShards(full, [['a.test.ts', 'c.test.ts', 'z.test.ts'], ['b.test.ts', 'd.test.ts']]);
    expect(r.ok).toBe(false);
    expect(r.extra).toEqual(['z.test.ts']);
  });

  it('reports a file two shards both run', () => {
    const r = compareShards(full, [['a.test.ts', 'b.test.ts', 'c.test.ts'], ['b.test.ts', 'd.test.ts']]);
    expect(r.ok).toBe(false);
    expect(r.duplicated).toEqual(['b.test.ts']);
  });

  it('reports an empty shard by its 1-based index', () => {
    const r = compareShards(full, [full, []]);
    expect(r.ok).toBe(false);
    expect(r.empty).toEqual([2]);
  });
});
