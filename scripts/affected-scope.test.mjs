import { describe, expect, it } from 'vitest';
import { deriveScope, ownerOf, toolNameOf, siteE2eOwnPaths, CORE_PROJECTS, ORACLE_FILES, wide, matchesFontsGlob, narrowByReachability, makeToolOf } from './affected-scope.mjs';
import { buildReachGraph } from './import-graph.mjs';

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
  // ARCH-34: carved out of `site` (root `src`), still core.
  ['data', 'src/data'],
  ['site-lib', 'src/site-lib'],
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
    ['src/editor-ui/ColorPickerMenu.tsx', 'editor-ui'],
    ['src/lib/format.js', 'lib'],
    ['src/tools/sign/PdfSignTool.tsx', 'tool-sign'],
    ['src/tools/sign/e2e/sign-editor.spec.js', 'tool-sign'],
    ['src/tools/edit-pages/PdfEditPagesTool.tsx', 'tool-edit-pages'],
    ['src/pages/index.astro', 'site'],
    ['src/data/tools.js', 'data'],
    ['src/site-lib/ratingStore.ts', 'site-lib'],
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
  it('is the four modules every tool depends on (editor-ui left in DEBT-06) plus the three folders carved out of site (ARCH-34)', () => {
    expect([...CORE_PROJECTS].sort()).toEqual(['data', 'editor', 'lib', 'shell', 'site', 'site-lib']);
  });

  // Nx cannot see an .astro page's imports, so after the carve-out a change to src/data/ or
  // src/site-lib/ no longer makes `site` affected. Without core status here it would narrow to
  // nothing and skip the home specs a page of that data feeds: the walk decides, as before.
  it('a change in a carved-out folder still goes through the core rule even though Nx does not list site', () => {
    for (const [file, project] of [['src/data/homeContent.js', 'data'], ['src/site-lib/ratingStore.ts', 'site-lib']]) {
      const scope = deriveScope({ files: [file], affected: [project], roots: ROOTS });
      expect(scope.everything, file).toBe(true);
      expect(scope.reason).toContain('core project(s) affected');
    }
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
  });

  it('narrows to nothing for a purely docs-only change (affected=[])', () => {
    const scope = deriveScope({
      files: ['backlog/tasks/MERGE-19.md', 'CLAUDE.md'],
      affected: [],
      roots: ROOTS,
    });
    expect(scope.everything).toBe(false);
    expect(scope.fonts).toBe(false);
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
    expect(scope.e2e_paths).toBe('src/tools/compress/e2e/ src/tools/merge/e2e/ e2e/demo/ e2e/home/');
  });

  it('sorts tool projects alphabetically regardless of the order nx reports them', () => {
    const scope = deriveScope({
      files: ['src/tools/split/PdfSplitTool.tsx', 'src/tools/compress/PdfCompressTool.tsx'],
      affected: ['tool-split', 'tool-compress'],
      roots: ROOTS,
    });
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
  });

  // DEBT-06: editor-ui left CORE_PROJECTS, so an editor-ui-only change now
  // narrows instead of widening - the affected set nx actually reports for
  // src/editor-ui/ColorPickerMenu.tsx (measured, see the ticket and the
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
  // this would have doubled `src/test/` in the unit paths.
  it('does not duplicate src/test/ when site-test itself is affected', () => {
    const scope = deriveScope({
      files: ['src/test/setInputFiles.js'],
      affected: ['site-test', 'tool-sign'],
      roots: ROOTS,
      toolE2eExists: () => true,
    });
    expect(scope.everything).toBe(false);
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
    it('(a) a change to a flat scripts/ file narrows: no fonts, e2e_paths empty', () => {
      const scope = deriveScope({
        files: ['scripts/backlog-data.mjs'],
        affected: ['tooling'],
        roots: ROOTS,
      });
      expect(scope.everything).toBe(false);
      expect(scope.fonts).toBe(false);
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
    });

    it('(d) a spike file still resolves to sign-spike-mobi10 by longest-prefix match, not tooling', () => {
      expect(ownerOf('scripts/spike/mobi-10/cells.mjs', ROOTS)).toBe('sign-spike-mobi10');
      const scope = deriveScope({
        files: ['scripts/spike/mobi-10/cells.mjs'],
        affected: ['sign-spike-mobi10'],
        roots: ROOTS,
      });
      expect(scope.everything).toBe(false);
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
    'src/editor-ui/ColorPickerMenu.tsx',
    'src/tools/sign/PdfSignTool.tsx',
    // Sign's product specs moved here; the font guards stayed in e2e/sign/,
    // and a Sign spec change running all 25 guards is what ARCH-23 removed.
    'src/tools/sign/e2e/sign-editor.spec.js',
    'e2e/export/export-render-guard.spec.js',
    'package.json',
    'package-lock.json',
  ])('%s does not match', (file) => {
    expect(matchesFontsGlob(file)).toBe(false);
  });
});

