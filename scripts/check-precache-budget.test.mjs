import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pageHash } from './pageHash.mjs';
import { describe, expect, it } from 'vitest';
import { KNOWN_ORPHANS, closureBytes, findBudgetFailures, findForeignIslands, checkPrecache, findMissingFiles, findMissingIslands, findOrphanedAssets, findUnhandledAssets, installUrls, manifestIdentityProblems, distFontUrls, repoOnlyProblems } from './check-precache-budget.mjs';

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

describe('findOrphanedAssets', () => {
  const pages = { '/x/': ['/_astro/a.AAAA.js'] };
  it('names a script, style or wasm file in dist/_astro that no list of the install carries', () => {
    const f = findOrphanedAssets({ astroFiles: ['_astro/a.AAAA.js', '_astro/lost.BBBB.js', '_astro/lost.CCCC.css', '_astro/lost.DDDD.wasm', '_astro/lost.EEEE.mjs', '_astro/pic.FFFF.webp'], shell: [], pages });
    expect(f).toHaveLength(4);
    expect(f[0]).toContain('_astro/lost.BBBB.js');
    expect(f.join('\n')).not.toContain('pic.FFFF.webp');
  });
  it('counts the shell as part of the install', () => {
    expect(findOrphanedAssets({ astroFiles: ['_astro/a.AAAA.js'], shell: ['/_astro/a.AAAA.js'], pages: {} })).toEqual([]);
  });
  it('lets a known orphan through by name stem, whatever its hash, and says why in the allowlist', () => {
    expect(findOrphanedAssets({ astroFiles: ['_astro/PageWorkspace.NEWHASH.css'], shell: [], pages })).toEqual([]);
    expect(findOrphanedAssets({ astroFiles: ['_astro/PageWorkspace.NEWHASH.js'], shell: [], pages })).toHaveLength(1);
    for (const reason of Object.values(KNOWN_ORPHANS)) expect(reason.length).toBeGreaterThan(10);
  });
});

describe('findMissingIslands', () => {
  it('names a tool page whose closure lacks its own island entry chunk', () => {
    const f = findMissingIslands({ pages: { '/alpha/': ['/alpha/', '/a.js'], '/beta/': ['/PdfBeta.2.js'] }, islands: { '/alpha/': ['/PdfAlpha.1.js'], '/beta/': ['/PdfBeta.2.js'] } });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('/alpha/');
    expect(f[0]).toContain('/PdfAlpha.1.js');
  });
  it('ignores pages with no tool island', () => {
    expect(findMissingIslands({ pages: { '/article/': [] }, islands: { '/article/': [] } })).toEqual([]);
  });
});

describe('checkPrecache coverage', () => {
  it('runs both coverage rules', () => {
    const r = checkPrecache({ shell: [], pages: { '/alpha/': ['/a.js'] }, islands: { '/alpha/': ['/PdfAlpha.1.js'] }, sizes, budgets, astroFiles: ['_astro/orphan.AAAA.js'] });
    expect(r.some((m) => m.includes('_astro/orphan.AAAA.js'))).toBe(true);
    expect(r.some((m) => m.includes('/PdfAlpha.1.js'))).toBe(true);
  });
});

