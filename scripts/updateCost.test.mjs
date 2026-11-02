import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { explainPages, readInstallSet } from './measure-update-cost.mjs';
import { UPDATE_COST_TARGET, explainChanged, firstDifference, summarize, updateCost } from './updateCost.mjs';

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

describe('summarize cascade detail', () => {
  it('counts only pages and lists the new hashed chunks', () => {
    const before = build({ ...SW, '/fonts/f.woff2': { hash: 'f1', bytes: 100 } });
    const after = build({
      ...SW,
      '/fonts/f.woff2': { hash: 'f2', bytes: 100 },
      '/_astro/n.abc.js': { hash: 'n', bytes: 800 },
      '/a/': { hash: 'a', bytes: 100 },
    });
    const text = summarize(updateCost(before, after), 1000).join('\n');
    expect(text).toContain('1 page changed alongside 1 new hashed chunk');
    expect(text).toMatch(/New chunks:[\s\S]*\/_astro\/n\.abc\.js/);
  });

  it('lists at most 10 new chunks', () => {
    const entries = {};
    for (let i = 0; i < 12; i++) entries[`/_astro/c${i}.js`] = { hash: `h${i}`, bytes: 10 };
    const text = summarize(updateCost(build({ ...SW }), build({ ...SW, ...entries })), 1e9).join('\n');
    const tail = text.slice(text.indexOf('New chunks:'));
    expect(tail.match(/\/_astro\/c\d+\.js/g)).toHaveLength(10);
  });
});

describe('firstDifference', () => {
  it('is null for equal strings', () => {
    expect(firstDifference('abc', 'abc')).toBeNull();
  });

  it('clips the context at both ends of a mid-string difference', () => {
    const pre = 'a'.repeat(100);
    const post = 'z'.repeat(100);
    const d = firstDifference(`${pre}X${post}`, `${pre}Y${post}`, 5);
    expect(d).toEqual({ index: 100, before: 'aaaaaXzzzzz', after: 'aaaaaYzzzzz' });
  });

  it('keeps short strings whole and shows newlines as a glyph', () => {
    const d = firstDifference('a\nb', 'a\nc');
    expect(d).toEqual({ index: 2, before: 'a⏎b', after: 'a⏎c' });
  });

  it('handles one string being a prefix of the other', () => {
    expect(firstDifference('ab', 'abcd')).toEqual({ index: 2, before: 'ab', after: 'abcd' });
  });
});

describe('explainChanged', () => {
  it('groups pages by their first difference, biggest group first', () => {
    const groups = explainChanged([
      { url: '/a/', before: '<p>x</p>', after: '<p>y</p>' },
      { url: '/b/', before: '<q>1</q><p>x</p>', after: '<q>1</q><p>y</p>' },
      { url: '/c/', before: 'one', after: 'two' },
      { url: '/d/', before: 'same', after: 'same' },
    ]);
    expect(groups.map((g) => [g.count, g.urls])).toEqual([[1, ['/a/']], [1, ['/b/']], [1, ['/c/']]]);
    const wide = explainChanged([
      { url: '/a/', before: '<script src="/_astro/a.1.js">', after: '<script src="/_astro/a.2.js">' },
      { url: '/b/', before: '<script src="/_astro/a.1.js">', after: '<script src="/_astro/a.2.js">' },
      { url: '/c/', before: 'one', after: 'two' },
    ]);
    expect(wide).toHaveLength(2);
    expect(wide[0].count).toBe(2);
    expect(wide[0].urls).toEqual(['/a/', '/b/']);
    expect(wide[0].sample.before).toContain('a.1.js');
    expect(wide[0].sample.after).toContain('a.2.js');
    expect(wide[1].count).toBe(1);
  });
});