/* ARCH-32: file-level e2e selection for a core-project verdict. The graph below is a small
   literal one - imports[file] lists what `file` imports - turned into the reverse map the scan
   hands over, the same way commonLayerConsumers' tests hand it a literal graph. */
function graphOf(imports) {
  const reverseEdges = new Map();
  const knownFiles = new Set();
  for (const [from, targets] of Object.entries(imports)) {
    knownFiles.add(from);
    for (const to of targets) {
      knownFiles.add(to);
      if (!reverseEdges.has(to)) reverseEdges.set(to, new Set());
      reverseEdges.get(to).add(from);
    }
  }
  return { knownFiles, reverseEdges };
}

const ROUTES = new Map([['/sign', 'sign'], ['/redact', 'redact'], ['/merge', 'merge']]);
const toolOf = makeToolOf(ROUTES);

const IMPORTS = {
  // Sign and Redact import the editor core; only Sign imports signHelper; Merge alone imports mergeOnly.
  'src/tools/sign/PdfSignTool.tsx': ['src/editor/model.ts', 'src/lib/shared.ts', 'src/lib/signHelper.ts', 'src/layouts/ToolLayout.astro'],
  'src/tools/redact/PdfRedactTool.tsx': ['src/editor/model.ts', 'src/lib/shared.ts'],
  'src/tools/merge/PdfMergeTool.tsx': ['src/lib/shared.ts', 'src/lib/mergeOnly.ts'],
  'src/editor/model.ts': ['src/editor/geometry.ts'],
  'src/editor/model.test.ts': ['src/editor/model.ts'],
  // Pages: three tool routes, one that is not a tool's own, all through the layout.
  'src/pages/sign.astro': ['src/tools/sign/PdfSignTool.tsx', 'src/layouts/ToolLayout.astro'],
  'src/pages/redact.astro': ['src/tools/redact/PdfRedactTool.tsx', 'src/layouts/ToolLayout.astro'],
  'src/pages/merge.astro': ['src/tools/merge/PdfMergeTool.tsx', 'src/layouts/ToolLayout.astro'],
  'src/pages/index.astro': ['src/lib/homeOnly.ts'],
  'src/lib/neverImported.ts': [],
  'src/lib/signHelper.test.ts': ['src/lib/signHelper.ts'],
  'src/layouts/Orphan.astro': [],
  'middleware.ts': ['src/lib/viaMiddleware.ts'],
  'src/test/fixtures/data.js': [],
  'src/test/cross-tool/shared.test.js': ['src/test/fixtures/data.js', 'src/lib/shared.ts'],
};
const GRAPH = { ...graphOf(IMPORTS), toolOf };
const reach = (changedFiles) => narrowByReachability({ changedFiles, ...GRAPH });

describe('makeToolOf', () => {
  it('names the tool of a file under src/tools/<t>/ and of a tool route page, nothing else', () => {
    expect(toolOf('src/tools/sign/fields/detect.ts')).toBe('sign');
    expect(toolOf('src/pages/redact.astro')).toBe('redact');
    expect(toolOf('src/pages/index.astro')).toBe(null);
    expect(toolOf('src/lib/shared.ts')).toBe(null);
    expect(toolOf('src/layouts/ToolLayout.astro')).toBe(null);
  });
});

