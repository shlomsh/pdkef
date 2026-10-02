import { test, expect } from '@playwright/test';

// DEBT-34: a crash report names the commit its page was built from, so
// `errors:resolve --build <sha>` rebuilds one commit instead of searching forty.
// The commit is stamped into the built HTML as <meta name="pdkef-build"> after the
// build id is hashed (scripts/generate-precache-manifest.mjs) and read back by the
// reporter when it sends. jsdom cannot prove the chain: the stamping happens on
// the built output and the beacon only leaves a production bundle, so this runs
// against the preview server like the CSP smoke does.
//
// A build made without VERCEL_GIT_COMMIT_SHA has no tag and must send no `build`
// at all; one made with it must send exactly the tag's seven characters. Run it
// both ways before landing a change to the stamping:
//   VERCEL_GIT_COMMIT_SHA=$(printf 'a%.0s' {1..40}) npm run build

const BUILD_SHAPE = /^[0-9a-f]{7}$/;

test('a reported error carries the commit the page was built from, and only that', async ({ page }) => {
  await page.route('**/api/report', (route) => route.fulfill({ status: 204 }));
  await page.goto('/merge/');

  const tags = page.locator('meta[name="pdkef-build"]');
  const stamped = (await tags.count()) === 1 ? await tags.getAttribute('content') : null;
  if (stamped !== null) expect(stamped).toMatch(BUILD_SHAPE);

  const beacon = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/report');
  await page.evaluate(() => {
    // A frame inside our own built output is what makes an error reportable.
    const error = new Error('probe');
    error.stack = `Error: probe\n    at probe (${location.origin}/_astro/PdfMergeTool.C4ILDZF-.js:2:16571)`;
    // Thrown until reported: the page's listener is installed by a deferred module, and the
    // reporter sends each distinct report once, so later throws cost nothing.
    window.__probe = setInterval(() => {
      throw error;
    }, 100);
  });
  const report = JSON.parse((await beacon).postData() ?? 'null');
  await page.evaluate(() => clearInterval(window.__probe));

  expect(report).toMatchObject({ area: 'uncaught', tool: '/merge/' });
  if (stamped === null) expect(report).not.toHaveProperty('build');
  else expect(report.build).toBe(stamped);
});
