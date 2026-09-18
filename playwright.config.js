import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const PORT = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = `http://127.0.0.1:${PORT}`;

// This config's own directory - the same directory `testDir: '.'` below
// resolves against, whether that is the main checkout or one agent
// worktree's own copy of the repo.
const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));

// Agent worktrees live at .claude/worktrees/<name>/ inside the repo, so a
// scan from the main checkout (testDir '.') also discovers each worktree's
// copy of every spec and loads a second `playwright` package from there
// (found 2026-09-14, landing DEBT-01 with parallel worktree agents). Not the
// plain '**/.claude/**' glob: testIgnore matches the absolute path, and a
// worktree's own checkout already sits under `<repo>/.claude/`, so that glob
// silently drops the worktree's own specs (measured: 276 -> 113, only the
// projects without their own testIgnore). Anchoring to this config's
// directory excludes only a `.claude/` nested inside the scanning checkout.
const IGNORE_NESTED_CLAUDE_WORKTREES = new RegExp(
  `^${CONFIG_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\.claude/`
);

// A project's own testIgnore replaces this list rather than merging with
// it, so every project that sets one spreads BASE_IGNORE first.
const BASE_IGNORE = ['**/node_modules/**', '**/dist/**', IGNORE_NESTED_CLAUDE_WORKTREES];

// The font screening guards: per-script shaping guards, font parity suites
// and the Hebrew composition guard. Each esbuilds fontkit in its beforeAll
// and pixel-diffs a whole corpus, and together they were 55% of the suite's
// time while guarding fonts and shaping code that change in about one commit
// in ten. They live in their own `fonts` project so CI can run them only
// when those inputs change (see affected-scope.mjs's font-registry glob) and
// `npm run test:e2e:fonts` runs them on demand; `npm run test:e2e` still
// runs everything.
//
// ARCH-23 (2026-09-18): the export render guard and language acceptance
// moved out to their own `export-guards` project/EXPORT_GUARDS below - they
// exercise the export pipeline (the real `signPdf`), not the font catalogue,
// and unlike the 25 guards here they still need to run on an ordinary Sign
// or Redact change (see EXPORT_GUARDS' comment).
const FONT_GUARDS = [
  '**/sign/*-guard.spec.js',
  '**/sign/*-parity.spec.js',
];

// The two export-pipeline guards (ARCH-23): export-render-guard.spec.js
// rasterises the real `signPdf` output against a runner-pinned baseline;
// language-acceptance.spec.js runs the same bundle over every shipped
// language/face combination. Both esbuild the real export path
// (src/editor/adapters/pdf/sign.js, src/tools/sign/languageAcceptance.js),
// so - unlike `fonts` above - their own Nx project (e2e/export/project.json)
// keeps a coarse, whole-project implicitDependencies edge to editor/lib/
// tool-sign: a Sign toolbar or tooltip change still runs these two (cheap,
// well under a minute combined), it just no longer runs the other 25.
const EXPORT_GUARDS = [
  '**/export/export-render-guard.spec.js',
  '**/export/language-acceptance.spec.js',
];

// CI splits the guards in two (QUAL-06), because `--shard` divides by test
// COUNT and the guards differ 30x in size: gurmukhi-tiro-shaping-guard alone
// is 36.1s, a Latin guard 1s. A count-based `--shard=1/2` measured 64% of the
// guard time in shard 1 against 36% in shard 2, over the ticket's 60%
// threshold, so the split is by hand instead. This is the six heaviest specs
// by measured time (gurmukhi-tiro-shaping-guard 36.1s, malayalam-shaping-guard
// 26.1s, malayalam-gayathri-shaping-guard 25.0s, telugu-suranna-shaping-guard
// 24.6s, bengali-shaping-guard 23.7s, arabic-shaping-guard 22.3s: 157.8s),
// leaving the other 19 files at 173s. `fonts-shard-2` below is the COMPLEMENT
// of this list over FONT_GUARDS, not a second hand-picked list, so a new
// guard spec always lands in shard 2 even if nobody touches this file, and a
// mislisted or renamed entry here only unbalances the two shards, never drops
// a spec from either. ARCH-23 (2026-09-18) moved export-render-guard.spec.js
// (was 17.7s, the seventh heaviest, and shard 1's anchor for the baseline
// recapture step) out to its own `export-guards` project - its manual
// baseline recapture step in ci.yml now runs there instead.
const FONT_GUARDS_SHARD_1 = [
  '**/sign/gurmukhi-tiro-shaping-guard.spec.js',
  '**/sign/malayalam-shaping-guard.spec.js',
  '**/sign/malayalam-gayathri-shaping-guard.spec.js',
  '**/sign/telugu-suranna-shaping-guard.spec.js',
  '**/sign/bengali-shaping-guard.spec.js',
  '**/sign/arabic-shaping-guard.spec.js',
];

