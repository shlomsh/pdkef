import { describe, expect, it } from 'vitest';
import { UPDATE_COST_TARGET, summarize, updateCost } from './updateCost.mjs';

const build = (entries) => new Map(Object.entries(entries));
const SW = { '/sw.js': { hash: 'sw1', bytes: 3000 }, '/precache-manifest.json': { hash: 'm1', bytes: 2000 } };

describe('updateCost', () => {
  it('charges identical builds only for sw.js and the manifest', () => {
    const b = build({ ...SW, '/_astro/a.js': { hash: 'a', bytes: 9000 }, '/sign/': { hash: 'p', bytes: 4000 } });
    const r = updateCost(b, b);
    expect(r.total).toBe(5000);
    expect(r.items.map((i) => [i.url, i.reason]).sort()).toEqual([
      ['/precache-manifest.json', 'always'],
      ['/sw.js', 'always'],
    ]);
  });

  it('charges a renamed chunk plus the pages that reference it', () => {
    const before = build({ ...SW, '/_astro/a.abc.js': { hash: 'x', bytes: 9000 }, '/sign/': { hash: 'p1', bytes: 4000 }, '/merge/': { hash: 'q', bytes: 3000 } });
    const after = build({ ...SW, '/_astro/a.def.js': { hash: 'y', bytes: 9100 }, '/sign/': { hash: 'p2', bytes: 4010 }, '/merge/': { hash: 'q', bytes: 3000 } });
    const r = updateCost(before, after);
    expect(r.total).toBe(5000 + 9100 + 4010);
    expect(r.items[0]).toEqual({ url: '/_astro/a.def.js', bytes: 9100, reason: 'new-hashed' });
    expect(r.items.find((i) => i.url === '/sign/').reason).toBe('changed');
    expect(r.items.some((i) => i.url === '/merge/')).toBe(false);
  });

  it('charges a page changed only in bytes', () => {
    const before = build({ ...SW, '/sign/': { hash: 'p1', bytes: 4000 } });
    const after = build({ ...SW, '/sign/': { hash: 'p2', bytes: 4001 } });
    expect(updateCost(before, after).total).toBe(5000 + 4001);
  });

  it('charges a hashed URL present in both nothing, even if the hash differs', () => {
    const before = build({ ...SW, '/_astro/a.js': { hash: 'x', bytes: 9000 } });
    const after = build({ ...SW, '/_astro/a.js': { hash: 'y', bytes: 9000 } });
    expect(updateCost(before, after).total).toBe(5000);
  });

  it('charges a non-hashed URL absent from before as changed', () => {
    const r = updateCost(build({ ...SW }), build({ ...SW, '/new/': { hash: 'n', bytes: 700 } }));
    expect(r.items.find((i) => i.url === '/new/')).toEqual({ url: '/new/', bytes: 700, reason: 'changed' });
  });
});

describe('summarize', () => {
  it('reports total vs target, top contributors and the cascade', () => {
    const before = build({ ...SW });
    const after = build({ ...SW, '/_astro/n.js': { hash: 'n', bytes: 800 }, '/a/': { hash: 'a', bytes: 100 }, '/b/': { hash: 'b', bytes: 50 } });
    const text = summarize(updateCost(before, after), 1000).join('\n');
    expect(text).toContain('Update cost: 5,950 bytes');
    expect(text).toContain('target 1,000');
    expect(text).toContain('/_astro/n.js');
    expect(text).toContain('2 pages changed alongside 1 new hashed chunk');
  });

  it('exports the target', () => {
    expect(UPDATE_COST_TARGET).toBe(500_000);
  });
});
