import { describe, expect, it } from 'vitest';
import { analyzeExports, compareUnused, nextUnusedRecord } from './check-unused-exports.mjs';

// A planted mini-project is a { path: source } map; paths are repo-relative.
const names = (list) => list.map((e) => `${e.file}:${e.name}`).sort();

describe('analyzeExports (ARCH-61)', () => {
  it('counts an export nobody imports or uses as never used', () => {
    const r = analyzeExports({
      'src/lib/a.ts': 'export function dead() { return 1; }\nexport const live = 2;\n',
      'src/lib/b.ts': "import { live } from './a';\nexport const b = live;\n",
      'src/lib/c.ts': "import { b } from './b';\nconsole.log(b);\n",
    });
    expect(names(r.neverUsed)).toEqual(['src/lib/a.ts:dead']);
    expect(r.ownFileOnly).toEqual([]);
    expect(r.testOnly).toEqual([]);
  });

  it('counts an export used only by its own file as own file only', () => {
    const r = analyzeExports({
      'src/lib/a.ts': 'export function helper() { return 1; }\nexport const x = helper();\n',
      'src/lib/b.ts': "import { x } from './a';\nconsole.log(x);\n",
    });
    expect(names(r.ownFileOnly)).toEqual(['src/lib/a.ts:helper']);
    expect(r.neverUsed).toEqual([]);
  });

  it('counts an export imported only by test files as test only', () => {
    const r = analyzeExports({
      'src/lib/a.ts': 'export const onlyTested = 1;\n',
      'src/lib/a.test.ts': "import { onlyTested } from './a';\nconsole.log(onlyTested);\n",
    });
    expect(names(r.testOnly)).toEqual(['src/lib/a.ts:onlyTested']);
  });

  it('lets a @testSeam export be used by tests only', () => {
    const r = analyzeExports({
      'src/lib/a.ts': '/** @testSeam */\nexport const seam = 1;\nexport const plain = 2;\n',
      'src/lib/a.test.ts': "import { seam, plain } from './a';\nconsole.log(seam, plain);\n",
    });
    expect(names(r.testOnly)).toEqual(['src/lib/a.ts:plain']);
  });

  it('counts an import from an .astro file (frontmatter and script) as used', () => {
    const r = analyzeExports({
      'src/lib/a.ts': 'export const fromFrontmatter = 1;\nexport const fromScript = 2;\n',
      'src/components/X.astro': "---\nimport { fromFrontmatter } from '../lib/a';\n---\n<p>{fromFrontmatter}</p>\n<script>\n  import { fromScript } from '../lib/a';\n  console.log(fromScript);\n</script>\n",
    });
    expect(r.neverUsed).toEqual([]);
    expect(r.testOnly).toEqual([]);
    expect(r.ownFileOnly).toEqual([]);
  });

  it('follows a re-export through a barrel and counts default exports', () => {
    const r = analyzeExports({
      'src/lib/a.ts': 'export const viaBarrel = 1;\nexport default function main() {}\n',
      'src/lib/index.ts': "export { viaBarrel } from './a';\n",
      'src/lib/b.ts': "import { viaBarrel } from './index';\nimport main from './a';\nconsole.log(viaBarrel, main);\n",
    });
    expect(r.neverUsed).toEqual([]);
  });

  it('treats a namespace or dynamic import as using every export', () => {
    const r = analyzeExports({
      'src/lib/a.ts': 'export const one = 1;\n',
      'src/lib/b.ts': 'export const two = 2;\n',
      'src/lib/c.ts': "import * as a from './a';\nexport const lazy = () => import('./b');\nconsole.log(a);\n",
      'src/lib/d.ts': "import { lazy } from './c';\nconsole.log(lazy);\n",
    });
    expect(r.neverUsed).toEqual([]);
  });

  it('never counts an allowlisted entry point', () => {
    const r = analyzeExports({
      'src/pages/index.astro': '---\nexport const prerender = true;\n---\n',
      'src/pages/sitemap.xml.ts': 'export const GET = () => 1;\n',
      'src/content.config.ts': 'export const collections = {};\n',
      'api/report.ts': 'export default function handler() {}\n',
      'middleware.ts': 'export const config = {};\n',
      'astro.config.mjs': 'export default {};\n',
    });
    expect(r).toEqual({ neverUsed: [], ownFileOnly: [], testOnly: [] });
  });
});

describe('layer aliases (ARCH-44)', () => {
  it('counts an export used only through an alias as used, like the relative import', () => {
    const r = analyzeExports({
      'src/lib/a.ts': 'export const live = 2;\n',
      'src/shell/b.ts': "import { live } from '#lib/a.ts';\nconsole.log(live);\n",
    });
    expect(r.neverUsed).toEqual([]);
  });

  it('treats a dynamic import or import() type through an alias as using every export', () => {
    const r = analyzeExports({
      'src/lib/a.ts': 'export const one = 1;\nexport const two = 2;\n',
      'src/lib/b.ts': 'export const three = 3;\n',
      'src/shell/c.ts': "export type A = typeof import('#lib/a.ts');\nexport const lazy = () => import('#lib/b.ts');\n",
      'src/shell/d.ts': "import type { A } from './c';\nimport { lazy } from './c';\nconsole.log(lazy as unknown as A);\n",
    });
    expect(r.neverUsed).toEqual([]);
  });
});

describe('ratchet comparison (ARCH-61)', () => {
  const rec = { neverUsed: 3, ownFileOnly: 10, testOnly: 20 };
  it('fails when a count rises', () => {
    expect(compareUnused(rec, { neverUsed: 4, ownFileOnly: 10, testOnly: 20 }).failures).toEqual([{ key: 'neverUsed', recorded: 3, current: 4 }]);
  });
  it('passes at the record and lowers on a shrink', () => {
    expect(compareUnused(rec, rec).failures).toEqual([]);
    expect(nextUnusedRecord(rec, { neverUsed: 3, ownFileOnly: 9, testOnly: 20 })).toEqual({ neverUsed: 3, ownFileOnly: 9, testOnly: 20 });
    expect(nextUnusedRecord(rec, rec)).toBeNull();
    expect(nextUnusedRecord(rec, { neverUsed: 4, ownFileOnly: 1, testOnly: 20 })).toBeNull();
  });
});
