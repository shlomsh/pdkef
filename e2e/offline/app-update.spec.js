import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { existsSync, readFileSync } from 'node:fs';
import { startTwoBuildServer } from './twoBuildServer.js';

/*
 * MEM-10: tabs on an old build, a new build deployed. The next navigation in
 * any tab moves every tab onto the new build with its work intact, unless a
 * tab holds work a reload would lose; then the other tabs say why, quietly.
 * Only one build exists, so twoBuildServer.js serves its own origin and fakes
 * the deploy by changing the worker's build id and tagging every page with the
 * build that rendered it. What this proves that no unit test can: a real
 * waiting worker asking real tabs, a real takeover, a real controllerchange
 * reload in every tab, the old cache gone, and a draft that was still inside
 * its debounce window surviving. It does not single out the reload flush (the
 * reload lands after the debounce, and pagehide flushes too); the draft hooks'
 * unit tests pin that it awaits. Chromium only (a live service worker).
 */

test.skip(!existsSync('dist/precache-manifest.json'), 'needs a built dist/ (npm run build)');

// The critical deploy is the shipped CRITICAL_VERSION plus one (twoBuildServer), so its cache is
// named from the source, and bumping the constant for a real fix needs no spec edit.
const SHIPPED_CRITICAL = Number(/const CRITICAL_VERSION = (\d+);/.exec(readFileSync('public/sw.js', 'utf8'))[1]);
const CRITICAL_CACHE = new RegExp(`^pdkef-c${SHIPPED_CRITICAL + 1}-.*e2e$`);

let server;
let context;

test.beforeAll(async () => { server = await startTwoBuildServer(); });
test.afterAll(async () => { await server?.close(); });

test.beforeEach(async ({ browser }) => {
  server.setPhase('old');
  context = await browser.newContext({ baseURL: server.origin, serviceWorkers: 'allow' });
});
test.afterEach(async () => { await context?.close(); });

async function makePdfBuffer(label) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 72, y: 720, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  return Buffer.from(await doc.save());
}

async function waitForController(page) {
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, null, {
    timeout: 20_000,
  });
}

// Registration happens after load; a first visit is uncontrolled until the
// worker activates and claims, so wait on the registration, then the control.
async function waitControlled(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await waitForController(page);
}

async function addText(page, text, xRatio, yRatio) {
  const textTool = page.getByRole('toolbar', { name: 'PDF annotations' }).getByRole('button', { name: 'Text', exact: true });
  if ((await textTool.getAttribute('aria-pressed')) !== 'true') await textTool.click();
  const overlay = page.locator('[class*="page-overlay"]').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF overlay has no bounding box');
  await overlay.click({ position: { x: box.width * xRatio, y: box.height * yRatio } });
  const input = page.locator('[data-editor-element][data-editor-active] [data-editor-text-input]');
  await expect(input).toBeVisible();
  await input.fill(text);
  await expect(input).toHaveValue(text);
  await page.keyboard.press('Escape');
}

async function openWithFile(page, path, buffer) {
  await page.goto(path);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: 'update-e2e.pdf', mimeType: 'application/pdf', buffer });
}

async function openSignWithFile(page, buffer) {
  await openWithFile(page, '/sign/?next=0', buffer);
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
}

const checkForUpdate = (page) => page.evaluate(async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  await registration.update();
});

const build = (page) => page.locator('meta[name="pdkef-e2e-build"]');
// The build that rendered the page, or null mid-navigation.
const buildOf = (page) => page.evaluate(() => document.querySelector('meta[name="pdkef-e2e-build"]')?.content ?? null)
  .catch(() => null);

const line = (page) => page.locator('[data-app-update]');

// Polled with evaluate: waitForFunction treats an async predicate's promise as
// truthy and returns at once, mid-install.
const waitForWaitingWorker = (page) => expect.poll(() => page.evaluate(async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration?.waiting?.state ?? null;
}), { timeout: 20_000 }).toBe('installed');

const ownCaches = (page) => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('pdkef-')));

