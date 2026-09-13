import { describe, expect, it } from 'vitest';
import { deriveScope, ownerOf, toolNameOf, CORE_PROJECTS, wide } from '../../scripts/affected-scope.mjs';

/* scripts/affected-scope.mjs's deriveScope() is the pure mapping this project
   set relies on: given changed files, the projects `nx` says are affected,
   and a project name -> root map, decide narrow vs. everything and what to
   run. It never shells out to git or nx itself, so it is pinned here the way
   changeScope.test.js pins scripts/change-scope.mjs's classify() - with
   synthetic inputs, no real repository state. */

const ROOTS = new Map([
  ['site', 'src'],
  ['shell', 'src/shell'],
  ['editor', 'src/editor'],
  ['editor-ui', 'src/editor-ui'],
  ['lib', 'src/lib'],
  ['tool-merge', 'src/tools/merge'],
  ['tool-sign', 'src/tools/sign'],
  ['tool-compress', 'src/tools/compress'],
  ['tool-split', 'src/tools/split'],
  ['site-e2e', 'e2e'],
  ['fonts', 'e2e/sign'],
  ['font-assets', 'public/fonts'],
]);

describe('ownerOf', () => {
  it('matches a file under a project root', () => {
    expect(ownerOf('src/tools/merge/PdfMergeTool.tsx', ROOTS)).toBe('tool-merge');
  });

  it('picks the most specific (longest) root when roots nest', () => {
    // src/lib is nested under site's root ("src"); a file there belongs to
    // lib, not site, the same way Nx's own directory-based carve-out works.
    expect(ownerOf('src/lib/format.js', ROOTS)).toBe('lib');
    expect(ownerOf('src/pages/index.astro', ROOTS)).toBe('site');
    expect(ownerOf('e2e/sign/fixtures/latinNameCorpus.js', ROOTS)).toBe('fonts');
    expect(ownerOf('e2e/home/handoff.spec.js', ROOTS)).toBe('site-e2e');
  });

  it('returns null for a file no project root contains', () => {
    expect(ownerOf('scripts/change-scope.mjs', ROOTS)).toBeNull();
    expect(ownerOf('docs/module-boundaries.md', ROOTS)).toBeNull();
    expect(ownerOf('middleware.ts', ROOTS)).toBeNull();
  });
});

describe('toolNameOf', () => {
  it('strips the tool- prefix', () => {
    expect(toolNameOf('tool-merge')).toBe('merge');
    expect(toolNameOf('tool-edit-pages')).toBe('edit-pages');
  });
});

describe('CORE_PROJECTS', () => {
  it('is exactly the five modules every tool depends on', () => {
    expect([...CORE_PROJECTS].sort()).toEqual(['editor', 'editor-ui', 'lib', 'shell', 'site']);
  });
});

describe('deriveScope', () => {
  it('narrows a single-tool change to that tool plus site-e2e, no fonts', () => {
    const scope = deriveScope({
      files: ['src/tools/compress/PdfCompressTool.tsx'],
      affected: ['tool-compress', 'site-e2e'],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(false);
    expect(scope.fonts).toBe(false);
    expect(scope.unit_paths).toBe('src/tools/compress/ src/test/');
    expect(scope.e2e_paths).toBe('src/tools/compress/e2e/ e2e/');
  });

  it('adds a tool\'s own e2e/ dir only when toolE2eExists says it has one', () => {
    const scope = deriveScope({
      files: ['src/tools/merge/PdfMergeTool.tsx'],
      affected: ['tool-merge'],
      roots: ROOTS,
      toolE2eExists: () => true,
    });
    expect(scope.e2e_paths).toBe('src/tools/merge/e2e/');

    const noE2e = deriveScope({
      files: ['src/tools/split/PdfSplitTool.tsx'],
      affected: ['tool-split'],
      roots: ROOTS,
      toolE2eExists: () => false,
    });
    expect(noE2e.e2e_paths).toBe('');
  });

  it('narrows to fonts alone when only the fonts project is affected', () => {
    const scope = deriveScope({
      files: ['e2e/sign/fixtures/latinNameCorpus.js'],
      affected: ['fonts'],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(false);
    expect(scope.fonts).toBe(true);
    expect(scope.unit_paths).toBe('src/test/');
    expect(scope.e2e_paths).toBe('');
  });

  it('widens to everything when any core project is affected', () => {
    for (const core of CORE_PROJECTS) {
      const scope = deriveScope({
        files: ['src/lib/format.js'],
        affected: [core, 'tool-merge'],
        roots: ROOTS,
      });
      expect(scope.everything).toBe(true);
      expect(scope.fonts).toBe(true);
    }
  });

  it('widens to everything when a changed file has no project owner', () => {
    const scope = deriveScope({
      files: ['scripts/check-module-boundaries.mjs', 'src/tools/merge/PdfMergeTool.tsx'],
      affected: ['tool-merge'],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(true);
    expect(scope.fonts).toBe(true);
    expect(scope.reason).toMatch(/unowned/);
  });

  it('does not widen for an unowned file that is docs-only', () => {
    const scope = deriveScope({
      files: ['backlog/tasks/MERGE-19.md', 'src/tools/merge/PdfMergeTool.tsx'],
      affected: ['tool-merge'],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(false);
    expect(scope.unit_paths).toBe('src/tools/merge/ src/test/');
  });

  it('narrows to nothing for a purely docs-only change (affected=[])', () => {
    const scope = deriveScope({
      files: ['backlog/tasks/MERGE-19.md', 'CLAUDE.md'],
      affected: [],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(false);
    expect(scope.fonts).toBe(false);
    expect(scope.unit_paths).toBe('src/test/');
    expect(scope.e2e_paths).toBe('');
  });

  it('narrows across two tools at once, no fonts, e2e/ only if site-e2e is affected', () => {
    const scope = deriveScope({
      files: ['src/tools/merge/PdfMergeTool.tsx', 'src/tools/compress/PdfCompressTool.tsx'],
      affected: ['tool-merge', 'tool-compress', 'site-e2e'],
      roots: ROOTS,
      toolE2eExists: () => true,
    });
    expect(scope.everything).toBe(false);
    expect(scope.unit_paths).toBe('src/tools/compress/ src/tools/merge/ src/test/');
    expect(scope.e2e_paths).toBe('src/tools/compress/e2e/ src/tools/merge/e2e/ e2e/');
  });
});

describe('wide', () => {
  it('always sets fonts=true alongside everything=true', () => {
    const scope = wide(['site'], 'test reason');
    expect(scope.everything).toBe(true);
    expect(scope.fonts).toBe(true);
    expect(scope.unit_paths).toBe('');
    expect(scope.e2e_paths).toBe('');
    expect(scope.reason).toBe('test reason');
  });
});
