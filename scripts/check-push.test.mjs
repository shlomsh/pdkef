import { describe, expect, it } from 'vitest';
import { fileCannotReachDist, reachesDist, planSteps, narrowTestOnlyChange, portOwnerVerdict, ALWAYS_GUARD_STEPS, DIST_GUARD_STEPS, DOCS_ONLY_STEPS } from './check-push.mjs';
import { deriveScope, wide } from './affected-scope.mjs';
import { classify } from './change-scope.mjs';

/* scripts/check-push.mjs (ARCH-29) computes the CI oracle's scope once (base:
   the merge-base of origin/main and HEAD; files: the working tree against
   that base, uncommitted and untracked included) and turns it into an
   ordered list of steps. The two pure pieces pinned here:

     - fileCannotReachDist()/reachesDist(): does this diff touch anything
       `npm run build` can see? An explicit allowlist of what CANNOT, checked
       against the real build chain (this file's own header comment carries
       the evidence per entry) - anything unrecognized defaults to "reaches
       dist" (build runs), the safe direction.

     - planSteps(): given the combined scope (affected-scope.mjs's own
       fields plus docsOnly and reachesDist), which steps run and in what
       order, stopping early for a docs-only diff.

   The scope objects below are built the same way scripts/affected-scope.
   test.mjs pins deriveScope() itself: synthetic `files`/`affected`/`roots`
   inputs, no real git or nx call - see that file for the ROOTS fixture this
   one borrows a subset of. */

const ROOTS = new Map([
  ['site', 'src'],
  ['shell', 'src/shell'],
  ['editor', 'src/editor'],
  ['editor-ui', 'src/editor-ui'],
  ['lib', 'src/lib'],
  ['tool-sign', 'src/tools/sign'],
  ['tool-merge', 'src/tools/merge'],
  ['site-e2e', 'e2e'],
  ['fonts', 'e2e/sign'],
  ['export-guards', 'e2e/export'],
  ['cross-tool-tests', 'src/test/cross-tool'],
  ['site-test', 'src/test'],
  ['tooling', 'scripts'],
]);

describe('fileCannotReachDist / reachesDist', () => {
  it.each([
    'backlog/tasks/ARCH-29.md',
    'docs/seo-competitive-findings.md',
    'BACKLOG.md',
    'TODO.md',
    'README.md',
    'CLAUDE.md',
    'LICENSE',
    '.claude/rules/tests.md',
  ])('%s cannot reach dist (docs-only, reused from change-scope.mjs)', (file) => {
    expect(fileCannotReachDist(file)).toBe(true);
  });

  // change-scope.mjs deliberately excludes this one from docs-only: `npm run
  // build`'s first step (generate-font-manifest.mjs --check) reads and
  // validates it, so a change here must build.
  it('THIRD_PARTY_LICENSES.md DOES reach dist - the build itself reads it', () => {
    expect(fileCannotReachDist('THIRD_PARTY_LICENSES.md')).toBe(false);
  });

  it('.github/** cannot reach dist', () => {
    expect(fileCannotReachDist('.github/workflows/ci.yml')).toBe(true);
  });

  it.each(['src/tools/sign/PdfSignTool.test.tsx', 'src/lib/format.test.js', 'scripts/affected-scope.test.mjs'])(
    '%s (a *.test.* file) cannot reach dist',
    (file) => {
      expect(fileCannotReachDist(file)).toBe(true);
    },
  );

  it('src/test/** cannot reach dist', () => {
    expect(fileCannotReachDist('src/test/cross-tool/textCoverage.test.js')).toBe(true);
  });

  it('e2e/** and a tool\'s own e2e/ specs cannot reach dist', () => {
    expect(fileCannotReachDist('e2e/home/handoff.spec.js')).toBe(true);
    expect(fileCannotReachDist('src/tools/sign/e2e/sign-editor.spec.js')).toBe(true);
  });

  it('scripts/** cannot reach dist, except the handful npm run build actually invokes', () => {
    expect(fileCannotReachDist('scripts/check-push.mjs')).toBe(true);
    expect(fileCannotReachDist('scripts/affected-scope.mjs')).toBe(true);
    expect(fileCannotReachDist('scripts/generate-font-manifest.mjs')).toBe(false);
    expect(fileCannotReachDist('scripts/generate-language-acceptance.mjs')).toBe(false);
    expect(fileCannotReachDist('scripts/generate-precache-manifest.mjs')).toBe(false);
    expect(fileCannotReachDist('scripts/buildId.mjs')).toBe(false);
  });

  it.each(['vercel.json', 'package.json', 'astro.config.mjs', 'middleware.ts', 'src/lib/format.js', 'public/fonts/Kalam-Regular.ttf'])(
    '%s reaches dist (not on the allowlist - the safe default)',
    (file) => {
      expect(fileCannotReachDist(file)).toBe(false);
    },
  );

  it('reachesDist is true when ANY file in the diff reaches dist, even mixed with docs', () => {
    expect(reachesDist(['backlog/tasks/ARCH-29.md', 'src/lib/format.js'])).toBe(true);
    expect(reachesDist(['backlog/tasks/ARCH-29.md', 'docs/x.md'])).toBe(false);
    expect(reachesDist([])).toBe(true); // no base or no diff: fail open
  });
});

