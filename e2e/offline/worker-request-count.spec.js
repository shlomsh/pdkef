import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { startTwoBuildServer } from './twoBuildServer.js';

/*
 * MEM-45: the worker counts the requests it sends to the server, and a page that asks for the counts
 * gets exactly what the server received from the worker. Three moments: a first install of /redact/,
 * one page request the worker passes on, and a deploy. The server here is twoBuildServer, which logs
 * every request it serves. Chromium only (a live worker).
 *
 * A request is the worker's own when its Referer is the worker script (the install's requests carry
 * it); a passed-on page request is told apart by its unique path; after the deploy every request but
 * the browser's own check of the worker script (header `service-worker: script`) comes from the new
 * worker, since the page is idle.
 */

test.skip(!existsSync('dist/precache-manifest.json'), 'needs a built dist/ (npm run build)');

let server;
let context;

test.beforeAll(async () => { server = await startTwoBuildServer(); });
test.afterAll(async () => { await server?.close(); });

test.beforeEach(async ({ browser }) => {
  server.setPhase('old');
  server.resetRequests();
  context = await browser.newContext({ baseURL: server.origin, serviceWorkers: 'allow' });
  await context.addInitScript(() => { try { localStorage.setItem('pdkef:file-opened', '1'); } catch {} });
});
test.afterEach(async () => { await context?.close(); });

const total = (counts) => Object.entries(counts).reduce((n, [k, v]) => (k === 'unmeasured' ? n : n + v), 0);

/** What the page code asks for: the worker's counts since the last take (taking clears them). */
const takeCounts = (page) => page.evaluate(() => new Promise((resolve) => {
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = (e) => resolve(e.data);
  navigator.serviceWorker.controller.postMessage({ type: 'pdkef:take-downloads' }, [port2]);
}));

/** Adds each take into `into` until the counts reach the server's number. */
const collect = (page, into) => async () => {
  for (const [k, v] of Object.entries(await takeCounts(page))) into[k] = k === 'unmeasured' ? v : (into[k] ?? 0) + v;
  return total(into);
};

const complete = (page, suffix) => page.evaluate(async (end) => {
  for (const key of (await caches.keys()).filter((k) => k.startsWith('pdkef-') && k.endsWith(end))) {
    if (await (await caches.open(key)).match(new URL('/__pdkef/precache-complete/', location.origin))) return true;
  }
  return false;
}, suffix);

test('the worker hands a page exactly the requests the server received from it', async () => {
  const page = await context.newPage();
  await page.goto('/redact/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20_000 });
  await expect.poll(() => complete(page, ''), { timeout: 30_000 }).toBe(true);

  // 1. First install: every request from the worker is counted, mostly as install.
  const served1 = server.requests().filter((r) => (r.headers.referer ?? '').endsWith('/sw.js')).length;
  const first = {};
  await expect.poll(collect(page, first), { timeout: 15_000 }).toBe(served1);
  expect(first.install).toBeGreaterThan(0);
  expect(first.unmeasured).toBeUndefined();

  // 2. One page request passed on to the server: one forwarded count, one request served.
  const probe = `/robots.txt?probe=${Date.now()}`;
  await page.evaluate((path) => fetch(path).then((r) => r.text()), probe);
  expect(server.requests().filter((r) => r.path === probe)).toHaveLength(1);
  const passed = {};
  await expect.poll(collect(page, passed), { timeout: 15_000 }).toBe(1);
  expect(passed).toEqual({ forwarded: 1 });

  // 3. A deploy: the new worker's downloads, read through the page's controller from the shared records.
  server.setPhase('new');
  server.resetRequests();
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await expect.poll(() => complete(page, 'e2e'), { timeout: 30_000 }).toBe(true);
  const served3 = server.requests().filter((r) => r.headers['service-worker'] !== 'script').length;
  const deploy = {};
  await expect.poll(collect(page, deploy), { timeout: 15_000 }).toBe(served3);
  expect(deploy.update).toBeGreaterThan(0);
});
