import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { runStageWith, touchesAstro, fileCannotReachDist, reachesDist, planSteps, stageSteps, localScope, portOwnerVerdict, ALWAYS_GUARD_STEPS, DIST_GUARD_STEPS, DOCS_ONLY_STEPS, distGuardScripts } from './check-push.mjs';
import { deriveScope, wide, finishScope } from './affected-scope.mjs';
import { narrowTestOnlyChange } from './test-only-scope.mjs';
import { classify } from './change-scope.mjs';
import { readFileSync } from 'node:fs';

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

   The scope objects below are built the same way affected-scope.test.mjs
   in this folder pins deriveScope() itself: synthetic `files`/`affected`/`roots`
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

  it.each(['src/tools/sign/PdfSignTool.test.tsx', 'src/lib/text/format.test.js', 'scripts/affected-scope.test.mjs'])(
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
    expect(fileCannotReachDist('scripts/minifyServiceWorker.mjs')).toBe(false);
    expect(fileCannotReachDist('scripts/precacheClosure.mjs')).toBe(false);
    expect(reachesDist(['scripts/precacheClosure.mjs'])).toBe(true);
  });

  // QUAL-36: a script a dist guard runs is a dist input, derived from package.json.
  it.each([
    'scripts/verify-seo.js',
    'scripts/verify-csp.js',
    'scripts/check-page-weight.js',
    'scripts/check-precache-budget.mjs',
    'scripts/check-trailing-slash-redirects.js',
    'scripts/check-lazy-modules.js',
    'scripts/check-class-resolution.js',
    'scripts/check-color-literals.mjs',
    'scripts/check-editor-global-css.js',
    'scripts/check-dead-utilities.js',
    'scripts/check-css-duplication.js',
    'scripts/check-built-html-comments.js',
    'scripts/check-animation-shorthand.js',
  ])('%s is run by a dist guard, so it reaches dist', (file) => {
    expect(reachesDist([file])).toBe(true);
  });

  it('a new dist guard script and its relative import count with no list edited', () => {
    const pkg = JSON.stringify({ scripts: { 'test:new': 'node scripts/new-guard.mjs --flag', build: 'node scripts/a.mjs' } });
    const files = { 'scripts/new-guard.mjs': "import { x } from './helper.mjs';", 'scripts/helper.mjs': 'export const x = 1;' };
    const scripts = distGuardScripts(pkg, (rel) => files[rel] ?? null, ['test:new']);
    expect(reachesDist(['scripts/new-guard.mjs'], scripts)).toBe(true);
    expect(reachesDist(['scripts/helper.mjs'], scripts)).toBe(true);
    expect(reachesDist(['scripts/unrelated.mjs'], scripts)).toBe(false);
  });

  // QUAL-36: a JSON data file a dist guard reads is not a script, so it fails open.
  it.each(['scripts/ratchet-limits.json', 'scripts/css-module-class-allowlist.json', 'scripts/color-literal-allowlist.json'])(
    '%s is guard data, so it reaches dist',
    (file) => {
      expect(reachesDist([file])).toBe(true);
    },
  );

  it.each(DIST_GUARD_STEPS)('dist guard step %s contributes a script to distGuardScripts (a bare `npm run x` would not be followed)', (step) => {
    const pkg = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const read = (rel) => {
      try {
        return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
      } catch {
        return null;
      }
    };
    expect(distGuardScripts(pkg, read, [step]).size).toBeGreaterThan(0);
  });

  it('a script no build step and no dist guard runs still cannot reach dist', () => {
    expect(reachesDist(['scripts/ci-narrowing-report.mjs'])).toBe(false);
  });

  it.each(['vercel.json', 'package.json', 'astro.config.mjs', 'middleware.ts', 'src/lib/text/format.js', 'public/fonts/Kalam-Regular.ttf'])(
    '%s reaches dist (not on the allowlist - the safe default)',
    (file) => {
      expect(fileCannotReachDist(file)).toBe(false);
    },
  );

  it('reachesDist is true when ANY file in the diff reaches dist, even mixed with docs', () => {
    expect(reachesDist(['backlog/tasks/ARCH-29.md', 'src/lib/text/format.js'])).toBe(true);
    expect(reachesDist(['backlog/tasks/ARCH-29.md', 'docs/x.md'])).toBe(false);
    expect(reachesDist([])).toBe(false); // empty diff: guards only (QUAL-24)
  });
});