describe('planSteps', () => {
  it('docs-only runs only what CI runs for a docs-only push, regardless of every other field', () => {
    const steps = planSteps({ docsOnly: true, everything: true, unit_paths: '', e2e_paths: '', fonts: true, export_guards: true, reachesDist: true });
    expect(steps).toEqual(DOCS_ONLY_STEPS);
  });

  it('no resolvable base (empty file list) fails open: build and every dist guard run', () => {
    const files = [];
    const steps = planSteps({ ...wide([], 'no usable base'), docsOnly: classify(files).docs_only, reachesDist: reachesDist(files) });
    expect(steps).toEqual(expect.arrayContaining(['unit', 'typecheck', 'build', ...DIST_GUARD_STEPS, 'e2e:product']));
  });

  it('a scripts-only diff (tooling, no build script touched): unit + typecheck, no build, no e2e', () => {
    const files = ['scripts/generate-backlog.mjs'];
    const scope = deriveScope({ files, affected: ['tooling'], roots: ROOTS });
    expect(scope.unit_paths).toBe('scripts/ src/test/');
    const steps = planSteps({ ...scope, docsOnly: classify(files).docs_only, reachesDist: reachesDist(files) });
    expect(steps).toEqual([...ALWAYS_GUARD_STEPS, 'unit', 'typecheck']);
  });

  it('a src/tools/sign/ source change: reaches dist and its own e2e/export-guards are selected', () => {
    const files = ['src/tools/sign/PdfSignTool.tsx'];
    const scope = deriveScope({ files, affected: ['tool-sign', 'export-guards'], roots: ROOTS, toolE2eExists: () => true });
    expect(scope.export_guards).toBe(true);
    expect(scope.fonts).toBe(false);
    const steps = planSteps({ ...scope, docsOnly: classify(files).docs_only, reachesDist: reachesDist(files) });
    expect(steps).toEqual([
      ...ALWAYS_GUARD_STEPS,
      'unit',
      'typecheck',
      'build',
      ...DIST_GUARD_STEPS,
      'e2e:product',
      'e2e:perf',
      'e2e:export-guards',
    ]);
  });

  it('a sign *.test.* -only change (ARCH-31): unit tests only, no build, no Playwright', () => {
    const files = ['src/tools/sign/PdfSignTool.test.tsx'];
    // Nx is directory-scoped: the test file still affects tool-sign and,
    // through its coarse edge, export-guards. narrowTestOnlyChange drops both.
    const nx = deriveScope({ files, affected: ['tool-sign', 'export-guards'], roots: ROOTS, toolE2eExists: () => true });
    const scope = narrowTestOnlyChange({ ...nx, docsOnly: classify(files).docs_only, reachesDist: reachesDist(files) }, files);
    expect(planSteps(scope)).toEqual([...ALWAYS_GUARD_STEPS, 'unit', 'typecheck']);
  });

  it('a backlog + src/lib mix: docs_only is false (not every file is docs) and the core project widens to everything', () => {
    const files = ['backlog/tasks/ARCH-29.md', 'src/lib/format.js'];
    expect(classify(files).docs_only).toBe(false);
    const scope = deriveScope({ files, affected: ['lib'], roots: ROOTS });
    expect(scope.everything).toBe(true);
    expect(scope.fonts).toBe(false); // ARCH-23: core-widening no longer force-runs the font guards
    expect(scope.export_guards).toBe(true); // wide() always runs the two cheap export guards
    const steps = planSteps({ ...scope, docsOnly: false, reachesDist: reachesDist(files) });
    expect(steps).toEqual([
      ...ALWAYS_GUARD_STEPS,
      'unit',
      'typecheck',
      'build',
      ...DIST_GUARD_STEPS,
      'e2e:product',
      'e2e:perf',
      'e2e:export-guards',
    ]);
  });

  it('a vercel.json change: unowned by any project, everything runs and it reaches dist', () => {
    const files = ['vercel.json'];
    const scope = deriveScope({ files, affected: [], roots: ROOTS });
    expect(scope.everything).toBe(true);
    expect(reachesDist(files)).toBe(true);
    const steps = planSteps({ ...scope, docsOnly: false, reachesDist: true });
    expect(steps).toEqual([
      ...ALWAYS_GUARD_STEPS,
      'unit',
      'typecheck',
      'build',
      ...DIST_GUARD_STEPS,
      'e2e:product',
      'e2e:perf',
      'e2e:fonts',
      'e2e:export-guards',
    ]);
  });

  it('an e2e-spec-only change: build runs for Playwright, which runs only that spec', () => {
    const files = ['e2e/home/handoff.spec.js'];
    const nx = deriveScope({ files, affected: ['site-e2e'], roots: ROOTS, siteE2ePaths: ['e2e/home/'] });
    expect(reachesDist(files)).toBe(false);
    const scope = narrowTestOnlyChange({ ...nx, docsOnly: false, reachesDist: false }, files);
    expect(scope.e2e_paths).toBe('e2e/home/handoff.spec.js');
    const steps = planSteps(scope);
    expect(steps).toEqual([...ALWAYS_GUARD_STEPS, 'unit', 'typecheck', 'build', 'e2e:product', 'e2e:perf']);
    expect(steps).not.toEqual(expect.arrayContaining(['test:csp', 'e2e:fonts', 'e2e:export-guards']));
  });

  it('an unknown root file: unowned, everything runs, and it reaches dist', () => {
    const files = ['some-new-root-file.config.mjs'];
    const scope = deriveScope({ files, affected: [], roots: ROOTS });
    expect(scope.everything).toBe(true);
    expect(reachesDist(files)).toBe(true);
    const steps = planSteps({ ...scope, docsOnly: false, reachesDist: true });
    expect(steps).toEqual([
      ...ALWAYS_GUARD_STEPS,
      'unit',
      'typecheck',
      'build',
      ...DIST_GUARD_STEPS,
      'e2e:product',
      'e2e:perf',
      'e2e:fonts',
      'e2e:export-guards',
    ]);
  });
});