describe('narrowByReachability', () => {
  it('a change under src/editor/ selects sign and redact only, each named with the file that reaches it', () => {
    const result = reach(['src/editor/geometry.ts']);
    expect(result.tools).toEqual(['redact', 'sign']);
    expect(result.via.get('sign')).toBe('src/editor/geometry.ts');
    expect(result.via.get('redact')).toBe('src/editor/geometry.ts');
  });

  it('a lib file one tool imports selects that tool', () => {
    expect(reach(['src/lib/signHelper.ts']).tools).toEqual(['sign']);
    expect(reach(['src/lib/mergeOnly.ts']).tools).toEqual(['merge']);
  });

  it('a lib file several tools import selects all of them, and a tool file selects its own tool', () => {
    expect(reach(['src/lib/shared.ts']).tools).toEqual(['merge', 'redact', 'sign']);
    expect(reach(['src/tools/merge/PdfMergeTool.tsx']).tools).toEqual(['merge']);
  });

  it('a file a non-tool page imports goes wide: tool specs also visit that page', () => {
    expect(reach(['src/lib/homeOnly.ts']).wide).toContain('src/pages/index.astro, which tool specs also visit');
  });

  it('an e2e/ file ends the walk only under an always-run site-wide spec path, else it goes wide', () => {
    const graph = { ...graphOf({ 'src/lib/a.ts': [], 'e2e/home/a.spec.js': ['src/lib/a.ts'], 'e2e/fonts/b.spec.js': ['src/lib/a.ts'] }), toolOf };
    const run = (siteE2ePaths) => narrowByReachability({ changedFiles: ['src/lib/a.ts'], ...graph, siteE2ePaths });
    expect(run(['e2e/home/', 'e2e/fonts/'])).toMatchObject({ tools: [] });
    expect(run(['e2e/home/']).wide).toContain('e2e/fonts/b.spec.js');
    expect(run([]).wide).toContain('a spec the site-wide run does not cover');
  });

  it('unit tests carry no e2e consequence, and neither does test support nothing live imports', () => {
    expect(reach(['src/editor/model.test.ts'])).toMatchObject({ tools: [] });
    expect(reach(['src/test/fixtures/data.js'])).toMatchObject({ tools: [] });
    expect(reach(['src/lib/signHelper.test.ts'])).toMatchObject({ tools: [] });
  });

  it('goes wide for a file the scan never saw: CSS nothing imports, an image, a deleted file', () => {
    for (const file of ['src/styles/global.css', 'src/assets/logo.svg', 'src/lib/deleted.ts']) {
      expect(reach([file]).wide, file).toContain('not a source file the import graph knows');
    }
  });

  it('goes wide when the walk ends at a file that is no tool, no page and has no live importer', () => {
    expect(reach(['src/lib/neverImported.ts']).wide).toContain('has no importer to walk on');
    expect(reach(['src/layouts/Orphan.astro']).wide).toContain('src/layouts/Orphan.astro');
  });

  it('goes wide when a request-time entry point outside src/ imports the file', () => {
    const result = reach(['src/lib/viaMiddleware.ts']);
    expect(result.wide).toContain('middleware.ts');
  });

  it('one unclassifiable file widens the whole change, however many others narrow', () => {
    expect(reach(['src/lib/signHelper.ts', 'src/styles/global.css']).wide).toContain('src/styles/global.css');
  });

  it('terminates on an import cycle', () => {
    const cyclic = graphOf({
      'src/lib/a.ts': ['src/lib/b.ts'],
      'src/lib/b.ts': ['src/lib/a.ts'],
      'src/tools/sign/PdfSignTool.tsx': ['src/lib/a.ts'],
    });
    expect(narrowByReachability({ changedFiles: ['src/lib/b.ts'], ...cyclic, toolOf }).tools).toEqual(['sign']);
  });
});

describe('narrowByReachability: what ARCH-34 taught it', () => {
  // import-graph records `import styles from './X.module.css'` as an edge to the CSS file, but a
  // CSS file is not a scanned source file, so it was never in knownFiles and always went wide.
  const cssGraph = () => {
    const base = graphOf({ 'src/tools/merge/PdfMergeTool.tsx': [], 'src/pages/index.astro': [], 'src/shell/Orphan.tsx': [] });
    base.reverseEdges.set('src/shell/Dropzone.module.css', new Set(['src/tools/merge/PdfMergeTool.tsx']));
    base.reverseEdges.set('src/styles/home.css', new Set(['src/pages/index.astro']));
    return { ...base, toolOf };
  };

  it('a CSS file a tool imports is reached through its importer: that tool, not wide', () => {
    const result = narrowByReachability({ changedFiles: ['src/shell/Dropzone.module.css'], ...cssGraph() });
    expect(result.tools).toEqual(['merge']);
    expect(result.via.get('merge')).toBe('src/shell/Dropzone.module.css');
  });

  it('a CSS file a non-tool page imports still goes wide, as its importer does', () => {
    expect(narrowByReachability({ changedFiles: ['src/styles/home.css'], ...cssGraph() }).wide).toContain('src/pages/index.astro');
  });

  it('a CSS file nothing imports stays wide: an entry sheet or a @source side channel cannot be walked', () => {
    expect(narrowByReachability({ changedFiles: ['src/styles/tool-entry.css'], ...cssGraph() }).wide).toContain('not a source file the import graph knows');
  });

  it('src/content/** goes wide with its own reason: the layouts every page renders read the collections', () => {
    for (const file of ['src/content/content-pages/x.yaml', 'src/content/localized-tools/he/merge.yaml', 'src/content/localized-home/he.yaml']) {
      const result = narrowByReachability({ changedFiles: [file], ...cssGraph() });
      expect(result.wide, file).toContain('src/content');
      expect(result.wide, file).toContain('layouts');
    }
  });
});

