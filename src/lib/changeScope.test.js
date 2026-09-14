import { describe, expect, it } from 'vitest';
import { changedFiles, classify, isDocsOnly } from '../../scripts/change-scope.mjs';

/* scripts/change-scope.mjs decides, for CI and for `npm run test:e2e`, whether
   a change is docs-only (no build, no browser). Whether the font screening
   guards must run is scripts/affected-scope.mjs's question now (a real Nx
   project over public/fonts/, src/editor/, src/lib/ and tool-sign, not a
   second hand-kept list here) - see src/lib/affectedScope.test.js. */

describe('docs-only changes', () => {
  it.each([
    'backlog/tasks/MERGE-19.md',
    'docs/seo-competitive-findings.md',
    'docs/i18n-status/snapshot.json',
    'BACKLOG.md',
    'TODO.md',
    'README.md',
    'CLAUDE.md',
    'LICENSE',
    '.claude/rules/editor.md',
    '.impeccable/state.json',
  ])('%s is docs', (file) => {
    expect(isDocsOnly(file)).toBe(true);
  });

  it.each([
    'THIRD_PARTY_LICENSES.md',
    'src/pages/index.astro',
    'src/content/content-pages/pdf-wont-compress-to-100kb.yaml',
    'scripts/generate-backlog.mjs',
    '.github/workflows/ci.yml',
    'package.json',
    'public/manifest.webmanifest',
  ])('%s is not docs', (file) => {
    expect(isDocsOnly(file)).toBe(false);
  });

  it('is docs-only only when every file is docs, and never for an empty change', () => {
    expect(classify(['backlog/tasks/A.md', 'TODO.md']).docs_only).toBe(true);
    expect(classify(['backlog/tasks/A.md', 'src/tools/merge/merge.js']).docs_only).toBe(false);
    expect(classify([]).docs_only).toBe(false);
  });
});

// DEBT-03: a rename's old path must come back too, since a move affects both
// its source and its destination owner. changedFiles() calls the module-local
// `git` helper, which a spy on the export cannot intercept, so the test drives
// it through the optional `run` parameter instead: a stub that records every
// call's args and returns the rename's two paths.
describe('changedFiles passes --no-renames so a move affects both owners', () => {
  function makeRunStub(diffOutput) {
    const calls = [];
    const run = (args) => {
      calls.push(args);
      if (args[0] === 'diff') return diffOutput;
      if (args[0] === 'ls-files') return '';
      return '';
    };
    return { run, calls };
  }

  it('the head form (a fixed commit range) passes --no-renames and --name-only', () => {
    const rename = 'src/tools/a/old-name.js\nsrc/tools/b/new-name.js';
    const { run, calls } = makeRunStub(rename);

    const files = changedFiles('370ace3~1', '370ace3', run);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('--no-renames');
    expect(calls[0]).toContain('--name-only');
    expect(files).toEqual(['src/tools/a/old-name.js', 'src/tools/b/new-name.js']);
  });

  it('the no-head form (working tree against base) also passes --no-renames, and merges in untracked files', () => {
    const rename = 'src/tools/a/old-name.js\nsrc/tools/b/new-name.js';
    const calls = [];
    const run = (args) => {
      calls.push(args);
      if (args[0] === 'diff') return rename;
      if (args[0] === 'ls-files') return 'src/tools/a/old-name.js\nsrc/tools/new-untracked.js';
      return '';
    };

    const files = changedFiles('origin/main', undefined, run);

    const diffCalls = calls.filter((args) => args[0] === 'diff');
    expect(diffCalls).toHaveLength(1);
    expect(diffCalls[0]).toContain('--no-renames');
    expect(diffCalls[0]).toContain('--name-only');
    // both paths of the rename, plus the untracked file, de-duplicated
    expect(files).toEqual(
      expect.arrayContaining(['src/tools/a/old-name.js', 'src/tools/b/new-name.js', 'src/tools/new-untracked.js']),
    );
    expect(files).toHaveLength(3);
  });
});
