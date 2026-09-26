#!/usr/bin/env node
// ARCH-29: one local pre-push command that runs exactly what CI would run for
// the current diff, instead of the whole ci.yml chain (48s alone, 104s under
// worktree contention, before build and e2e - see backlog/tasks/ARCH-27.md's
// Result). The oracle is the same one CI uses: scripts/affected-scope.mjs
// (which itself reuses scripts/change-scope.mjs). This file adds exactly one
// question neither of those answers - "does this diff touch anything that
// reaches dist/?" - and turns the combined answer into an ordered list of
// steps, stopping at the first failure.
//
// Scope is computed ONCE, against the merge-base of origin/main and HEAD,
// over the working tree (uncommitted + untracked files included, since an
// agent may run this before committing) - see resolveBase()/changedFiles()
// in change-scope.mjs, which affected-scope.mjs's resolveScope() already
// calls this same way. Every step below either calls a function exported
// from affected-scope.mjs (Nx-decided e2e/font/export scope) or
// scripts/unit-scope.mjs (ARCH-28: unit tests, by Vitest's own module graph,
// against that one already-resolved base) against a once-computed scope
// object, or runs the exact npm script ci.yml's `checks`/`build` jobs run -
// never a second narrowing decision.
//
// Usage: npm run check:push

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { resolveBase, changedFiles, classify, isDocsOnly } from './change-scope.mjs';
import { resolveScope, runE2eProduct, runE2ePerf, runFonts, runExportGuards } from './affected-scope.mjs';
import { resolveUnitScope, runUnitByImpact } from './unit-scope.mjs';
import { chooseTypecheck, runTypecheck } from './check-fast.mjs';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Does this diff touch anything that can reach dist/?
//
// This is deliberately an allowlist of what CANNOT reach dist/, not the
// other way around: an unrecognized path defaults to "reaches dist" (build
// runs), which is the safe direction per ARCH-29's own instructions - narrow
// only what's been verified against the real build. Every entry here was
// checked against `npm run build`'s actual command chain
// (scripts/generate-font-manifest.mjs --check, scripts/generate-language-
// acceptance.mjs --check, `astro build`, scripts/generate-precache-
// manifest.mjs) and astro.config.mjs, not inferred:
//
//   - isDocsOnly() (change-scope.mjs) covers backlog/**, docs/**, the exact
//     top-level docs files (README.md, TODO.md, BACKLOG.md, CLAUDE.md,
//     LICENSE), .claude/** and .impeccable/** - the same set CI's own
//     `build` job already skips on (`scope` job's docs_only output), so this
//     is reused evidence, not a new claim. THIRD_PARTY_LICENSES.md is
//     deliberately NOT docs-only (change-scope.mjs's own comment) because
//     `generate-font-manifest.mjs --check`, which `npm run build` runs as
//     its first step, reads and validates it - a change there must build.
//   - .github/** - workflow YAML; nothing in the build reads it.
//   - *.test.* files anywhere - Vitest specs; no production module imports a
//     `.test.` file (that would itself be a module-boundaries violation).
//   - src/test/** - the shared test-support/guard-test folder; never
//     imported by src/pages, src/content or any island.
//   - e2e/** and src/tools/*/e2e/** - Playwright specs; not under
//     src/pages, not a content collection, not imported by any bundled
//     module. Confirmed by grepping astro.config.mjs and every src/
//     import: nothing reaches into an e2e/ directory.
//   - scripts/** EXCEPT the handful `npm run build` actually invokes:
//     scripts/generate-font-manifest.mjs, scripts/generate-language-
//     acceptance.mjs and scripts/generate-precache-manifest.mjs (the three
//     named directly in package.json's "build" script) plus
//     scripts/buildId.mjs (imported by generate-precache-manifest.mjs and
//     read for every build to compute the service worker's cache id) - see
//     BUILD_INVOKED_SCRIPTS. Every other file under scripts/ (check-*.mjs,
//     generate:* scripts not on that list, spike/, fixtures/) runs only from
//     package.json's test:*/generate:*/check:* scripts or CI's own steps,
//     never from `npm run build` itself.
//
// Anything else - src/**, public/**, astro.config.mjs, package.json,
// vercel.json, tsconfig.json, middleware.ts, a brand-new root file this list
// has never seen - reaches dist by the default "unsure means build" rule.
const BUILD_INVOKED_SCRIPTS = new Set([
  'scripts/generate-font-manifest.mjs',
  'scripts/generate-language-acceptance.mjs',
  'scripts/generate-precache-manifest.mjs',
  'scripts/buildId.mjs',
]);

