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
// Usage: npm run check:push          guards + unit + typecheck + build + dist
//                                     guards, concurrently where independent;
//                                     no Playwright
//        npm run check:e2e [-- --perf]  the build and the Playwright projects
//                                     the diff selects, chromium only; perf
//                                     (wall-clock budgets) only with --perf

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
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
// Playwright spec (`*.spec.js`), the unit tests run by impact as always and
// Playwright runs only the changed specs: the font guards and export guards
// only when one of their own specs changed (the globs mirror FONT_GUARDS and
// EXPORT_GUARDS in playwright.config.js). Anything else in the diff, a spec
// helper or fixture included, keeps the Nx verdict.
const isUnitTest = (f) => /\.test\.[^/]+$/.test(f);
// Only `.spec.js`: Playwright's testMatch discovers nothing else, so any other
// `.spec.*` keeps the Nx verdict rather than narrowing to a spec that never runs.
const isSpec = (f) => /\.spec\.js$/.test(f);
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

// ARCH-31: Playwright reuses whatever listens on its port (4173, or
// PLAYWRIGHT_PORT) locally, and the port
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
  'check:never-say',
  'test:editor-dependency-directions',
  'test:module-boundaries',
  'test:gesture-golden-rule',
  'test:swallowed-errors',
  'test:navigating-away',
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

// Two modes. 'gate' (the default, `check:push`) is everything but Playwright:
// guards, unit, typecheck, build and the dist guards. 'e2e' (`check:e2e`) is
// the build Playwright needs plus the scoped Playwright projects, nothing
// else. CI runs the full Playwright suite either way; locally it is opt-in so
// a pre-push gate stays short enough for any agent. `perf` is opt-in too: it
// runs alone on one worker and asserts wall-clock budgets.
export function planSteps({ docsOnly, everything, e2e_paths, fonts, export_guards, reachesDist: build }, { mode = 'gate', perf = false } = {}) {
  if (docsOnly) return mode === 'gate' ? [...DOCS_ONLY_STEPS] : [];
  const e2eProductSelected = Boolean(everything) || Boolean(e2e_paths && e2e_paths.trim());
  const e2eSelected = e2eProductSelected || Boolean(fonts) || Boolean(export_guards);

  if (mode === 'e2e') {
    if (!e2eSelected) return [];
    const steps = ['build'];
    if (e2eProductSelected) steps.push('e2e:product');
    if (e2eProductSelected && perf) steps.push('e2e:perf');
    if (fonts) steps.push('e2e:fonts');
    if (export_guards) steps.push('e2e:export-guards');
    return steps;
  }

  const steps = [...ALWAYS_GUARD_STEPS, 'unit', 'typecheck'];
  if (build) steps.push('build', ...DIST_GUARD_STEPS);
  return steps;
}