describe('summarize what changed', () => {
  const result = updateCost(build({ ...SW }), build({ ...SW, '/a/': { hash: 'a', bytes: 100 } }));

  it('adds no section without an explanation', () => {
    expect(summarize(result, 1000).join('\n')).not.toContain('What changed in pages:');
  });

  it('prints at most 3 groups with at most 3 urls each', () => {
    const explanation = Array.from({ length: 4 }, (_, i) => ({
      count: 10 - i,
      urls: ['/p1/', '/p2/', '/p3/', '/p4/'],
      sample: { before: `old${i}`, after: `new${i}` },
    }));
    const lines = summarize(result, 1000, explanation);
    const text = lines.join('\n');
    expect(text).toContain('What changed in pages:');
    expect(text).toContain('  10 pages: before «old0» after «new0»');
    expect(text).toContain('/p1/');
    expect(text).not.toContain('/p4/');
    expect(text).toContain('new2');
    expect(text).not.toContain('new3');
  });
});

describe('readInstallSet', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'updatecost-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const put = (rel, data) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), data);
  };
  const png = Buffer.from(Array.from({ length: 300 }, (_, i) => i % 251));
  const chunk = 'export const x = 1;\n'.repeat(200);
  put('index.html', '<h1>home</h1>'.repeat(50));
  put('sign/index.html', '<h1>sign</h1>'.repeat(50));
  put('_astro/a.abc123.js', chunk);
  put('img/p.png', png);
  put('sw.js', '// sw');
  put('precache-manifest.json', JSON.stringify({
    version: 2,
    shell: ['/', '/_astro/a.abc123.js'],
    pages: { '/': ['/', '/_astro/a.abc123.js'], '/sign/': ['/sign/', '/_astro/a.abc123.js', '/img/p.png'] },
  }));
  const set = readInstallSet(dir);

  it('is the manifest union plus sw.js and the manifest, each URL once', () => {
    expect([...set.keys()].sort()).toEqual(['/', '/_astro/a.abc123.js', '/img/p.png', '/precache-manifest.json', '/sign/', '/sw.js']);
  });

  it('sizes text by brotli and a png raw', () => {
    expect(set.get('/img/p.png').bytes).toBe(png.length);
    const brotli = zlib.brotliCompressSync(Buffer.from(chunk)).length;
    expect(set.get('/_astro/a.abc123.js').bytes).toBeLessThan(chunk.length);
    expect(Math.abs(set.get('/_astro/a.abc123.js').bytes - brotli)).toBeLessThan(40);
  });

  it('reads a v1 manifest', () => {
    put('precache-manifest.json', JSON.stringify({ urls: ['/', '/img/p.png'] }));
    expect([...readInstallSet(dir).keys()].sort()).toEqual(['/', '/img/p.png', '/precache-manifest.json', '/sw.js']);
  });

  it('fails clearly on a missing dist, manifest or empty set', () => {
    expect(() => readInstallSet(path.join(dir, 'nope'))).toThrow(/does not exist/);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'updatecost-e-'));
    expect(() => readInstallSet(empty)).toThrow(/precache-manifest\.json/);
    fs.writeFileSync(path.join(empty, 'precache-manifest.json'), JSON.stringify({ version: 2, shell: [], pages: {} }));
    expect(() => readInstallSet(empty)).toThrow(/empty/);
    fs.rmSync(empty, { recursive: true, force: true });
  });
});

describe('explainPages', () => {
  const dirs = [];
  afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
  const dist = (files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'explain-'));
    dirs.push(dir);
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
    return dir;
  };

  it('skips a page that is new in this build instead of failing on it', () => {
    const before = dist({ 'a/index.html': '<p>one</p>' });
    const after = dist({ 'a/index.html': '<p>two</p>', 'new/index.html': '<p>fresh</p>' });
    const items = [{ url: '/a/', reason: 'changed' }, { url: '/new/', reason: 'changed' }];
    const groups = explainPages({ items }, before, after);
    expect(groups).toHaveLength(1);
    expect(groups[0].urls).toEqual(['/a/']);
  });
});
