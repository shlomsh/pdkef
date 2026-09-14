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

// The font screening guards: per-script shaping guards, font parity suites,
// the export render guard, the Hebrew composition guard and language
// acceptance. Each esbuilds fontkit in its beforeAll and pixel-diffs a whole
// corpus, and together they were 55% of the suite's time while guarding
// fonts and shaping code that change in about one commit in ten. They live
// in their own `fonts` project so CI can run them only when those inputs
// change (see ci.yml's paths step) and `npm run test:e2e:fonts` runs them on
// demand; `npm run test:e2e` still runs everything.
const FONT_GUARDS = [
  '**/sign/*-guard.spec.js',
  '**/sign/*-parity.spec.js',
  '**/sign/language-acceptance.spec.js',
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
      testIgnore: [...BASE_IGNORE, ...FONT_GUARDS, ...PERF_BUDGETS],
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