test('one navigation moves two idle tabs onto the new build, work intact, with no line', async () => {
  const tabA = await context.newPage();
  await openSignWithFile(tabA, await makePdfBuffer('update e2e'));
  await addText(tabA, 'first edit', 0.3, 0.3);
  await expect(tabA.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });

  const tabB = await context.newPage();
  await tabB.goto('/merge/');
  await waitControlled(tabA);
  await waitControlled(tabB);
  await expect(build(tabA)).toHaveAttribute('content', 'old');

  server.setPhase('new');
  await checkForUpdate(tabB);
  await waitForWaitingWorker(tabB);
  // Sign keeps its work in drafts, so neither tab holds: nothing to say.
  await tabB.waitForTimeout(1500);
  for (const tab of [tabA, tabB]) await expect(line(tab)).toBeHidden();

  // A second edit, still inside the 700ms draft debounce when tab B navigates.
  await addText(tabA, 'second edit', 0.3, 0.55);
  // The test navigates tab B only: tab A must reload itself on
  // controllerchange. It was the context's first page, so it only came under
  // control when the old worker claimed it.
  const reloadedA = tabA.waitForEvent('load', { timeout: 30_000 });
  await expect(tabA.locator('[data-tool-shell]').getByText('Saving draft…')).toBeVisible();
  // Tab B gets a blank page that loads it again a second later, once the new
  // build is active (Playwright's locators stall on that refresh, so poll).
  await tabB.reload();
  await reloadedA;
  for (const tab of [tabA, tabB]) await expect.poll(() => buildOf(tab), { timeout: 15_000 }).toBe('new');

  const cacheKeys = await ownCaches(tabB);
  expect(cacheKeys).toHaveLength(1);
  expect(cacheKeys[0]).toMatch(/e2e$/);

  // Tab A restores its document from the draft: both edits, the last included.
  await tabA.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(tabA.locator('[class*="page-overlay"]')).toBeVisible({ timeout: 15_000 });
  await expect(tabA.locator('[data-editor-element]')).toHaveCount(2, { timeout: 15_000 });
  const values = await tabA.locator('[data-editor-text-input]').evaluateAll((els) => els.map((el) => el.value));
  expect(values.sort()).toEqual(['first edit', 'second edit']);
});

test('a file open in a tool without drafts holds the update, and only the other tab says so', async () => {
  const busy = await context.newPage();
  await openWithFile(busy, '/compress/', await makePdfBuffer('held e2e'));
  await expect(busy.getByRole('button', { name: 'Compress PDF' })).toBeVisible();

  const other = await context.newPage();
  await other.goto('/merge/');
  await waitControlled(busy);
  await waitControlled(other);

  server.setPhase('new');
  await checkForUpdate(other);
  await waitForWaitingWorker(other);

  await expect(line(other)).toBeVisible({ timeout: 10_000 });
  await expect(line(other)).toContainText("It loads once you're done in your other PDkef tab.");
  await expect(line(busy)).toBeHidden();

  // The idle tab's own navigation cannot take the busy tab's work with it.
  await other.reload();
  await expect(build(other)).toHaveAttribute('content', 'old');
  await expect(build(busy)).toHaveAttribute('content', 'old');
  await expect(busy.getByRole('button', { name: 'Compress PDF' })).toBeVisible();
  await expect(line(other)).toBeVisible({ timeout: 10_000 });

  // Dismissed, it stays hidden for this page.
  await other.locator('[data-app-update-dismiss]').click();
  await expect(line(other)).toBeHidden();

  // Leaving the file is the busy tab's own choice: that navigation updates both.
  const reloadedOther = other.waitForEvent('load', { timeout: 30_000 });
  await busy.goto('/merge/');
  await reloadedOther;
  for (const tab of [busy, other]) await expect.poll(() => buildOf(tab), { timeout: 15_000 }).toBe('new');
  expect(await ownCaches(other)).toEqual([expect.stringMatching(/e2e$/)]);
});

test('no update line without a waiting worker', async () => {
  const tab = await context.newPage();
  await tab.goto('/merge/');
  await waitControlled(tab);
  await checkForUpdate(tab);
  await tab.waitForTimeout(1000);
  expect(await tab.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting)).toBeNull();
  await expect(tab.locator('[data-app-update]')).toBeHidden();
});

// The silent path: one tab can switch builds at its own next navigation
// without pulling a cache out from under anyone, so it never sees the line.
test('a single tab never sees the line and lands on the new build at its next reload, work intact', async () => {
  const tab = await context.newPage();
  await openSignWithFile(tab, await makePdfBuffer('silent update e2e'));
  await addText(tab, 'first edit', 0.3, 0.3);
  await expect(tab.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });
  await waitControlled(tab);

  server.setPhase('new');
  await checkForUpdate(tab);
  await waitForWaitingWorker(tab);
  await tab.waitForTimeout(1500);
  await expect(line(tab)).toBeHidden();

  await tab.reload();
  await expect.poll(() => buildOf(tab), { timeout: 15_000 }).toBe('new');
  const cacheKeys = await tab.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('pdkef-')));
  expect(cacheKeys).toEqual([expect.stringMatching(/e2e$/)]);
  await expect(tab.locator('[data-editor-text-input]')).toHaveValue('first edit', { timeout: 15_000 });
});

