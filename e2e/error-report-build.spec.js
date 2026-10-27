import { test, expect } from '@playwright/test';

// DEBT-35 / MEM-19: a crash report names the commit its page was built from, so
// `errors:resolve --build <sha>` rebuilds one commit instead of searching forty.
// The commit travels in a `Server-Timing: build;desc="<sha7>"` response header set by
// middleware.ts and is read back off the navigation entry by the reporter when it sends;
// no page's HTML carries it. `astro preview` runs no middleware, so the spec adds the
// header to the /merge/ document itself and proves the rest of the chain (header to
// performance entry to beacon). The middleware half is a unit test (src/site-lib/middleware.test.ts).
// jsdom cannot prove it: the beacon only leaves a production bundle, so this runs against
// the preview server like the CSP smoke does.

const COMMIT = 'abc1234';

test('a reported error carries the commit from the Server-Timing header, and the HTML carries none', async ({ page }) => {
  await page.route('**/api/report', (route) => route.fulfill({ status: 204 }));
  await page.route('**/merge/', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'server-timing': `build;desc="${COMMIT}"` } });
  });
  await page.goto('/merge/');

  await expect(page.locator('meta[name="pdkef-build"]')).toHaveCount(0);

  // /api/report also carries usage events (DEBT-44: `tool_page_viewed` goes out on load), so
  // wait for the error report itself, not the first request to the endpoint. Taking the first
  // one raced the usage event and lost about 1 run in 6 (CI on fc26f6a6, 2026-10-21).
  const isErrorReport = (request) => {
    if (new URL(request.url()).pathname !== '/api/report') return false;
    try {
      return JSON.parse(request.postData() ?? 'null')?.area === 'uncaught';
    } catch {
      // expected: a body that is not JSON is not the report this test waits for
      return false;
    }
  };
  const beacon = page.waitForRequest(isErrorReport);
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
  expect(report.build).toBe(COMMIT);
});
