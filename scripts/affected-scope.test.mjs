import { describe, expect, it } from 'vitest';
import { deriveScope, ownerOf, toolNameOf, siteE2eOwnPaths, CORE_PROJECTS, ORACLE_FILES, wide, matchesFontsGlob } from './affected-scope.mjs';

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
  ['tool-redact', 'src/tools/redact'],
  ['tool-compress', 'src/tools/compress'],
  ['tool-split', 'src/tools/split'],
  ['tool-edit-pages', 'src/tools/edit-pages'],
  ['site-e2e', 'e2e'],
  ['fonts', 'e2e/sign'],
  // ARCH-23: the export render guard and language acceptance moved to their
  // own project, sibling of `fonts` inside `site-e2e`'s own root.
  ['export-guards', 'e2e/export'],
  ['font-assets', 'public/fonts'],
  ['cross-tool-tests', 'src/test/cross-tool'],
  ['site-test', 'src/test'],
  ['i18n', 'src/i18n'],
  // ARCH-22: scripts/ is a project of its own now (`tooling`), with three
  // pre-existing subfolders that still win by longest-prefix match.
  ['tooling', 'scripts'],
  ['sign-spike-mobi10', 'scripts/spike/mobi-10'],
  ['editor-dependency-directions-fixtures', 'scripts/fixtures/editor-dependency-directions'],
  ['tooling-font-subsetters', 'scripts/fonts'],
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
    // ARCH-22: scripts/ is owned by `tooling` now, so a scripts/ file is no
    // longer an example of "no project owner" - see the `tooling` describe
    // block below for its ownership and the oracle-file exception.
    expect(ownerOf('docs/module-boundaries.md', ROOTS)).toBeNull();
    expect(ownerOf('middleware.ts', ROOTS)).toBeNull();
    expect(ownerOf('package.json', ROOTS)).toBeNull();
  });

  it('matches a file whose path equals the root exactly, not just a prefix', () => {
    expect(ownerOf('public/fonts', ROOTS)).toBe('font-assets');
  });

  it('does not treat a sibling directory with the same prefix as a match', () => {
    // "src/editor-ui" must not be caught by "src/editor"'s root - the check
    // requires a path separator right after the root, not a bare prefix.
    expect(ownerOf('src/editor-ui/ArmHint.tsx', ROOTS)).toBe('editor-ui');
    expect(ownerOf('src/editor/model/editorModel.ts', ROOTS)).toBe('editor');
  });

  it('returns null against an empty root map', () => {
    expect(ownerOf('src/lib/format.js', new Map())).toBeNull();
  });

  // Mirrors the real project.json layout (see nx.json's projects), so this
  // pins the same "which project owns this path" question the deleted
  // FONT_GUARD_INPUTS example tests used to pin for the font guards alone -
  // now for every project, derived from directory ownership instead of a
  // hand-kept regex list.
  it.each([
    ['src/shell/BasePdfTool.tsx', 'shell'],
    ['src/editor/workspace/useEditorDraftPersistence.ts', 'editor'],
    ['src/editor-ui/ElementToolbar.tsx', 'editor-ui'],
    ['src/lib/format.js', 'lib'],
    ['src/tools/sign/PdfSignTool.tsx', 'tool-sign'],
    ['src/tools/sign/e2e/sign-editor.spec.js', 'tool-sign'],
    ['src/tools/edit-pages/PdfEditPagesTool.tsx', 'tool-edit-pages'],
    ['src/pages/index.astro', 'site'],
    ['src/data/tools.js', 'site'],
    // DEBT-07: src/i18n/ got its own Nx project (same shape as site-test), so
    // this now resolves to 'i18n', not the 'site' fallback it used to.
    ['src/i18n/toolMessages.ts', 'i18n'],
    ['public/fonts/Kalam-Regular.ttf', 'font-assets'],
    ['e2e/sign/hebrew-composition-guard.spec.js', 'fonts'],
    // ARCH-23: the export render guard's baseline moved to e2e/export/,
    // its own project now, no longer inside `fonts`.
    ['e2e/export/fixtures/exportRenderBaseline.json', 'export-guards'],
    ['e2e/export/language-acceptance.spec.js', 'export-guards'],
    ['e2e/home/handoff.spec.js', 'site-e2e'],
    ['e2e/csp-smoke.spec.js', 'site-e2e'],
    // ARCH-22: a flat scripts/ file is owned by `tooling`; the three
    // pre-existing subfolders still win by longest-prefix match.
    ['scripts/nx-affected-histogram.mjs', 'tooling'],
    ['scripts/affected-scope.mjs', 'tooling'],
    ['scripts/spike/mobi-10/cells.mjs', 'sign-spike-mobi10'],
    ['scripts/fixtures/editor-dependency-directions/valid/a.ts', 'editor-dependency-directions-fixtures'],
    ['scripts/fonts/build-demo-font-subset.py', 'tooling-font-subsetters'],
  ])('%s is owned by %s', (file, project) => {
    expect(ownerOf(file, ROOTS)).toBe(project);
  });

  it.each([
    'backlog/tasks/ARCH-20.md',
    '.github/workflows/ci.yml',
    'vitest.config.js',
    'middleware.ts',
    'package.json',
  ])('%s has no project owner', (file) => {
    expect(ownerOf(file, ROOTS)).toBeNull();
  });
});

