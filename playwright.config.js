import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const PORT = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = `http://127.0.0.1:${PORT}`;

// This config's own directory - the same directory `testDir: '.'` below
// resolves against, whether that is the main checkout or one agent
// worktree's own copy of the repo.
const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));

// Agent worktrees live at .claude/worktrees/<name>/ inside the repo, so
// scanning from the main checkout with testDir: '.' plus the globs below
// also discovers each worktree's own copy of every spec, and a second
// `playwright` package loads from there (found 2026-09-14 while landing
// DEBT-01 with parallel worktree agents). A plain '**/.claude/**' string
// looks like the fix, but Playwright matches testIgnore against each file's
// full absolute path, and every worktree's own checkout already lives
// inside a real `.claude` directory (`<repo>/.claude/worktrees/<name>/`) -
// so that pattern also matches every one of a worktree's OWN specs when
// Playwright is run from inside it, not just a nested copy under someone
// else's scan. Since project-level `testIgnore` (chromium) replaces this
// list instead of merging with it, only the projects that inherit it
// (fonts, perf, webkit) go quiet - each silently reports 0 tests instead of
// erroring, which is how this was caught (measured in this worktree: `**/.
// claude/**` dropped `Total: 276 tests in 50 files` to `113 tests in 36
// files`, all of it the chromium project). Anchoring the pattern to this
// config's own directory instead of matching `.claude` anywhere avoids the
// self-match: it excludes a `.claude` folder nested INSIDE whatever
// checkout is scanning (a real worktree-of-a-worktree, or the main
// checkout's own `.claude/worktrees/*`), never the checkout's own ancestry.
const IGNORE_NESTED_CLAUDE_WORKTREES = new RegExp(
  `^${CONFIG_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\.claude/`
);

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
  // See IGNORE_NESTED_CLAUDE_WORKTREES above for why this isn't the plain
  // '**/.claude/**' string it looks like it should be.
  testIgnore: ['**/node_modules/**', '**/dist/**', IGNORE_NESTED_CLAUDE_WORKTREES],
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
  },
  projects: [
    {
      name: 'chromium',
      // A project's own testIgnore replaces the top-level one above instead
      // of merging with it, so IGNORE_NESTED_CLAUDE_WORKTREES has to be
      // repeated here too, or this project (most of the suite) would keep
      // double-discovering nested worktree copies regardless of what the
      // top-level list says.
      testIgnore: [...FONT_GUARDS, ...PERF_BUDGETS, IGNORE_NESTED_CLAUDE_WORKTREES],
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