// The specs that assert a wall-clock budget (Download ready under 1.6s,
// thumbnails within 2.5s, the compress preview under 8s at 4x CPU throttle).
// A budget measured while another worker is burning the same CPUs is noise:
// merge-ready-time read 1838ms on CI's 4 vCPUs with two workers against a
// 1600ms budget it clears alone. They run as the `perf` project, always with
// `--workers=1` (see test:e2e:product and ci.yml), so the number they read
// is the app's, not the runner's.
const PERF_BUDGETS = [
  // '**/merge/**/merge-ready-time.spec.js', not '**/merge/merge-ready-time.spec.js':
  // the extra '**/' matches zero segments too, so this glob covers both
  // e2e/merge/merge-ready-time.spec.js (pre-ARCH-18) and
  // src/tools/merge/e2e/merge-ready-time.spec.js (post-move), with nothing to
  // rewrite when that move lands - same trick the compress line below uses.
  '**/merge/**/merge-ready-time.spec.js',
  '**/merge/**/merge-thumbnail-throughput.spec.js',
  // '**/compress/**/compare-preview.spec.js', not '**/compress/compare-preview.spec.js':
  // the extra '**/' matches zero segments too, so this glob covers both
  // e2e/compress/compare-preview.spec.js (today) and
  // src/tools/compress/e2e/compare-preview.spec.js (once ARCH-17 moves it),
  // with nothing to rewrite when that move lands.
  '**/compress/**/compare-preview.spec.js',
];

export default defineConfig({
  // A single testDir at the repo root so testMatch/testIgnore below can
  // discover both e2e/ (cross-tool specs) and src/tools/*/e2e/ (a tool's own
  // specs, as ARCH-17 moves each tool's folder there) in one pass. The first
  // testMatch entry alone would already find both: a Playwright string glob
  // with no leading '**/' also gets matched with one prepended, so
  // 'e2e/**/*.spec.js' matches any path with an 'e2e/' segment anywhere,
  // src/tools/*/e2e/ included (verified: dropping the second entry below
  // still lists the same 276 tests). It is kept anyway, spelled out
  // explicitly rather than relying on that implicit behavior. Every
  // FONT_GUARDS/PERF_BUDGETS/webkit glob already carries its own leading
  // '**/', so none of them need touching as tools move.
  testDir: '.',
  testMatch: ['e2e/**/*.spec.js', 'src/tools/*/e2e/**/*.spec.js'],
  testIgnore: BASE_IGNORE,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  // The suite ran on one worker from its first commit, bundled with the
  // "one preview daemon per checkout" rule in CLAUDE.md, but that daemon is a
  // static file server and serves any number of contexts; the shaping harness
  // already names each guard's bundle uniquely for the same reason. Measured
  // on an M2 Pro: 221s serialized, 84s on 3 workers, 69s on 5. The one spec
  // that failed under load (home/handoff) had a real setup race, fixed there.
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    viewport: { width: 1600, height: 1000 },
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Astro 7's `astro preview` daemonises itself when it detects an AI agent
    // (`am-i-vibing` sees CLAUDECODE etc.): the foreground process spawns a
    // detached child and exits, so Playwright reports "Process from
    // config.webServer exited early" and leaves an orphan on the port that the
    // next run then reuses. This env var is what Astro sets on that child; set
    // here it keeps the server in the foreground under Playwright's control.
    env: { ...process.env, ASTRO_PREVIEW_BACKGROUND: '1' },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: [...BASE_IGNORE, ...FONT_GUARDS, ...EXPORT_GUARDS, ...PERF_BUDGETS],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'perf',
      testMatch: PERF_BUDGETS,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'fonts',
      testMatch: FONT_GUARDS,
      use: { ...devices['Desktop Chrome'] },
    },
    // The two CI shards (QUAL-06). `fonts` above is untouched and stays what
    // a local run and `npm run test:e2e:fonts` use; these two only exist for
    // ci.yml's font-guards matrix.
    {
      name: 'fonts-shard-1',
      testMatch: FONT_GUARDS_SHARD_1,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'fonts-shard-2',
      testMatch: FONT_GUARDS,
      testIgnore: [...BASE_IGNORE, ...FONT_GUARDS_SHARD_1],
      use: { ...devices['Desktop Chrome'] },
    },
    // ARCH-23: the two export-pipeline guards, split out of `fonts` into
    // their own project so they can be gated by their own (coarser, and
    // that's fine at only two specs) affected-scope verdict instead of
    // dragging all 27 (now 25) font guards along with them.
    {
      name: 'export-guards',
      testMatch: EXPORT_GUARDS,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      // thumbnail-render.spec.js added for MERGE-01: the fixture reproduced
      // blank in the field but not under Playwright's chromium project (see
      // that spec's header comment and the MERGE-01 ticket's Root cause
      // section), so it runs here too as the one other engine this suite
      // exercises.
      testMatch: ['**/recent-files.spec.js', '**/redact-mobile-export.spec.js', '**/thumbnail-render.spec.js', '**/merge-mobile.spec.js', '**/merge-direction-a.spec.js', '**/merge-share.spec.js'],
      use: { ...devices['iPhone 15'] },
    },
  ],
});