describe('narrowTestOnlyChange (ARCH-31)', () => {
  const wideScope = { everything: true, e2e_paths: '', fonts: true, export_guards: true, reason: 'core' };

  it('leaves the scope alone when any non-test file changed', () => {
    const files = ['src/tools/merge/merge.test.js', 'src/tools/merge/merge.js'];
    expect(narrowTestOnlyChange(wideScope, files)).toBe(wideScope);
  });

  it('leaves the scope alone for a spec helper or fixture, which is not a spec', () => {
    const files = ['e2e/sign/fixtures/shapingGuardHarness.js', 'e2e/sign/hebrew-guard.spec.js'];
    expect(narrowTestOnlyChange(wideScope, files)).toBe(wideScope);
  });

  it('leaves an empty or docs-only diff to the existing rules', () => {
    expect(narrowTestOnlyChange(wideScope, [])).toBe(wideScope);
    expect(narrowTestOnlyChange(wideScope, ['docs/x.md'])).toBe(wideScope);
  });

  it('unit tests plus docs select no Playwright at all', () => {
    const scope = narrowTestOnlyChange(wideScope, ['src/lib/format.test.js', 'backlog/tasks/ARCH-31.md', 'scripts/check-push.test.mjs']);
    expect(scope).toMatchObject({ everything: false, e2e_paths: '', fonts: false, export_guards: false });
  });

  it('a font guard spec runs the font guards, an export guard spec the export guards, nothing else', () => {
    expect(narrowTestOnlyChange(wideScope, ['e2e/sign/hebrew-guard.spec.js'])).toMatchObject({ e2e_paths: '', fonts: true, export_guards: false });
    expect(narrowTestOnlyChange(wideScope, ['e2e/sign/noto-parity.spec.js'])).toMatchObject({ e2e_paths: '', fonts: true });
    expect(narrowTestOnlyChange(wideScope, ['e2e/export/export-render-guard.spec.js'])).toMatchObject({ e2e_paths: '', fonts: false, export_guards: true });
  });

  it('a tool spec plus a unit test runs just that spec', () => {
    const scope = narrowTestOnlyChange(wideScope, ['src/tools/merge/e2e/merge-share.spec.js', 'src/tools/merge/merge.test.js']);
    expect(scope).toMatchObject({ everything: false, e2e_paths: 'src/tools/merge/e2e/merge-share.spec.js', fonts: false, export_guards: false });
  });
});

describe('portOwnerVerdict (ARCH-31)', () => {
  const root = '/w/arch-31';
  it('free, own, foreign, unknown', () => {
    expect(portOwnerVerdict({ ownerCwd: null, root })).toBe('free');
    expect(portOwnerVerdict({ ownerCwd: root, root })).toBe('own');
    expect(portOwnerVerdict({ ownerCwd: '/w/sng15-land', root })).toBe('foreign');
    expect(portOwnerVerdict({ ownerCwd: undefined, root })).toBe('unknown');
  });
});
