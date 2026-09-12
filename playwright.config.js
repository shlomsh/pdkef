import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
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
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      // thumbnail-render.spec.js added for MERGE-01: the fixture reproduced
      // blank in the field but not under Playwright's chromium project (see
      // that spec's header comment and the MERGE-01 ticket's Root cause
      // section), so it runs here too as the one other engine this suite
      // exercises.
      testMatch: ['**/recent-files.spec.js', '**/redact-mobile-export.spec.js', '**/thumbnail-render.spec.js', '**/merge-mobile.spec.js'],
      use: { ...devices['iPhone 15'] },
    },
  ],
});
