import { describe, expect, it } from 'vitest';
import { fileCannotReachDist, reachesDist, planSteps, ALWAYS_GUARD_STEPS, DIST_GUARD_STEPS } from './check-push.mjs';
import { deriveScope } from './affected-scope.mjs';
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
    expect(reachesDist([])).toBe(false);
  });
});

describe('planSteps', () => {
  it('docs-only stops after the always-on guards, regardless of every other field', () => {
    const steps = planSteps({ docsOnly: true, everything: true, unit_paths: '', e2e_paths: '', fonts: true, export_guards: true, reachesDist: true });
    expect(steps).toEqual(ALWAYS_GUARD_STEPS);
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

  it('a sign *.test.* -only change: build still runs for Playwright, but the dist guards do not', () => {
    const files = ['src/tools/sign/PdfSignTool.test.tsx'];
    // Nx is directory-scoped: a test file still affects tool-sign (and, via
    // export-guards' own coarse dependency on tool-sign, export-guards too)
    // exactly like the source-only change above - only reachesDist differs.
    const scope = deriveScope({ files, affected: ['tool-sign', 'export-guards'], roots: ROOTS, toolE2eExists: () => true });
    expect(reachesDist(files)).toBe(false);
    const steps = planSteps({ ...scope, docsOnly: classify(files).docs_only, reachesDist: reachesDist(files) });
    expect(steps).toEqual([...ALWAYS_GUARD_STEPS, 'unit', 'typecheck', 'build', 'e2e:product', 'e2e:perf', 'e2e:export-guards']);
    expect(steps).not.toEqual(expect.arrayContaining(['test:csp']));
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

  it('an e2e-spec-only change: no build from reachesDist alone, but build still runs because e2e is selected', () => {
    const files = ['e2e/home/handoff.spec.js'];
    const scope = deriveScope({ files, affected: ['site-e2e'], roots: ROOTS, siteE2ePaths: ['e2e/home/'] });
    expect(scope.e2e_paths).toBe('e2e/home/');
    expect(reachesDist(files)).toBe(false);
    const steps = planSteps({ ...scope, docsOnly: false, reachesDist: false });
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
