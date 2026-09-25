import { describe, expect, it } from 'vitest';
import { changedFiles, changedFilesWithStatus, classify, isDocsOnly } from './change-scope.mjs';

/* scripts/change-scope.mjs decides, for CI and for `npm run test:e2e`, whether
   a change is docs-only (no build, no browser). Whether the font screening
   guards must run is scripts/affected-scope.mjs's question now (a real Nx
   project over public/fonts/, src/editor/, src/lib/ and tool-sign, not a
   second hand-kept list here) - see scripts/affected-scope.test.mjs. */

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

  // ARCH-22: THIRD_PARTY_LICENSES.md is root-level and generated, so it looks
  // like a candidate for DOCS_ONLY - checked and left out on purpose (see the
  // header comment): it is never the sole changed file in a real push (its
  // generators always touch a source file too), and the one case where it
  // would be - a hand edit no generator produced - is exactly the drift
  // fontAttribution.test.js exists to catch. Pinned here so a future change
  // doesn't add it back without re-reading that reasoning.
  it('THIRD_PARTY_LICENSES.md stays out of DOCS_ONLY on purpose (ARCH-22)', () => {
    expect(isDocsOnly('THIRD_PARTY_LICENSES.md')).toBe(false);
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

// ARCH-28: unlike changedFiles() above, changedFilesWithStatus() leaves
// rename detection ON (-M) - unit selection needs to tell a real move (feed
// the destination, it carries the same import edges) apart from a genuine
// deletion (nothing left to feed `vitest related`), which -M's dedicated 'R'
// status makes possible.
describe('changedFilesWithStatus', () => {
  function makeRunStub(diffOutput, lsFilesOutput = '') {
    const calls = [];
    const run = (args) => {
      calls.push(args);
      if (args[0] === 'diff') return diffOutput;
      if (args[0] === 'ls-files') return lsFilesOutput;
      return '';
    };
    return { run, calls };
  }

  it('passes -M (rename detection on), not --no-renames', () => {
    const { run, calls } = makeRunStub('M\tsrc/lib/format.js');
    changedFilesWithStatus('origin/main', undefined, run);
    const diffCall = calls.find((args) => args[0] === 'diff');
    expect(diffCall).toContain('-M');
    expect(diffCall).toContain('--name-status');
    expect(diffCall).not.toContain('--no-renames');
  });

  it('reports plain add/modify/delete statuses as-is', () => {
    const { run } = makeRunStub('A\tsrc/tools/merge/new.js\nM\tsrc/lib/format.js\nD\tsrc/lib/gone.js');
    const files = changedFilesWithStatus('origin/main', undefined, run);
    expect(files).toEqual([
      { path: 'src/tools/merge/new.js', status: 'A' },
      { path: 'src/lib/format.js', status: 'M' },
      { path: 'src/lib/gone.js', status: 'D' },
    ]);
  });

  it('reports a detected rename as only its destination, with status A', () => {
    const { run } = makeRunStub('R100\tsrc/tools/a/old-name.js\tsrc/tools/a/new-name.js');
    const files = changedFilesWithStatus('origin/main', undefined, run);
    expect(files).toEqual([{ path: 'src/tools/a/new-name.js', status: 'A', renamedFrom: 'src/tools/a/old-name.js' }]);
    // the old path must not also appear as its own 'D' entry - it has a live
    // replacement, so it should never trigger the deletion widen rule.
    expect(files.some((f) => f.path === 'src/tools/a/old-name.js')).toBe(false);
  });

  it('handles a partial-similarity rename percentage (R087, not just R100)', () => {
    const { run } = makeRunStub('R087\tsrc/tools/a/old.js\tsrc/tools/a/new.js');
    const files = changedFilesWithStatus('origin/main', undefined, run);
    expect(files).toEqual([{ path: 'src/tools/a/new.js', status: 'A', renamedFrom: 'src/tools/a/old.js' }]);
  });

  it('reports untracked files as status A, and a tracked status wins over an untracked listing of the same path', () => {
    const { run } = makeRunStub('A\tsrc/tools/merge/tracked-new.js', 'src/tools/merge/tracked-new.js\nsrc/tools/merge/untracked.js');
    const files = changedFilesWithStatus('origin/main', undefined, run);
    expect(files).toEqual(
      expect.arrayContaining([
        { path: 'src/tools/merge/tracked-new.js', status: 'A' },
        { path: 'src/tools/merge/untracked.js', status: 'A' },
      ]),
    );
    expect(files).toHaveLength(2);
  });

  it('the head form (a fixed commit range) also uses -M and --name-status, with no untracked-file merge', () => {
    const { run, calls } = makeRunStub('M\tsrc/lib/format.js');
    const files = changedFilesWithStatus('370ace3~1', '370ace3', run);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('-M');
    expect(files).toEqual([{ path: 'src/lib/format.js', status: 'M' }]);
  });
});