export function fileCannotReachDist(file) {
  if (isDocsOnly(file)) return true;
  if (file.startsWith('.github/')) return true;
  if (/\.test\.[^/]+$/.test(file)) return true;
  if (file.startsWith('src/test/')) return true;
  if (file.startsWith('e2e/')) return true;
  if (/^src\/tools\/[^/]+\/e2e\//.test(file)) return true;
  if (file.startsWith('scripts/')) return !BUILD_INVOKED_SCRIPTS.has(file);
  return false;
}

// No resolvable base or no changed files means we cannot tell what the diff
// touched, so fail open, the same direction affected-scope.mjs's wide() takes.
export function reachesDist(files) {
  if (files.length === 0) return true;
  return files.some((file) => !fileCannotReachDist(file));
}

// ---------------------------------------------------------------------------
// ARCH-31: a diff of only test files cannot change what a browser sees. Nx
// decides by folder, so a tool's unit test used to select that tool's e2e and
// every site-wide spec (measured: a `merge.test.js`-only change ran 67s of
// Playwright). When every non-docs file is a unit test (`*.test.*`) or a
// Playwright spec (`*.spec.*`), the unit tests run by impact as always and
// Playwright runs only the changed specs: the font guards and export guards
// only when one of their own specs changed (the globs mirror FONT_GUARDS and
// EXPORT_GUARDS in playwright.config.js). Anything else in the diff, a spec
// helper or fixture included, keeps the Nx verdict.
const isUnitTest = (f) => /\.test\.[^/]+$/.test(f);
const isSpec = (f) => /\.spec\.[^/]+$/.test(f);
const isFontGuardSpec = (f) => /(^|\/)sign\/[^/]+-(guard|parity)\.spec\.js$/.test(f);
const isExportGuardSpec = (f) => /(^|\/)export\/(export-render-guard|language-acceptance)\.spec\.js$/.test(f);

export function narrowTestOnlyChange(scope, files) {
  const code = files.filter((f) => !isDocsOnly(f));
  if (code.length === 0 || !code.every((f) => isUnitTest(f) || isSpec(f))) return scope;
  const specs = code.filter(isSpec);
  const productSpecs = specs.filter((f) => !isFontGuardSpec(f) && !isExportGuardSpec(f));
  return {
    ...scope,
    everything: false,
    e2e_paths: productSpecs.join(' '),
    fonts: specs.some(isFontGuardSpec),
    export_guards: specs.some(isExportGuardSpec),
    reason: specs.length ? `test files only: Playwright runs the ${specs.length} changed spec(s)` : 'unit test files only: no Playwright',
  };
}

// ARCH-31: Playwright reuses whatever listens on 4173 locally, and the port
// is machine-wide, so another worktree's preview means testing that
// worktree's build. `ownerCwd` is the listening process's working directory
// (null when the port is free, undefined when it could not be read).
export function portOwnerVerdict({ ownerCwd, root }) {
  if (ownerCwd === null) return 'free';
  if (ownerCwd === undefined) return 'unknown';
  return ownerCwd === root ? 'own' : 'foreign';
}

// ---------------------------------------------------------------------------
// The always-on cheap source guards: everything ci.yml's `checks` job runs
// besides the unit suite and typecheck (those two are scope-narrowed and
// docs_only-gated separately - see planSteps below), in the same order.
export const ALWAYS_GUARD_STEPS = [
  'check:backlog',
  'check:guidance',
  'test:editor-dependency-directions',
  'test:module-boundaries',
  'test:gesture-golden-rule',
  'test:detection-purity',
  'check-class-resolution',
  'test:fonts',
  'test:licenses',
  'test:dependency-governance',
];

// The dist guards ci.yml's `build` job runs after `astro build`, in order.
export const DIST_GUARD_STEPS = ['test:csp', 'test:seo', 'test:redirects', 'test:css', 'test:weight', 'test:lazy-modules'];

// ---------------------------------------------------------------------------
// The pure step-plan builder: given the one computed scope, decide the
// ordered list of steps to run, stopping early for a docs-only diff. `scope`
// carries both affected-scope.mjs's own fields (everything, unit_paths,
// e2e_paths, fonts, export_guards) and the two this file adds (docsOnly,
// reachesDist) - see scripts/check-push.test.mjs for the scenarios this
// covers.
// A docs-only diff runs what ci.yml's `scope` job runs for one, nothing more.
export const DOCS_ONLY_STEPS = ['check:backlog', 'check:guidance'];

export function planSteps({ docsOnly, everything, e2e_paths, fonts, export_guards, reachesDist: build }) {
  if (docsOnly) return [...DOCS_ONLY_STEPS];
  const steps = [...ALWAYS_GUARD_STEPS];

  steps.push('unit', 'typecheck');

  const e2eProductSelected = Boolean(everything) || Boolean(e2e_paths && e2e_paths.trim());
  // Playwright needs a build regardless of whether the diff reaches dist/ on
  // its own merits (ARCH-29 requirement 3) - so "build" is gated on either
  // reason, while the dist guards below stay gated on `build` (reachesDist)
  // alone, since they exist to check what a *source* change did to dist/.
  const buildNeeded = Boolean(build) || e2eProductSelected || Boolean(fonts) || Boolean(export_guards);
  if (buildNeeded) steps.push('build');
  if (build) steps.push(...DIST_GUARD_STEPS);
  if (e2eProductSelected) steps.push('e2e:product', 'e2e:perf');
  if (fonts) steps.push('e2e:fonts');
  if (export_guards) steps.push('e2e:export-guards');
  return steps;
}

// ---------------------------------------------------------------------------
// Everything below this line is I/O: git/npm/npx subprocesses, console
// output. Not unit tested, by design - reachesDist() and planSteps() above
// are the pure logic scripts/check-push.test.mjs pins.

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function isTreeDirty() {
  try {
    return git(['status', '--porcelain']).length > 0;
  } catch {
    return false;
  }
}

function runNpm(script) {
  return spawnSync('npm', ['run', script], { stdio: 'inherit', cwd: ROOT }).status ?? 1;
}

const STEP_RUNNERS = {
  'check-class-resolution': () => spawnSync('node', ['scripts/check-class-resolution.js'], { stdio: 'inherit', cwd: ROOT }).status ?? 1,
  build: () => runNpm('build'),
  'test:csp': () => runNpm('test:csp'),
  'test:seo': () => runNpm('test:seo'),
  'test:redirects': () => runNpm('test:redirects'),
  'test:css': () => runNpm('test:css'),
  'test:weight': () => runNpm('test:weight'),
  'test:lazy-modules': () => runNpm('test:lazy-modules'),
};
for (const script of ALWAYS_GUARD_STEPS) {
  if (!(script in STEP_RUNNERS)) STEP_RUNNERS[script] = () => runNpm(script);
}

function printScope({ base, dirty, scope, unitScope }) {
  const lines = [
    `check:push scope (base ${base ? base.slice(0, 7) : '(none)'})${dirty ? ' - working tree has uncommitted/untracked changes; scope includes them' : ''}:`,
    `  docs_only:      ${scope.docsOnly}`,
    `  everything:     ${scope.everything}  (${scope.reason})  [e2e/font/export scope, Nx-decided]`,
    // ARCH-28: unit selection is a separate mechanism (scripts/unit-scope.mjs,
    // Vitest's own module graph) from the Nx-decided everything/e2e_paths
    // above - a core-project (`everything: true`) verdict no longer implies
    // the unit step runs everything too.
    `  unit:           ${unitScope.all ? '(full suite)' : `${unitScope.seeds.length} seed(s): ${unitScope.seeds.join(' ')}`}`,
    `  unit_reason:    ${unitScope.reasons.join('; ')}`,
    `  e2e_paths:      ${scope.e2e_paths || (scope.everything ? '(full suite)' : '(none)')}`,
    `  fonts:          ${scope.fonts}`,
    `  export_guards:  ${scope.export_guards}`,
    `  build:          ${scope.reachesDist}  (reaches dist/? - see fileCannotReachDist's allowlist in this script)`,
  ];
  if (!scope.docsOnly) {
    lines.push(
      "  note: CI's own build job is ungated (it runs on any non-docs push); check:push narrows it",
      '        further with the reaches-dist rule above, so it is intentionally narrower than CI there.',
    );
  }
  console.error(lines.join('\n'));
}

function previewOwnerCwd() {
  const r = spawnSync('lsof', ['-ti', 'tcp:4173', '-sTCP:LISTEN'], { encoding: 'utf8' });
  const pid = r.status === 0 ? r.stdout.trim().split('\n')[0] : '';
  if (!pid) return null;
  const cwd = spawnSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8' });
  const line = (cwd.stdout || '').split('\n').find((l) => l.startsWith('n'));
  if (!line) return undefined;
  try {
    return realpathSync(line.slice(1));
  } catch {
    return undefined;
  }
}

function main() {
  const startAll = Date.now();
  const base = resolveBase(undefined);
  const dirty = isTreeDirty();
  const files = base ? changedFiles(base) : [];
  const docsOnly = classify(files).docs_only;
  const nxScope = resolveScope({ explicitBase: base ?? undefined });
  const unitScope = resolveUnitScope({ explicitBase: base ?? undefined });
  const build = reachesDist(files);

  const scope = narrowTestOnlyChange({ ...nxScope, docsOnly, reachesDist: build }, files);
  const typecheck = chooseTypecheck({ files: base ? files : null, astroTypesExist: existsSync(join(ROOT, '.astro', 'types.d.ts')) });
  printScope({ base, dirty, scope, unitScope });
  console.error(`  typecheck:      ${typecheck.tool} (${typecheck.reason}; CI always runs astro check)`);

  const steps = planSteps(scope);
  const timings = [];
  let failed = null;

  if (steps.some((id) => id.startsWith('e2e:'))) {
    const ownerCwd = previewOwnerCwd();
    const verdict = portOwnerVerdict({ ownerCwd, root: realpathSync(ROOT) });
    if (verdict === 'foreign' || verdict === 'unknown') {
      console.error(`check:push: port 4173 is held by ${verdict === 'foreign' ? ownerCwd : 'a process whose directory could not be read'}. Playwright would reuse it and test that build, not this worktree's. Run again once it is free.`);
      process.exit(1);
    }
    if (verdict === 'own') {
      console.error("check:push: this worktree's own preview is already on 4173; Playwright reuses it and it serves the dist/ the build step writes.");
    }
  }

  for (const id of steps) {
    const t0 = Date.now();
    let status;
    if (id === 'unit') status = runUnitByImpact(unitScope);
    else if (id === 'typecheck') status = runTypecheck(typecheck.tool);
    else if (id === 'e2e:product') status = runE2eProduct(scope);
    else if (id === 'e2e:perf') status = runE2ePerf(scope);
    else if (id === 'e2e:fonts') status = runFonts(scope);
    else if (id === 'e2e:export-guards') status = runExportGuards(scope);
    else status = STEP_RUNNERS[id]();
    const seconds = (Date.now() - t0) / 1000;
    timings.push({ id, seconds, status });
    console.error(`[check:push] ${id}: ${seconds.toFixed(1)}s${status === 0 ? '' : ` (exit ${status})`}`);
    if (status !== 0) {
      failed = id;
      break;
    }
  }

  const totalSeconds = (Date.now() - startAll) / 1000;
  console.error(`[check:push] total: ${totalSeconds.toFixed(1)}s across ${timings.length} step(s)${failed ? `, stopped at "${failed}"` : ''}`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main();
}