describe('toolNameOf', () => {
  it('strips the tool- prefix', () => {
    expect(toolNameOf('tool-merge')).toBe('merge');
    expect(toolNameOf('tool-edit-pages')).toBe('edit-pages');
  });

  it('returns an empty string for the bare "tool-" name', () => {
    expect(toolNameOf('tool-')).toBe('');
  });
});

describe('siteE2eOwnPaths', () => {
  const E2E_CHILDREN = [
    { name: 'card-reveal.spec.js', isDirectory: false },
    { name: 'content', isDirectory: true },
    { name: 'csp-smoke.spec.js', isDirectory: false },
    { name: 'demo', isDirectory: true },
    // ARCH-23: e2e/export/, the export-guards project, sibling of e2e/sign/.
    { name: 'export', isDirectory: true },
    { name: 'home', isDirectory: true },
    { name: 'localized', isDirectory: true },
    { name: 'offline', isDirectory: true },
    { name: 'project.json', isDirectory: false },
    { name: 'sign', isDirectory: true },
    { name: 'tool-layout.spec.js', isDirectory: false },
    { name: 'tool-output-paths.spec.js', isDirectory: false },
  ];

  it('excludes project.json and any child carved out into its own project (fonts at e2e/sign, export-guards at e2e/export)', () => {
    const paths = siteE2eOwnPaths(E2E_CHILDREN, ROOTS);
    expect(paths).not.toContain('e2e/project.json');
    expect(paths).not.toContain('e2e/sign/');
    expect(paths).not.toContain('e2e/export/');
    expect(paths).toEqual([
      'e2e/card-reveal.spec.js',
      'e2e/content/',
      'e2e/csp-smoke.spec.js',
      'e2e/demo/',
      'e2e/home/',
      'e2e/localized/',
      'e2e/offline/',
      'e2e/tool-layout.spec.js',
      'e2e/tool-output-paths.spec.js',
    ]);
  });

  it('keeps a directory trailing slash but not a file\'s', () => {
    const paths = siteE2eOwnPaths([{ name: 'demo', isDirectory: true }, { name: 'csp-smoke.spec.js', isDirectory: false }], ROOTS);
    expect(paths).toContain('e2e/demo/');
    expect(paths).toContain('e2e/csp-smoke.spec.js');
  });

  it('excludes nothing extra when no project is carved out of e2e/', () => {
    const rootsWithoutFonts = new Map([...ROOTS].filter(([name]) => name !== 'fonts'));
    const paths = siteE2eOwnPaths(E2E_CHILDREN, rootsWithoutFonts);
    expect(paths).toContain('e2e/sign/');
  });
});

describe('CORE_PROJECTS', () => {
  it('is exactly the four modules every tool depends on (editor-ui left in DEBT-06)', () => {
    expect([...CORE_PROJECTS].sort()).toEqual(['editor', 'lib', 'shell', 'site']);
  });
});

