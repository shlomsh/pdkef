import { test, expect } from '@playwright/test';
import { makePdfBuffer } from './support/pdf.js';
import { waitForIsland } from './support/tool.js';

// MEM-37: scripts/dropStubRequests.mjs points each page at the file an entry stub only re-exports, so a
// page no longer asks for the stub. This reads the result in a browser on the built dist: nothing fails,
// nothing logs an error, no stub is requested, and every island still hydrates from its chunk.
test.use({ serviceWorkers: 'block' });

// /about/ is a static page with page scripts and no islands.
const ROUTES = ['/', '/sign/', '/redact/', '/merge/', '/compress/', '/drive/', '/about/', '/he/sign/'];
const NO_ISLANDS = new Set(['/about/']);
const PAGE_SCRIPT_STUB = /\/site\/[^/?]*_astro_type_script_[^/?]*\.js/;

/** Collects what the page asked for and complained about, from the first navigation on. */
function watch(page) {
  // Vercel's own analytics scripts exist only on the host, so locally they would count as failures that are not ours.
  void page.route('**/_vercel/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  // The anonymous report beacon is a function on the host; `astro preview` has none. Usage events also arrive here, so
  // the test reads what was sent: an error report carries an `area`, an event a `name`.
  void page.route('**/api/report', async (route) => {
    seen.reports.push(route.request().postData() ?? '');
    await route.fulfill({ status: 204 });
  });
  const seen = { requests: [], failed: [], bad: [], errors: [], reports: [] };
  const errorReports = () => seen.reports.filter((body) => 'area' in JSON.parse(body));
  seen.errorReports = errorReports;
  page.on('request', (request) => seen.requests.push(new URL(request.url()).pathname));
  page.on('requestfailed', (request) => seen.failed.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on('response', (response) => { if (response.status() >= 400) seen.bad.push(`${response.status()} ${response.url()}`); });
  page.on('console', (message) => { if (message.type() === 'error') seen.errors.push(message.text()); });
  page.on('pageerror', (error) => seen.errors.push(error.message));
  return seen;
}

const hydrated = (page) => page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));

for (const route of ROUTES) {
  test(`${route}: no stub requests, no failures, every island hydrates`, async ({ page }) => {
    const seen = watch(page);
    await page.goto(route);
    await hydrated(page);
    if (!NO_ISLANDS.has(route)) expect(await page.locator('astro-island').count(), 'the page has islands to hydrate').toBeGreaterThan(0);
    expect(seen.requests.filter((path) => PAGE_SCRIPT_STUB.test(path))).toEqual([]);
    expect(seen.failed).toEqual([]);
    expect(seen.bad).toEqual([]);
    expect(seen.errors).toEqual([]);
    expect(seen.errorReports(), 'no error report was sent').toEqual([]);
  });
}

test.describe('a file opened', () => {
  for (const { route, ready } of [
    { route: '/sign/?next=0', ready: '[class*="page-overlay"]' },
    { route: '/merge/', ready: 'ul[data-page-grid]' },
  ]) {
    test(`${route}: the loaded state appears with no failures`, async ({ page }) => {
      const seen = watch(page);
      await page.goto(route);
      await hydrated(page);
      await waitForIsland(page);
      await page.locator('input[type="file"]').first().setInputFiles({
        name: 'stub-requests.pdf',
        mimeType: 'application/pdf',
        buffer: await makePdfBuffer('stub requests', { pages: 2 }),
      });
      await page.locator(ready).first().waitFor({ timeout: 30_000 });
      expect(seen.requests.filter((path) => PAGE_SCRIPT_STUB.test(path))).toEqual([]);
      expect(seen.failed).toEqual([]);
      expect(seen.bad).toEqual([]);
      expect(seen.errors).toEqual([]);
      expect(seen.errorReports(), 'no error report was sent').toEqual([]);
    });
  }
});