describe('manifestIdentityProblems (MEM-22)', () => {
  const bytes = { '/a/': '<html>a</html>', '/b/': '<html>b</html>', '/icons/i.png': 'png' };
  const readPage = (url) => bytes[url];
  const workerSource = 'const b=`0123456789ab`;const c=`pdkef-c3-0123456789ab`;';
  const clean = {
    build: '0123456789ab',
    shell: ['/icons/i.png', '/_astro/x.js'],
    pages: { '/a/': ['/a/', '/_astro/y.js'], '/b/': ['/b/', '/icons/i.png'] },
    hashes: { '/a/': pageHash(bytes['/a/']), '/b/': pageHash(bytes['/b/']), '/icons/i.png': pageHash(bytes['/icons/i.png']) },
  };
  it('passes a manifest whose build is in the worker and whose hashes match', () => {
    expect(manifestIdentityProblems(clean, { readPage, workerSource })).toEqual([]);
  });
  it('wants the build id twice in the worker, as BUILD_ID and as CACHE_VERSION', () => {
    const f = manifestIdentityProblems(clean, { readPage, workerSource: 'const BUILD_ID=`0123456789ab`;' });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('twice');
  });
  it('names a missing build', () => {
    const { build, ...rest } = clean;
    expect(manifestIdentityProblems(rest, { readPage, workerSource })[0]).toContain('build');
  });
  it('names a build the worker does not carry', () => {
    expect(manifestIdentityProblems({ ...clean, build: 'ffffffffffff' }, { readPage, workerSource })[0]).toContain('ffffffffffff');
  });
  it('names a page missing from hashes', () => {
    const { '/b/': _b, ...hashes } = clean.hashes;
    expect(manifestIdentityProblems({ ...clean, hashes }, { readPage, workerSource }).join('\n')).toContain('/b/');
  });
  it('names a non-page unhashed URL missing from hashes', () => {
    const { '/icons/i.png': _i, ...hashes } = clean.hashes;
    expect(manifestIdentityProblems({ ...clean, hashes }, { readPage, workerSource }).join('\n')).toContain('/icons/i.png');
  });
  it('names a /_astro/ URL listed in hashes', () => {
    const f = manifestIdentityProblems({ ...clean, hashes: { ...clean.hashes, '/_astro/x.js': 'abc' } }, { readPage, workerSource });
    expect(f.join('\n')).toContain('/_astro/x.js');
  });
  it('names a URL in hashes that is not in the precache set', () => {
    const f = manifestIdentityProblems({ ...clean, hashes: { ...clean.hashes, '/c/': 'x' } }, { readPage, workerSource });
    expect(f.join('\n')).toContain('/c/');
  });
  it('names a dist font that is not precached and has no hash', () => {
    const distFonts = ['/fonts/Pack.ttf'];
    const f = manifestIdentityProblems(clean, { readPage, workerSource, distFonts });
    expect(f.join('\n')).toContain('/fonts/Pack.ttf');
  });
  it('passes a dist font listed with matching bytes', () => {
    const distFonts = ['/fonts/Pack.ttf'];
    const read = (u) => (u === '/fonts/Pack.ttf' ? 'ttf' : bytes[u]);
    const m = { ...clean, hashes: { ...clean.hashes, '/fonts/Pack.ttf': pageHash('ttf') } };
    expect(manifestIdentityProblems(m, { readPage: read, workerSource, distFonts })).toEqual([]);
  });
  it('names a file whose bytes no longer hash to the recorded value', () => {
    const f = manifestIdentityProblems(clean, { readPage: (u) => (u === '/icons/i.png' ? 'changed' : bytes[u]), workerSource });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('/icons/i.png');
  });
});

describe('distFontUrls (MEM-22)', () => {
  it('lists every file in dist/fonts, whatever its name', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fonts-'));
    fs.mkdirSync(path.join(dir, 'fonts'));
    for (const f of ['Heebo-Regular.ttf', 'Foo.subset.ttf', 'Bar_Baz.woff2']) fs.writeFileSync(path.join(dir, 'fonts', f), 'x');
    expect(distFontUrls(dir).sort()).toEqual(['/fonts/Bar_Baz.woff2', '/fonts/Foo.subset.ttf', '/fonts/Heebo-Regular.ttf']);
  });
  it('lists nothing when dist/ has no fonts folder', () => {
    expect(distFontUrls(fs.mkdtempSync(path.join(os.tmpdir(), 'nofonts-')))).toEqual([]);
  });
});

describe('repo-only files in dist/', () => {
  it('fails the check on a project.json that public/ copied into dist/', () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'precache-repo-only-'));
    fs.mkdirSync(path.join(dist, 'fonts'));
    fs.writeFileSync(path.join(dist, 'fonts', 'project.json'), '{}');
    expect(repoOnlyProblems(dist)).toEqual(['fonts/project.json: repo config shipped in dist/ (an Nx project.json inside public/ is copied verbatim and served; run scripts/repoOnlyFiles.mjs or move it)']);
  });
});