describe('planSteps', () => {
  it('docs-only runs only what CI runs for a docs-only push, regardless of every other field', () => {
    const steps = planSteps({ docsOnly: true, everything: true, e2e_paths: '', fonts: true, export_guards: true, reachesDist: true });
    expect(steps).toEqual(DOCS_ONLY_STEPS);
  });

  it('an empty diff runs no build and no dist guards (QUAL-24)', () => {
    const files = [];
    const steps = planSteps({ ...wide([], 'no usable base'), docsOnly: classify(files).docs_only, reachesDist: reachesDist(files) });
    expect(steps).not.toContain('build');
    for (const g of DIST_GUARD_STEPS) expect(steps).not.toContain(g);
    expect(steps).toEqual(expect.arrayContaining(ALWAYS_GUARD_STEPS));
  });

  it('a diff reaching an .astro file also plans astro check (QUAL-31); one without does not', () => {
    const astro = ['src/layouts/BaseLayout.astro'];
    const ts = ['src/lib/telemetry/errorReport.ts'];
    const plan = (files) => planSteps({ ...wide([], 'x'), docsOnly: false, reachesDist: reachesDist(files), touchesAstro: touchesAstro(files) });
    expect(plan(astro)).toContain('astro-check');
    expect(plan(ts)).not.toContain('astro-check');
  });

  it('the ratchet guards run on every diff (ARCH-76)', () => {
    expect(ALWAYS_GUARD_STEPS).toEqual(expect.arrayContaining(['test:ratchet-raises', 'test:size-ratchet']));
  });

  it('a scripts-only diff (tooling, no build script touched): unit + typecheck, no build, no e2e', () => {
    const files = ['scripts/generate-backlog.mjs'];
    const scope = deriveScope({ files, affected: ['tooling'], roots: ROOTS });
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
    const files = ['backlog/tasks/ARCH-29.md', 'src/lib/text/format.js'];
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
    ]);
  });

  it('a vercel.json change: no e2e (QUAL-34), but it reaches dist, so the build and dist guards run', () => {
    const files = ['vercel.json'];
    const scope = deriveScope({ files, affected: [], roots: ROOTS });
    expect(scope.everything).toBe(false);
    expect(reachesDist(files)).toBe(true);
    const steps = planSteps({ ...scope, docsOnly: false, reachesDist: true });
    expect(steps).toEqual([
      ...ALWAYS_GUARD_STEPS,
      'unit',
      'typecheck',
      'build',
      ...DIST_GUARD_STEPS,
    ]);
    expect(planSteps({ ...scope, docsOnly: false, reachesDist: true }, { mode: 'e2e' })).not.toContain('e2e:product');
  });

  it('an e2e-spec-only change: build runs for Playwright, which runs only that spec', () => {
    const files = ['e2e/home/handoff.spec.js'];
    const nx = deriveScope({ files, affected: ['site-e2e'], roots: ROOTS, siteE2ePaths: ['e2e/home/'] });
    expect(reachesDist(files)).toBe(false);
    const scope = narrowTestOnlyChange({ ...nx, docsOnly: false, reachesDist: false }, files);
    expect(scope.e2e_paths).toBe('e2e/home/handoff.spec.js');
    const steps = planSteps(scope);
    expect(steps).toEqual([...ALWAYS_GUARD_STEPS, 'unit', 'typecheck']);
    expect(planSteps(scope, { mode: 'e2e' })).toEqual(['build', 'e2e:product']);
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
    ]);
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

