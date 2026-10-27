import { describe, expect, it } from 'vitest';
import { closureBytes, findBudgetFailures, findForeignIslands, checkPrecache, findMissingFiles, findUnhandledAssets, installUrls } from './check-precache-budget.mjs';

const sizes = { '/a.js': 600, '/b.js': 500, '/PdfAlpha.1.js': 300, '/PdfBeta.2.js': 400, '/shell.js': 100 };
const budgets = { shell: 1000, tool: 1000, home: 1000, other: 1000, install: 5000 };

describe('closureBytes', () => {
  it('sums the sizes of the listed files, counting a repeat once', () => {
    expect(closureBytes(['/a.js', '/b.js', '/a.js'], sizes)).toBe(1100);
  });
});

describe('findBudgetFailures', () => {
  it('names the page and its bytes when a closure is over budget', () => {
    const f = findBudgetFailures({ shell: ['/shell.js'], pages: { '/x/': ['/a.js', '/b.js'] }, toolPages: new Set(['/x/']), sizes, budgets });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('/x/');
    expect(f[0]).toContain('1100');
  });
  it('holds the shell to its own budget', () => {
    const f = findBudgetFailures({ shell: ['/a.js'], pages: {}, toolPages: new Set(), sizes, budgets: { ...budgets, shell: 500 } });
    expect(f[0]).toContain('shell');
    expect(f[0]).toContain('600');
  });
});

describe('findForeignIslands', () => {
  const islands = { '/alpha/': ['/PdfAlpha.1.js'], '/beta/': ['/PdfBeta.2.js'] };
  it('names both pages and the asset when a closure carries another page island', () => {
    const f = findForeignIslands({ pages: { '/alpha/': ['/alpha/', '/PdfAlpha.1.js', '/PdfBeta.2.js'], '/beta/': ['/PdfBeta.2.js'] }, islands, sizes });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('/alpha/');
    expect(f[0]).toContain('/beta/');
    expect(f[0]).toContain('/PdfBeta.2.js');
    expect(f[0]).toContain('400');
  });
  it('lets pages that share an island share its chunk', () => {
    const f = findForeignIslands({ pages: { '/alpha/': ['/PdfAlpha.1.js'], '/he/alpha/': ['/PdfAlpha.1.js'] }, islands: { '/alpha/': ['/PdfAlpha.1.js'], '/he/alpha/': ['/PdfAlpha.1.js'] }, sizes });
    expect(f).toEqual([]);
  });
});

describe('checkPrecache', () => {
  it('passes a clean fixture', () => {
    const r = checkPrecache({ shell: ['/shell.js'], pages: { '/alpha/': ['/PdfAlpha.1.js'], '/beta/': ['/PdfBeta.2.js'] }, islands: { '/alpha/': ['/PdfAlpha.1.js'], '/beta/': ['/PdfBeta.2.js'] }, sizes, budgets });
    expect(r).toEqual([]);
  });
});

describe('findMissingFiles', () => {
  it('names the page and the URL when a closure lists a file dist/ does not hold', () => {
    const f = findMissingFiles({ shell: ['/shell.js'], pages: { '/x/': ['/a.js', '/gone.webp'] }, sizes });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('/x/');
    expect(f[0]).toContain('/gone.webp');
  });
  it('names the shell for a missing shell file and passes a complete fixture', () => {
    expect(findMissingFiles({ shell: ['/nope.js'], pages: {}, sizes })[0]).toContain('shell');
    expect(findMissingFiles({ shell: ['/shell.js'], pages: { '/x/': ['/a.js'] }, sizes })).toEqual([]);
  });
});

describe('findUnhandledAssets', () => {
  it('names a dist/_astro file whose extension the closure walker does not handle', () => {
    const f = findUnhandledAssets(['_astro/a.js', '_astro/b.mjs', '_astro/c.css', '_astro/d.wasm', '_astro/e.webp', '_astro/f.svg', '_astro/g.woff2']);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('_astro/g.woff2');
  });
});

describe('installUrls', () => {
  it('is the shell plus every page list, each URL once', () => {
    expect(installUrls({ shell: ['/shell.js', '/a.js'], pages: { '/x/': ['/a.js', '/b.js'], '/y/': ['/b.js', '/PdfAlpha.1.js'] } }).sort())
      .toEqual(['/PdfAlpha.1.js', '/a.js', '/b.js', '/shell.js']);
  });
});

describe('install budget', () => {
  it('names the total bytes and the budget when the whole install is over', () => {
    const f = checkPrecache({ shell: ['/shell.js'], pages: { '/x/': ['/a.js'], '/y/': ['/b.js'] }, islands: {}, sizes, budgets: { ...budgets, install: 1100 } });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('install');
    expect(f[0]).toContain('1200');
    expect(f[0]).toContain('1100');
  });
  it('passes when the union fits', () => {
    expect(checkPrecache({ shell: ['/a.js'], pages: { '/x/': ['/a.js'], '/y/': ['/a.js'] }, islands: {}, sizes, budgets })).toEqual([]);
  });
});

describe('home budget', () => {
  it('holds / and a localized home to home, and any other page to other', () => {
    const b = { ...budgets, home: 1500, other: 500 };
    const pages = { '/': ['/a.js', '/b.js'], '/he/': ['/a.js', '/b.js'], '/article/': ['/a.js'] };
    const f = findBudgetFailures({ shell: [], pages, toolPages: new Set(), sizes, budgets: b });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('/article/');
  });
});