describe('deriveScope: site-wide e2e split by directory (ARCH-34)', () => {
  const E2E_ROOTS = new Map([
    ...ROOTS,
    ['tool-security', 'src/tools/security'],
    ['e2e-home', 'e2e/home'],
    ['e2e-handoff', 'e2e/handoff'],
    ['e2e-cross-tool', 'e2e/cross-tool'],
  ]);
  const SITE_E2E = [
    { name: 'site-e2e', root: 'e2e', paths: ['e2e/tool-layout.spec.js'], tools: new Set(['tool-merge', 'tool-sign', 'tool-redact', 'tool-compress', 'tool-split', 'tool-security']) },
    { name: 'e2e-home', root: 'e2e/home', paths: ['e2e/home/'], tools: new Set(['tool-sign', 'tool-merge']) },
    { name: 'e2e-handoff', root: 'e2e/handoff', paths: ['e2e/handoff/'], tools: new Set(['tool-sign', 'tool-security']) },
    { name: 'e2e-cross-tool', root: 'e2e/cross-tool', paths: ['e2e/cross-tool/'], tools: new Set(['tool-merge', 'tool-split']) },
  ];
  const ALL_SITE_PATHS = SITE_E2E.flatMap((p) => p.paths);
  const IMPORTS2 = {
    'src/tools/merge/PdfMergeTool.tsx': ['src/lib/mergeOnly.ts'],
    'src/tools/security/PdfUnlockTool.tsx': ['src/lib/unlockOnly.ts'],
    'src/tools/split/PdfSplitTool.tsx': [],
    'src/tools/sign/PdfSignTool.tsx': [],
    'src/lib/mergeOnly.ts': [],
    'src/lib/unlockOnly.ts': [],
    'src/lib/mergeOnly.test.ts': ['src/lib/mergeOnly.ts'],
  };
  const graph = () => ({ ...graphOf(IMPORTS2), toolOf: makeToolOf(new Map([['/merge', 'merge'], ['/unlock', 'security'], ['/split', 'split'], ['/sign', 'sign']])) });
  const derive = (files, affected, extra = {}) => deriveScope({
    files, affected, roots: E2E_ROOTS, siteE2ePaths: ALL_SITE_PATHS, siteE2eProjects: SITE_E2E, loadReachGraph: graph, ...extra,
  });
  const paths = (scope) => scope.e2e_paths.split(' ').filter(Boolean).sort();

  it('a core change that reaches only Merge runs Merge and the site-wide directories that declare Merge', () => {
    const scope = derive(['src/lib/mergeOnly.ts'], ['lib', 'tool-merge', 'e2e-home', 'e2e-handoff', 'e2e-cross-tool', 'site-e2e']);
    expect(scope.everything).toBe(false);
    expect(paths(scope)).toEqual(['e2e/cross-tool/', 'e2e/home/', 'e2e/tool-layout.spec.js', 'src/tools/merge/e2e/']);
    expect(paths(scope)).not.toContain('e2e/handoff/');
  });

  it('a change that reaches only Unlock runs the handoff directory, not home or cross-tool', () => {
    const scope = derive(['src/lib/unlockOnly.ts'], ['lib', 'tool-security']);
    expect(paths(scope)).toEqual(['e2e/handoff/', 'e2e/tool-layout.spec.js', 'src/tools/security/e2e/']);
  });

  it('a directory that owns a changed file runs even if it declares no reached tool', () => {
    const scope = derive(['src/lib/mergeOnly.ts', 'e2e/handoff/new.spec.js'], ['lib', 'tool-merge', 'e2e-handoff']);
    expect(paths(scope)).toContain('e2e/handoff/');
  });

  it('a changed file outside src/ and outside a site-wide e2e root keeps every site-wide directory (no fail-narrow)', () => {
    const scope = derive(['src/lib/mergeOnly.ts', 'public/images/scan-guide/a.jpg'], ['lib', 'tool-merge']);
    expect(scope.everything).toBe(false);
    for (const p of ALL_SITE_PATHS) expect(paths(scope)).toContain(p);
  });

  it('a verdict that reaches no tool keeps every site-wide directory', () => {
    const scope = derive(['src/lib/mergeOnly.test.ts'], ['lib']);
    for (const p of ALL_SITE_PATHS) expect(paths(scope)).toContain(p);
  });

  it('without the project list the old floor holds: every site-wide path runs', () => {
    const scope = derive(['src/lib/mergeOnly.ts'], ['lib', 'tool-merge'], { siteE2eProjects: undefined });
    for (const p of ALL_SITE_PATHS) expect(paths(scope)).toContain(p);
  });

  it('with no core project, only the site-wide directories Nx lists as affected run', () => {
    const scope = derive(['e2e/home/new.spec.js'], ['e2e-home']);
    expect(scope.everything).toBe(false);
    expect(paths(scope)).toEqual(['e2e/home/']);
  });

  it('public/images has an owner: an image-only change runs every site-wide directory and no tool directory', () => {
    const scope = derive(['public/images/scan-guide/a.jpg'], []);
    expect(scope.everything).toBe(false);
    expect(scope.reason).not.toContain('unowned');
    expect(paths(scope)).toEqual([...ALL_SITE_PATHS].sort());
  });

  it('public/.well-known has an owner and no spec reads it: nothing runs in e2e', () => {
    const scope = derive(['public/.well-known/agent-skills/index.json'], []);
    expect(scope.everything).toBe(false);
    expect(paths(scope)).toEqual([]);
  });

  it('public/sw.js and the other loose files in public/ stay unowned: everything runs', () => {
    for (const file of ['public/sw.js', 'public/llms.txt', 'public/manifest.webmanifest']) {
      expect(derive([file], []).everything, file).toBe(true);
    }
  });
});