describe('check:e2e mode and stages', () => {
  const wideScope = { docsOnly: false, everything: true, e2e_paths: '', fonts: true, export_guards: true, reachesDist: true };

  it('e2e mode is the build plus the selected Playwright projects, no guards, perf only on request', () => {
    expect(planSteps(wideScope, { mode: 'e2e' })).toEqual(['build', 'e2e:product', 'e2e:fonts', 'e2e:export-guards']);
    expect(planSteps(wideScope, { mode: 'e2e', perf: true })).toEqual(['build', 'e2e:product', 'e2e:perf', 'e2e:fonts', 'e2e:export-guards']);
  });

  it('e2e mode runs nothing when no Playwright project is selected, or for a docs-only diff', () => {
    expect(planSteps({ ...wideScope, everything: false, fonts: false, export_guards: false }, { mode: 'e2e' })).toEqual([]);
    expect(planSteps({ ...wideScope, docsOnly: true }, { mode: 'e2e' })).toEqual([]);
  });

  it('the gate never includes Playwright', () => {
    expect(planSteps(wideScope).some((id) => id.startsWith('e2e:'))).toBe(false);
  });

  it('astro-check runs alone, in a stage before the build (both write .astro/) (QUAL-31)', () => {
    const stages = stageSteps(planSteps({ ...wideScope, touchesAstro: true }));
    const checkAt = stages.findIndex((stage) => stage.includes('astro-check'));
    const buildAt = stages.findIndex((stage) => stage.includes('build'));
    expect(stages[checkAt]).toEqual(['astro-check']);
    expect(checkAt).toBeGreaterThan(stages.findIndex((stage) => stage.includes('typecheck')));
    expect(checkAt).toBeLessThan(buildAt);
  });

  it('stages: independent steps together, dist guards after the build, each Playwright step alone', () => {
    const stages = stageSteps(planSteps(wideScope));
    expect(stages).toEqual([[...ALWAYS_GUARD_STEPS, 'unit', 'typecheck', 'build'], DIST_GUARD_STEPS]);
    expect(stageSteps(planSteps(wideScope, { mode: 'e2e' }))).toEqual([['build'], ['e2e:product'], ['e2e:fonts'], ['e2e:export-guards']]);
  });
});

/* runStageWith(): a failed step kills its still-running siblings, and each
   killed child still fires `close` (with a signal). The stage must resolve
   once the last child has closed, killed or not; before, a killed last child
   returned early, the promise never settled, and `check:push` exited 0 on a
   failed build. */
describe('runStageWith', () => {
  const fakeSpawn = () => {
    const children = new Map();
    const spawnStep = (id) => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
      children.set(id, child);
      return child;
    };
    return { children, spawnStep };
  };
  const quiet = () => {};
  const settled = (promise) => Promise.race([promise, new Promise((r) => setTimeout(() => r('unsettled'), 200))]);

  it('resolves failed when a step fails while a sibling is still running, and the killed sibling closes last', async () => {
    const { children, spawnStep } = fakeSpawn();
    const stage = runStageWith(['build', 'unit'], { spawnStep, limit: 4, log: quiet });
    children.get('build').emit('close', 1, null);
    const r = await settled(stage);
    expect(r).not.toBe('unsettled');
    expect(r.failed).toBe(true);
    expect(r.results.map((t) => [t.id, t.status])).toEqual([['build', 1]]);
  });

  it('resolves clean once every step passes', async () => {
    const { children, spawnStep } = fakeSpawn();
    const stage = runStageWith(['a', 'b'], { spawnStep, limit: 4, log: quiet });
    children.get('a').emit('close', 0, null);
    children.get('b').emit('close', 0, null);
    const r = await settled(stage);
    expect(r.failed).toBe(false);
    expect(r.results).toHaveLength(2);
  });

  it('starts queued steps as slots free up, and starts none after a failure', async () => {
    const { children, spawnStep } = fakeSpawn();
    const stage = runStageWith(['a', 'b', 'c'], { spawnStep, limit: 1, log: quiet });
    expect([...children.keys()]).toEqual(['a']);
    children.get('a').emit('close', 1, null);
    const r = await settled(stage);
    expect(r.failed).toBe(true);
    expect([...children.keys()]).toEqual(['a']);
  });
});

describe('check:push and CI share the test-only scope (QUAL-35)', () => {
  const files = ['src/tools/merge/merge.test.js', 'src/tools/merge/e2e/merge-grid.spec.js'];
  const nx = () => deriveScope({ files: ['src/lib/x.js'], affected: ['lib'], roots: ROOTS });

  it('CI narrows to the changed spec and check:push keeps exactly that verdict', () => {
    const ci = finishScope(nx(), files);
    expect(ci).toMatchObject({ everything: false, e2e_paths: 'src/tools/merge/e2e/merge-grid.spec.js', fonts: false, export_guards: false });
    const local = localScope(ci, files, false);
    for (const key of ['everything', 'e2e_paths', 'fonts', 'export_guards']) expect(local[key]).toBe(ci[key]);
  });

  it('check:push never applies the narrowing itself', () => {
    expect(readFileSync(new URL('./check-push.mjs', import.meta.url), 'utf8')).not.toMatch(/narrowTestOnlyChange/);
  });

  it('resolveScope, which CI and check:push both call, ends with finishScope', () => {
    expect(readFileSync(new URL('./affected-scope.mjs', import.meta.url), 'utf8')).toMatch(/return finishScope\(deriveScope\(/);
  });
});
