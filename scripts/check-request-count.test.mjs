import { describe, expect, it } from 'vitest';
import { pageRefs, pageSet, installSet, countRequests, overBudget } from './check-request-count.mjs';

const view = (files) => ({ files: new Map(Object.entries(files)), paths: Object.keys(files) });

const HTML = `<!doctype html><link rel="stylesheet" href="/_astro/a.css">
<link rel="icon" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple.png">
<link rel="manifest" href="/manifest.webmanifest"><link rel="canonical" href="/sign/">
<link rel="stylesheet" href="https://fonts.example.com/x.css">
<script type="module" src="/site/entry.js"></script><script type="module" src="https://cdn.example.com/y.js"></script>`;

describe('pageRefs', () => {
  it('lists same-origin scripts, stylesheets and icon links, and ignores cross-origin and canonical', () => {
    expect(pageRefs(HTML).sort()).toEqual(
      ['/_astro/a.css', '/apple.png', '/favicon.svg', '/manifest.webmanifest', '/site/entry.js'].sort(),
    );
  });
});

describe('pageRefs on islands', () => {
  it('lists the scripts an island loads at hydration', () => {
    const html = '<astro-island uid="a" component-url="/shared/redact.js" renderer-url="/shared/client.js" before-hydration-url="/site/bh.js" client="load"></astro-island>';
    expect(pageRefs(html).sort()).toEqual(['/shared/client.js', '/shared/redact.js', '/site/bh.js']);
  });
});

describe('pageSet', () => {
  const files = {
    'sign/index.html': HTML,
    'site/entry.js': 'import{a}from"../shared/a.js";import("../shared/lazy.js");',
    'shared/a.js': 'import "./b.js";export const a=1;',
    'shared/b.js': 'export const b=1;',
    'shared/lazy.js': 'export const l=1;',
  };

  it('follows static imports but not dynamic import()', () => {
    const set = pageSet('/sign/', view(files), 'sign/index.html');
    expect(set.has('/shared/a.js')).toBe(true);
    expect(set.has('/shared/b.js')).toBe(true);
    expect(set.has('/shared/lazy.js')).toBe(false);
  });

  it('includes the page itself and the worker own requests', () => {
    const set = pageSet('/sign/', view(files), 'sign/index.html');
    expect(set.has('/sign/')).toBe(true);
    expect(set.has('/sw.js')).toBe(true);
    expect(set.has('/precache-manifest.json')).toBe(true);
  });

  it('counts a URL referenced twice once', () => {
    const twice = { ...files, 'sign/index.html': `${HTML}<link rel="modulepreload" href="/site/entry.js">` };
    expect(pageSet('/sign/', view(twice), 'sign/index.html').size).toBe(pageSet('/sign/', view(files), 'sign/index.html').size);
  });
});

describe('pageSet without the page HTML', () => {
  it.each([['missing', {}], ['empty', { 'sign/index.html': '' }]])('throws naming the page and path when the HTML is %s', (_name, files) => {
    expect(() => pageSet('/sign/', view(files), 'sign/index.html')).toThrow('/sign/: no HTML to count at dist/sign/index.html');
  });
});

describe('installSet and countRequests', () => {
  const manifest = { shell: ['/', '/a.js'], pages: { '/': ['/', '/a.js'], '/sign/': ['/sign/', '/a.js', '/s.js'] } };

  it('is the closure of / plus the closure of each open page (MEM-35)', () => {
    const withHome = { pages: { '/': ['/', '/h.css'], '/sign/': ['/sign/', '/s.js'] } };
    expect([...installSet(withHome, ['/sign/'])].sort()).toEqual(['/', '/h.css', '/s.js', '/sign/']);
    expect([...installSet(withHome, [])].sort()).toEqual(['/', '/h.css']);
    expect([...installSet(manifest, ['/sign/'])].sort()).toEqual(['/', '/a.js', '/s.js', '/sign/']);
  });

  it('counts only the install requests the page did not already make (MEM-34)', () => {
    expect(countRequests(new Set(['/', '/x.js']), new Set(['/', '/a.js', '/b.js']))).toEqual({ requests: 2, install: 2, total: 4 });
  });
});

describe('overBudget', () => {
  it('names each page whose total exceeds its budget', () => {
    const rows = [{ page: '/', total: 10 }, { page: '/sign/', total: 12 }];
    expect(overBudget(rows, { '/': 10, '/sign/': 11 })).toEqual(['/sign/: 12 requests, budget 11']);
    expect(overBudget(rows, { '/': 10, '/sign/': 12 })).toEqual([]);
  });
});