// Offline stays whole: activation deletes the old cache, so a build only takes
// over online. Offline, the reload keeps the old build working; back online,
// the next reload switches.
test('offline, a single tab keeps the old build until it is back online', async () => {
  const tab = await context.newPage();
  await tab.goto('/merge/');
  await waitControlled(tab);

  server.setPhase('new');
  await checkForUpdate(tab);
  await waitForWaitingWorker(tab);

  await context.setOffline(true);
  await tab.reload();
  await expect(build(tab)).toHaveAttribute('content', 'old');
  await expect(tab.locator('h1')).toBeVisible();
  await expect(tab.locator('[data-app-update]')).toBeHidden();

  await context.setOffline(false);
  await tab.reload();
  await expect.poll(() => buildOf(tab), { timeout: 15_000 }).toBe('new');
});

// MEM-13: a build that bumps CRITICAL_VERSION does not wait for a navigation or
// for a file open in a draftless tool. The test never navigates: discovery is
// what a real tab does (registration.update() on visible, online and hourly),
// and the rest is the worker asking every tab, then taking over.

// Records, from outside the page, every moment the line is shown in its critical
// state. The binding survives the reload that follows, which a page-side flag
// would not, and the reload lands too soon after the line to poll for it.
async function watchCriticalLine(page, seen) {
  await page.exposeFunction('__pdkefCriticalSeen', () => { seen.add(page); });
  await page.evaluate(() => {
    const el = document.querySelector('[data-app-update]');
    const report = () => {
      if (!el.hidden && el.dataset.appUpdateState === 'critical') window.__pdkefCriticalSeen();
    };
    new MutationObserver(report).observe(el, { attributes: true, attributeFilter: ['hidden', 'data-app-update-state'] });
    report();
  });
}

const controlledBy = (page) => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
const navigationsOf = (page) => {
  const counter = { count: 0 };
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) counter.count += 1; });
  return counter;
};

async function twoTabsOneHoldingCompress() {
  const busy = await context.newPage();
  await openWithFile(busy, '/compress/', await makePdfBuffer('critical e2e'));
  await expect(busy.getByRole('button', { name: 'Compress PDF' })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/merge/');
  await waitControlled(busy);
  await waitControlled(other);
  return [busy, other];
}

test('a critical build reaches two tabs with no navigation, even past a file open in Compress', async () => {
  const [busy, other] = await twoTabsOneHoldingCompress();
  const seen = new Set();
  for (const tab of [busy, other]) await watchCriticalLine(tab, seen);
  const navigations = [navigationsOf(busy), navigationsOf(other)];

  server.setPhase('critical');
  await checkForUpdate(other);

  // The ordinary build above would leave the busy tab silent and untouched;
  // the critical one shows the force line in both.
  await expect.poll(() => seen.size, { timeout: 20_000 }).toBe(2);

  // Both reload on the worker's controllerchange; nobody navigated them.
  for (const tab of [busy, other]) {
    await expect.poll(() => buildOf(tab), { timeout: 30_000 }).toBe('critical');
    await waitForController(tab);
  }
  expect(navigations.map((n) => n.count)).toEqual([1, 1]);
  expect(await controlledBy(busy)).toBe(await controlledBy(other));
  const keys = await ownCaches(other);
  expect(keys).toEqual([expect.stringMatching(CRITICAL_CACHE)]);
});

test('offline, a critical build does nothing and shows nothing until back online', async () => {
  const [busy, other] = await twoTabsOneHoldingCompress();
  const seen = new Set();
  for (const tab of [busy, other]) await watchCriticalLine(tab, seen);
  const navigations = [navigationsOf(busy), navigationsOf(other)];
  const before = await controlledBy(other);

  server.setPhase('critical');
  await context.setOffline(true);
  // A tab's discovery fails quietly offline (the page swallows it); the test's
  // own call rejects, which is the same failure.
  await checkForUpdate(other).catch(() => {});
  await other.waitForTimeout(4000);
  expect(seen.size).toBe(0);
  for (const tab of [busy, other]) await expect(line(tab)).toBeHidden();
  expect(navigations.map((n) => n.count)).toEqual([0, 0]);
  expect(await controlledBy(other)).toBe(before);
  for (const tab of [busy, other]) expect(await buildOf(tab)).toBe('old');

  // Back online the tabs find the build on their own (the online event); no
  // call from the test and no navigation.
  await context.setOffline(false);
  for (const tab of [busy, other]) {
    await expect.poll(() => buildOf(tab), { timeout: 30_000 }).toBe('critical');
    await waitForController(tab);
  }
  expect(seen.size).toBe(2);
  expect(await ownCaches(other)).toEqual([expect.stringMatching(CRITICAL_CACHE)]);
});