describe('deriveScope', () => {
  it('narrows a single-tool change to that tool plus site-e2e, no fonts', () => {
    const scope = deriveScope({
      files: ['src/tools/compress/PdfCompressTool.tsx'],
      affected: ['tool-compress', 'site-e2e'],
      roots: ROOTS,
      siteE2ePaths: ['e2e/home/'],
    });
    expect(scope.everything).toBe(false);
    expect(scope.fonts).toBe(false);
    expect(scope.unit_paths).toBe('src/tools/compress/ src/test/');
    expect(scope.e2e_paths).toBe('src/tools/compress/e2e/ e2e/home/');
  });

  it('never adds the bare "e2e/" string - it would substring-match every tool\'s own e2e specs too', () => {
    const scope = deriveScope({
      files: ['e2e/home/handoff.spec.js'],
      affected: ['site-e2e'],
      roots: ROOTS,
      siteE2ePaths: ['e2e/home/'],
    });
    expect(scope.e2e_paths).toBe('e2e/home/');
  });

  it('adds a tool\'s own e2e/ dir only when toolE2eExists says it has one', () => {
    // toolE2eExists is called with the PROJECT NAME ("tool-merge"), not the
    // path it maps to - a regression test for a bug where the filter ran
    // after the map and so always received "src/tools/merge/e2e/" instead.
    const receivedArgs = [];
    const scope = deriveScope({
      files: ['src/tools/merge/PdfMergeTool.tsx'],
      affected: ['tool-merge'],
      roots: ROOTS,
      toolE2eExists: (project) => { receivedArgs.push(project); return true; },
    });
    expect(receivedArgs).toEqual(['tool-merge']);
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

  // ARCH-23: a core-project verdict no longer force-runs the font guards -
  // src/lib/format.js does not touch a font-registry path, so fonts is now
  // false here even though everything else still widens. export_guards stays
  // true regardless (its own project treats editor/lib as coarse
  // dependencies on purpose - see e2e/export/project.json).
  it('widens to everything when any core project is affected, but no longer force-runs the font guards for an unrelated file (ARCH-23)', () => {
    for (const core of CORE_PROJECTS) {
      const scope = deriveScope({
        files: ['src/lib/format.js'],
        affected: [core, 'tool-merge'],
        roots: ROOTS,
      });
      expect(scope.everything).toBe(true);
      expect(scope.fonts).toBe(false);
      expect(scope.export_guards).toBe(true);
    }
  });

  // The directory rule: src/editor/text/ shares one Nx-project directory
  // with the shaping/runtime code (bidiRuns.js, combPlacement.ts,
  // dateFormat.ts, ...), which is not itself the font catalogue - but Nx
  // gives a project ownership of a directory, not a named subset of files
  // inside it, so matchesFontsGlob treats the whole directory as a fonts
  // input rather than trying to name only the catalogue files.
  it('a change inside src/editor/text/ still forces fonts=true even when it is shaping code, not the catalogue (directory rule, ARCH-23)', () => {
    const scope = deriveScope({
      files: ['src/editor/text/combPlacement.ts'],
      affected: ['editor', 'tool-sign', 'tool-redact'],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(true); // editor is a core project
    expect(scope.fonts).toBe(true);
  });

  it('a src/lib/ change outside the font-registry glob gives everything=true but fonts=false (ARCH-23)', () => {
    const scope = deriveScope({
      files: ['src/lib/drafts/draftStore.js'],
      affected: ['lib', 'tool-sign'],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(true);
    expect(scope.fonts).toBe(false);
  });

  it('a font asset change gives fonts=true', () => {
    const scope = deriveScope({
      files: ['public/fonts/NewFont-Regular.ttf'],
      affected: ['font-assets'],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(false);
    expect(scope.fonts).toBe(true);
  });

  it('a new guard spec under e2e/sign/ gives fonts=true regardless of its exact filename', () => {
    const scope = deriveScope({
      files: ['e2e/sign/foo-shaping-guard.spec.js'],
      affected: ['fonts'],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(false);
    expect(scope.fonts).toBe(true);
  });

  it('a package-lock.json change still gives fonts=true unconditionally (unowned-file wide() reason, unchanged by ARCH-23)', () => {
    const scope = deriveScope({
      files: ['package-lock.json'],
      affected: [],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(true);
    expect(scope.reason).toMatch(/unowned/);
    expect(scope.fonts).toBe(true);
  });

  // export_guards, unlike fonts, is a real Nx-affected verdict - its own
  // project's implicitDependencies (font-assets, editor, lib, tool-sign)
  // decide it, the same as any tool-<name> project.
  it('a change to the real export pipeline marks export-guards affected, decided by Nx like a tool project', () => {
    const scope = deriveScope({
      files: ['src/editor/adapters/pdf/sign.js'],
      affected: ['editor', 'export-guards', 'tool-sign', 'tool-redact'],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(true); // editor is core
    expect(scope.export_guards).toBe(true);
  });

  it('export_guards is false for a tool-only change with no implicit-dependency edge to it', () => {
    const scope = deriveScope({
      files: ['src/tools/compress/PdfCompressTool.tsx'],
      affected: ['tool-compress', 'site-e2e'],
      roots: ROOTS,
      siteE2ePaths: ['e2e/home/'],
    });
    expect(scope.export_guards).toBe(false);
  });

  it('widens to everything when a changed file has no project owner', () => {
    const scope = deriveScope({
      files: ['package.json', 'src/tools/merge/PdfMergeTool.tsx'],
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

  it('narrows across two tools at once, no fonts, site-e2e paths only if site-e2e is affected', () => {
    const scope = deriveScope({
      files: ['src/tools/merge/PdfMergeTool.tsx', 'src/tools/compress/PdfCompressTool.tsx'],
      affected: ['tool-merge', 'tool-compress', 'site-e2e'],
      roots: ROOTS,
      toolE2eExists: () => true,
      siteE2ePaths: ['e2e/demo/', 'e2e/home/'],
    });
    expect(scope.everything).toBe(false);
    expect(scope.unit_paths).toBe('src/tools/compress/ src/tools/merge/ src/test/');
    expect(scope.e2e_paths).toBe('src/tools/compress/e2e/ src/tools/merge/e2e/ e2e/demo/ e2e/home/');
  });

  it('sorts tool projects alphabetically regardless of the order nx reports them', () => {
    const scope = deriveScope({
      files: ['src/tools/split/PdfSplitTool.tsx', 'src/tools/compress/PdfCompressTool.tsx'],
      affected: ['tool-split', 'tool-compress'],
      roots: ROOTS,
    });
    expect(scope.unit_paths).toBe('src/tools/compress/ src/tools/split/ src/test/');
  });

  it('an unowned file wins over a core-project match (rule order: unowned before core)', () => {
    const scope = deriveScope({
      files: ['patches/pdfjs-dist+6.3.289.patch', 'src/lib/format.js'],
      affected: ['lib'],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(true);
    expect(scope.reason).toMatch(/unowned/);
  });

  it('a tool with no e2e/ folder and no site-e2e affected narrows to an empty e2e_paths', () => {
    const scope = deriveScope({
      files: ['src/tools/split/PdfSplitTool.tsx'],
      affected: ['tool-split'],
      roots: ROOTS,
      toolE2eExists: () => false,
    });
    expect(scope.everything).toBe(false);
    expect(scope.e2e_paths).toBe('');
  });

  // ARCH-23: Nx's `fonts` project still shows up in `affected` here (a real
  // graph fact - PdfSignTool.tsx sits inside tool-sign, which some fonts
  // guard used to declare as an implicit dependency), but the CI decision no
  // longer reads affectedSet.has('fonts') at all - this file does not touch
  // a font-registry path, so fonts is false. This is exactly the bug the
  // ticket fixes: a tool-sign change should not run the font guards on its
  // own.
  it('a tool-sign change no longer forces fonts=true just because Nx lists fonts as affected (ARCH-23)', () => {
    const scope = deriveScope({
      files: ['src/tools/sign/PdfSignTool.tsx'],
      affected: ['tool-sign', 'fonts'],
      roots: ROOTS,
      toolE2eExists: () => true,
    });
    expect(scope.everything).toBe(false);
    expect(scope.fonts).toBe(false);
    expect(scope.unit_paths).toBe('src/tools/sign/ src/test/');
  });

  // DEBT-06: editor-ui left CORE_PROJECTS, so an editor-ui-only change now
  // narrows instead of widening - the affected set nx actually reports for
  // src/editor-ui/ElementToolbar.tsx (measured, see the ticket and the
  // header comment's rule 3). ARCH-23 (2026-09-18, the commit that filed the
  // ticket, 15396adf: "Tool tooltip leads with the button's name") changed
  // this test's expectation: fonts is now false for an editor-ui/tool-sign
  // change (it does not touch a font-registry path), while export_guards is
  // true (tool-sign is still export-guards' own, deliberately coarse,
  // implicit dependency).
  it('a 15396adf-shaped change (editor-ui + a tool-sign test file) narrows to Sign, Redact, editor-ui\'s own root, and src/test/; fonts=false, export_guards=true', () => {
    const scope = deriveScope({
      files: ['src/editor-ui/ArmHint.tsx', 'src/tools/sign/components/SignToolbar.test.tsx'],
      affected: ['editor-ui', 'tool-sign', 'tool-redact', 'export-guards', 'cross-tool-tests', 'site-e2e'],
      roots: ROOTS,
      toolE2eExists: () => true,
      siteE2ePaths: ['e2e/home/'],
    });
    expect(scope.everything).toBe(false);
    expect(scope.unit_paths).toBe('src/editor-ui/ src/tools/redact/ src/tools/sign/ src/test/');
    expect(scope.fonts).toBe(false);
    expect(scope.export_guards).toBe(true);
    expect(scope.e2e_paths).toContain('src/tools/sign/e2e/');
    expect(scope.e2e_paths).toContain('src/tools/redact/e2e/');
  });

  // DEBT-04 (second pass): src/test/ got its own Nx project, `site-test`,
  // rooted at the literal string `src/test` (no trailing slash) - unlike
  // `cross-tool-tests` (rooted at `src/test/cross-tool`), that root does not
  // match the `startsWith('src/test/')` check extraPaths already used to
  // skip src/test/'s own roots, so without the `root !== 'src/test'` guard
  // this would have doubled `src/test/` in unit_paths.
  it('does not duplicate src/test/ when site-test itself is affected', () => {
    const scope = deriveScope({
      files: ['src/test/setInputFiles.js'],
      affected: ['site-test', 'tool-sign'],
      roots: ROOTS,
      toolE2eExists: () => true,
    });
    expect(scope.everything).toBe(false);
    expect(scope.unit_paths).toBe('src/tools/sign/ src/test/');
  });

  it('still widens to everything on a shell change', () => {
    const scope = deriveScope({
      files: ['src/shell/BasePdfTool.tsx'],
      affected: ['shell', 'tool-merge'],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(true);
    expect(scope.reason).toMatch(/shell/);
  });

  it.each(['editor', 'lib', 'site'])('still widens to everything on a %s change (unlike editor-ui)', (core) => {
    const scope = deriveScope({
      files: ['src/lib/format.js'],
      affected: [core, 'tool-merge'],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(true);
    expect(scope.reason).toMatch(new RegExp(core));
  });

  // ARCH-22: scripts/ is a real, owned project (`tooling`) now, so a change
  // to a flat scripts/ file narrows the same way an editor-ui-only change
  // does - see the `tooling` root added to ROOTS above.
  describe('the tooling project (ARCH-22)', () => {
    it('(a) a change to a flat scripts/ file narrows: no fonts, unit_paths has scripts/ and src/test/, e2e_paths empty', () => {
      const scope = deriveScope({
        files: ['scripts/backlog-data.mjs'],
        affected: ['tooling'],
        roots: ROOTS,
      });
      expect(scope.everything).toBe(false);
      expect(scope.fonts).toBe(false);
      expect(scope.unit_paths).toBe('scripts/ src/test/');
      expect(scope.e2e_paths).toBe('');
    });

    it('(b) a change to affected-scope.mjs itself always widens, with the CI-oracle reason', () => {
      const scope = deriveScope({
        files: ['scripts/affected-scope.mjs'],
        affected: ['tooling'],
        roots: ROOTS,
      });
      expect(scope.everything).toBe(true);
      expect(scope.fonts).toBe(true);
      expect(scope.reason).toMatch(/CI oracle changed/);
      expect(scope.reason).toMatch(/scripts\/affected-scope\.mjs/);
    });

    it('a change to change-scope.mjs itself also widens with the CI-oracle reason', () => {
      const scope = deriveScope({
        files: ['scripts/change-scope.mjs'],
        affected: ['tooling'],
        roots: ROOTS,
      });
      expect(scope.everything).toBe(true);
      expect(scope.reason).toMatch(/CI oracle changed/);
    });

    it('(c) a change to affected-scope.test.mjs alone is not widened by the oracle rule - it may narrow', () => {
      const scope = deriveScope({
        files: ['scripts/affected-scope.test.mjs'],
        affected: ['tooling'],
        roots: ROOTS,
      });
      expect(scope.everything).toBe(false);
      expect(scope.reason).not.toMatch(/CI oracle/);
      expect(scope.unit_paths).toBe('scripts/ src/test/');
    });

    it('(d) a spike file still resolves to sign-spike-mobi10 by longest-prefix match, not tooling', () => {
      expect(ownerOf('scripts/spike/mobi-10/cells.mjs', ROOTS)).toBe('sign-spike-mobi10');
      const scope = deriveScope({
        files: ['scripts/spike/mobi-10/cells.mjs'],
        affected: ['sign-spike-mobi10'],
        roots: ROOTS,
      });
      expect(scope.everything).toBe(false);
      expect(scope.unit_paths).toBe('scripts/spike/mobi-10/ src/test/');
    });

    it('a tooling change does not itself force fonts=true (nx affected walks dependents, and nothing depends on tooling)', () => {
      const scope = deriveScope({
        files: ['scripts/backlog-epics.mjs'],
        affected: ['tooling'],
        roots: ROOTS,
      });
      expect(scope.fonts).toBe(false);
    });

    it('the oracle rule fires even when the file also happens to be the only changed file (no affected projects besides tooling)', () => {
      expect(ORACLE_FILES.has('scripts/affected-scope.mjs')).toBe(true);
      expect(ORACLE_FILES.has('scripts/change-scope.mjs')).toBe(true);
      expect(ORACLE_FILES.has('scripts/affected-scope.test.mjs')).toBe(false);
      expect(ORACLE_FILES.has('scripts/change-scope.test.mjs')).toBe(false);
    });
  });
});

describe('wide', () => {
  // ARCH-23: fonts defaults to true (every existing wide() call site except
  // deriveScope's core-project rule relies on this fail-open default), but a
  // caller may now override it with the glob-computed value - the
  // core-project rule does exactly that. export_guards has no override: it
  // is always true on a wide() verdict (see wide()'s own comment for why
  // that is fine at only two cheap specs).
  it('defaults fonts to true, but a caller may override it', () => {
    const scope = wide(['site'], 'test reason');
    expect(scope.everything).toBe(true);
    expect(scope.fonts).toBe(true);
    expect(scope.export_guards).toBe(true);
    expect(scope.unit_paths).toBe('');
    expect(scope.e2e_paths).toBe('');
    expect(scope.reason).toBe('test reason');

    const overridden = wide(['site'], 'test reason', false);
    expect(overridden.everything).toBe(true);
    expect(overridden.fonts).toBe(false);
    expect(overridden.export_guards).toBe(true);
  });

  it('accepts an empty affected list, e.g. for a fail-open reason with nothing yet known', () => {
    const scope = wide([], 'no usable base');
    expect(scope.affected).toEqual([]);
    expect(scope.everything).toBe(true);
    expect(scope.fonts).toBe(true);
    expect(scope.export_guards).toBe(true);
  });
});

describe('matchesFontsGlob', () => {
  it.each([
    'public/fonts/NewFont-Regular.ttf',
    'src/editor/text/fonts.js',
    'src/editor/text/combPlacement.ts', // directory rule, not a named list
    'src/styles/editorFonts.css',
    'scripts/fonts/build-cjk-subset.py',
    'scripts/generate-font-manifest.mjs',
    'scripts/check-font-glyf-alignment.js',
    'e2e/sign/hebrew-composition-guard.spec.js',
    'e2e/sign/fixtures/latinNameCorpus.js',
    'playwright.config.js',
  ])('%s matches', (file) => {
    expect(matchesFontsGlob(file)).toBe(true);
  });

  it.each([
    'src/lib/format.js',
    'src/editor/model/editorModel.ts',
    'src/editor-ui/ElementToolbar.tsx',
    'src/tools/sign/PdfSignTool.tsx',
    'e2e/export/export-render-guard.spec.js',
    'package.json',
    'package-lock.json',
  ])('%s does not match', (file) => {
    expect(matchesFontsGlob(file)).toBe(false);
  });
});