describe('siteE2eOwnPaths with tagged site-wide subdirectories (ARCH-34)', () => {
  it('a nested root tagged as site-wide is not a hole in site-e2e: its dir is listed by its own project', () => {
    const roots = new Map([['site-e2e', 'e2e'], ['e2e-home', 'e2e/home'], ['fonts', 'e2e/sign']]);
    const children = [{ name: 'home', isDirectory: true }, { name: 'sign', isDirectory: true }, { name: 'tool-layout.spec.js', isDirectory: false }, { name: 'project.json', isDirectory: false }];
    expect(siteE2eOwnPaths(children, roots)).toEqual(['e2e/tool-layout.spec.js']);
  });
});

describe('deriveScope: a core-project verdict narrowed by reachability (ARCH-32)', () => {
  const core = ['site', 'shell', 'editor', 'lib', 'tool-sign', 'tool-redact', 'tool-merge', 'site-e2e', 'export-guards', 'fonts'];
  const derive = (files, extra = {}) => deriveScope({
    files,
    affected: core,
    roots: ROOTS,
    siteE2ePaths: ['e2e/home/'],
    loadReachGraph: () => GRAPH,
    ...extra,
  });

  it('an src/editor/ change runs sign and redact plus the site-wide specs, and keeps the export guards', () => {
    const scope = derive(['src/editor/geometry.ts']);
    expect(scope.everything).toBe(false);
    expect(scope.e2e_paths).toBe('src/tools/redact/e2e/ src/tools/sign/e2e/ e2e/home/');
    expect(scope.export_guards).toBe(true);
    expect(scope.fonts).toBe(false);
    expect(scope.reason).toContain('narrowed by import reachability to redact, sign');
    expect(scope.reason).toContain('sign via src/editor/geometry.ts');
  });

  it('a lib file one tool imports runs only that tool', () => {
    const scope = derive(['src/lib/mergeOnly.ts']);
    expect(scope.everything).toBe(false);
    expect(scope.e2e_paths).toBe('src/tools/merge/e2e/ e2e/home/');
  });

  it('a file a non-tool page imports goes wide, naming the page', () => {
    const scope = derive(['src/lib/homeOnly.ts']);
    expect(scope.everything).toBe(true);
    expect(scope.reason).toContain('reaches src/pages/index.astro, which tool specs also visit');
  });

  it('a change under src/editor/text/ still turns the font guards on (the glob decides, not reachability)', () => {
    const graph = graphOf({ 'src/editor/text/fonts.js': [], 'src/tools/sign/PdfSignTool.tsx': ['src/editor/text/fonts.js'], 'src/pages/sign.astro': ['src/tools/sign/PdfSignTool.tsx'] });
    const scope = derive(['src/editor/text/fonts.js'], { loadReachGraph: () => ({ ...graph, toolOf }) });
    expect(scope.everything).toBe(false);
    expect(scope.fonts).toBe(true);
    expect(scope.e2e_paths).toBe('src/tools/sign/e2e/ e2e/home/');
  });

  it('a CSS change goes wide, with the reason, and keeps the glob-decided fonts value', () => {
    const scope = derive(['src/styles/global.css']);
    expect(scope.everything).toBe(true);
    expect(scope.fonts).toBe(false);
    expect(scope.reason).toContain('core project(s) affected: site, shell, editor, lib');
    expect(scope.reason).toContain('src/styles/global.css is not a source file the import graph knows');
  });

  it('a file the scanner cannot resolve goes wide', () => {
    expect(derive(['src/lib/brandNew.ts']).everything).toBe(true);
  });

  it('a change reaching a layout nothing live imports goes wide', () => {
    const scope = derive(['src/layouts/Orphan.astro']);
    expect(scope.everything).toBe(true);
    expect(scope.reason).toContain('has no importer to walk on');
  });

  it('a layout every tool page imports reaches every tool page, so it selects those tools', () => {
    const scope = derive(['src/layouts/ToolLayout.astro']);
    expect(scope.everything).toBe(false);
    expect(scope.e2e_paths).toBe('src/tools/merge/e2e/ src/tools/redact/e2e/ src/tools/sign/e2e/ e2e/home/');
  });

  it('goes wide with no graph supplied (the pure default), when the scan throws, and when no src/ file explains the verdict', () => {
    expect(derive(['src/editor/geometry.ts'], { loadReachGraph: null }).reason).toContain('no import graph supplied');
    const thrown = derive(['src/editor/geometry.ts'], { loadReachGraph: () => { throw new Error('boom'); } });
    expect(thrown.everything).toBe(true);
    expect(thrown.reason).toContain('import graph unavailable: boom');
    expect(derive(['e2e/home/handoff.spec.js']).reason).toContain('no src/ file explains the core verdict');
  });

  it('a file outside src/ riding along with an src/ change does not widen it', () => {
    const scope = derive(['src/lib/signHelper.ts', 'e2e/home/handoff.spec.js', 'scripts/check-push.mjs']);
    expect(scope.everything).toBe(false);
    expect(scope.e2e_paths).toBe('src/tools/sign/e2e/ e2e/home/');
  });

  it('the unowned-file and oracle rules still run first', () => {
    expect(derive(['src/editor/geometry.ts', 'package.json']).reason).toContain('unowned files: package.json');
    expect(derive(['src/editor/geometry.ts', 'scripts/import-graph.mjs']).reason).toContain('CI oracle changed: scripts/import-graph.mjs');
  });

  it('the import scan is part of the oracle: a change to it never narrows itself', () => {
    expect(ORACLE_FILES.has('scripts/import-graph.mjs')).toBe(true);
  });
});

describe('narrowByReachability on the real repo graph (ARCH-32 review fix)', () => {
  const real = buildReachGraph(process.cwd());
  const realReach = (f) => narrowByReachability({ changedFiles: [f], knownFiles: real.knownFiles, reverseEdges: real.reverseEdges, toolOf: makeToolOf(real.routeMap), siteE2ePaths: ['e2e/home/'] });

  it('site-lib files and the localized tool page go wide: tool specs start from the home page and /he/merge/', () => {
    // ARCH-33 split src/pages/[locale]/[tool].astro into one route per tool over a shared layout and loader.
    for (const f of ['src/site-lib/RecentFiles.tsx', 'src/site-lib/sampleDocument.ts', 'src/layouts/LocalizedToolLayout.astro', 'src/i18n/localizedToolPage.ts', 'src/pages/[locale]/merge.astro']) {
      expect(realReach(f).wide, f).toMatch(/which tool specs also visit|a spec the site-wide run does not cover/);
    }
  });

  it('a redact-only editor adapter still narrows to redact', () => {
    expect(realReach('src/editor/adapters/pdf/deleteObjects.js').tools).toEqual(['redact']);
  });
});