// Which stages run together. Everything in a stage is independent of the rest
// of it: guards, unit, typecheck and build all read the tree and write nothing
// the others read; the dist guards need the build; Playwright steps share one
// preview port and one dist/, so they run one after another.
export function stageSteps(steps) {
  const dist = new Set(DIST_GUARD_STEPS);
  const stages = [
    steps.filter((id) => !dist.has(id) && !id.startsWith('e2e:')),
    steps.filter((id) => dist.has(id)),
    ...steps.filter((id) => id.startsWith('e2e:')).map((id) => [id]),
  ];
  return stages.filter((stage) => stage.length > 0);
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

// The port Playwright will use: playwright.config.js reads PLAYWRIGHT_PORT
// the same way, so the guard checks the port the run will actually reuse.
const PREVIEW_PORT = Number(process.env.PLAYWRIGHT_PORT || 4173);

function previewOwnerCwd() {
  const r = spawnSync('lsof', ['-ti', `tcp:${PREVIEW_PORT}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
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

// One step, run synchronously with inherited stdio. The parent spawns this
// script once per step (`--step <id>`) so a stage can run steps concurrently
// without any runner needing an async twin.
function runStep(id, { scope, unitScope, typecheck }) {
  if (id === 'unit') return runUnitByImpact(unitScope);
  if (id === 'typecheck') return runTypecheck(typecheck.tool);
  // Locally Playwright runs chromium only; webkit is CI's.
  if (id === 'e2e:product') return runE2eProduct(scope, ['chromium']);
  if (id === 'e2e:perf') return runE2ePerf(scope);
  if (id === 'e2e:fonts') return runFonts(scope);
  if (id === 'e2e:export-guards') return runExportGuards(scope);
  return STEP_RUNNERS[id]();
}

function computeScope() {
  const base = resolveBase(undefined);
  const dirty = isTreeDirty();
  const files = base ? changedFiles(base) : [];
  const docsOnly = classify(files).docs_only;
  const nxScope = resolveScope({ explicitBase: base ?? undefined });
  const unitScope = resolveUnitScope({ explicitBase: base ?? undefined });
  const scope = narrowTestOnlyChange({ ...nxScope, docsOnly, reachesDist: reachesDist(files) }, files);
  const typecheck = chooseTypecheck({ files: base ? files : null, astroTypesExist: existsSync(join(ROOT, '.astro', 'types.d.ts')) });
  return { base, dirty, scope, unitScope, typecheck };
}

// Run one stage's steps concurrently (bounded by the CPU count), buffering each
// step's output and printing it only for a failure. The first failure kills
// the rest of the stage.
function runStage(ids, passthroughArgs) {
  return new Promise((resolve) => {
    const queue = [...ids];
    const results = [];
    const running = new Set();
    let failed = false;
    const limit = Math.max(2, availableParallelism());
    const pump = () => {
      while (!failed && running.size < limit && queue.length > 0) {
        const id = queue.shift();
        const t0 = Date.now();
        const child = spawn('node', [fileURLToPath(import.meta.url), '--step', id, ...passthroughArgs], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (out += d));
        running.add(child);
        child.on('close', (code, signal) => {
          running.delete(child);
          if (signal && failed) return;
          const seconds = (Date.now() - t0) / 1000;
          results.push({ id, seconds, status: code ?? 1 });
          console.error(`[check:push] ${id}: ${seconds.toFixed(1)}s${code === 0 ? '' : ` (exit ${code})`}`);
          if (code !== 0 && !failed) {
            failed = true;
            console.error(`\n--- ${id} output ---\n${out}`);
            for (const other of running) other.kill();
          }
          if (running.size === 0 && (queue.length === 0 || failed)) resolve({ results, failed });
          else pump();
        });
      }
    };
    pump();
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv.includes('--e2e') ? 'e2e' : 'gate';
  const perf = argv.includes('--perf');
  const passthrough = argv.filter((a) => a === '--e2e' || a === '--perf');
  const ctx = computeScope();

  const stepIndex = argv.indexOf('--step');
  if (stepIndex !== -1) process.exit(runStep(argv[stepIndex + 1], ctx));

  const startAll = Date.now();
  const { base, dirty, scope, unitScope, typecheck } = ctx;
  printScope({ base, dirty, scope, unitScope });
  console.error(`  typecheck:      ${typecheck.tool} (${typecheck.reason}; CI always runs astro check)`);

  const steps = planSteps(scope, { mode, perf });
  if (steps.length === 0) {
    console.error(mode === 'e2e' ? 'check:e2e: this diff selects no Playwright project; nothing to run.' : 'check:push: nothing to run.');
    process.exit(0);
  }

  if (steps.some((id) => id.startsWith('e2e:'))) {
    const ownerCwd = previewOwnerCwd();
    const verdict = portOwnerVerdict({ ownerCwd, root: realpathSync(ROOT) });
    if (verdict === 'foreign' || verdict === 'unknown') {
      console.error(`check:e2e: port ${PREVIEW_PORT} is held by ${verdict === 'foreign' ? ownerCwd : 'a process whose directory could not be read'}. Playwright would reuse it and test that build, not this worktree's. Run again once it is free.`);
      process.exit(1);
    }
    if (verdict === 'own') {
      console.error(`check:e2e: this worktree's own preview is already on ${PREVIEW_PORT}; Playwright reuses it and it serves the dist/ the build step writes.`);
    }
  }

  const timings = [];
  let failed = null;
  for (const stage of stageSteps(steps)) {
    const r = await runStage(stage, passthrough);
    timings.push(...r.results);
    if (r.failed) {
      failed = r.results.find((t) => t.status !== 0)?.id ?? stage[0];
      break;
    }
  }

  const totalSeconds = (Date.now() - startAll) / 1000;
  console.error(`[check:push] total: ${totalSeconds.toFixed(1)}s across ${timings.length} step(s)${failed ? `, stopped at "${failed}"` : ''}`);
  if (!failed && mode === 'gate') console.error('[check:push] Playwright is not part of this gate; run `npm run check:e2e` when the diff touches rendering (CI runs it all).');
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main();
}
