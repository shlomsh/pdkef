import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = `http://127.0.0.1:${PORT}`;

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
  '**/merge/merge-ready-time.spec.js',
  '**/merge/merge-thumbnail-throughput.spec.js',
  '**/compress/compare-preview.spec.js',
];

export default defineConfig({
  testDir: './e2e',
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
      testIgnore: [...FONT_GUARDS, ...PERF_BUDGETS],
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
