import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { existsSync } from 'node:fs';
import { startTwoBuildServer } from './twoBuildServer.js';

/*
 * MEM-10: two tabs on an old build, a new build deployed, one click, both land
 * on the new build with their work intact. Only one build exists, so
 * twoBuildServer.js serves its own origin and fakes the deploy by changing the
 * worker's build id and tagging every page with the build that rendered it.
 * What this proves that no unit test can: a real waiting worker, a real
 * SKIP_WAITING, a real controllerchange reload in every tab, the old cache
 * gone, and a draft that was still inside its debounce window surviving.
 * Chromium only (a live service worker, and the line is not engine-specific).
 */

test.skip(!existsSync('dist/precache-manifest.json'), 'needs a built dist/ (npm run build)');

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

async function openSignWithFile(page, buffer) {
  await page.goto('/sign/?next=0');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: 'update-e2e.pdf', mimeType: 'application/pdf', buffer });
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
}

const checkForUpdate = (page) => page.evaluate(async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  await registration.update();
});

const build = (page) => page.locator('meta[name="pdkef-e2e-build"]');

test('both tabs land on the new build with their work intact', async () => {
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

  for (const tab of [tabA, tabB]) {
    await expect(tab.locator('[data-app-update]')).toBeVisible({ timeout: 20_000 });
    await expect(tab.locator('[data-app-update]')).toContainText('A new version is ready');
  }

  // A second edit, still inside the 700ms draft debounce when the click lands.
  await addText(tabA, 'second edit', 0.3, 0.55);
  const reloaded = Promise.all([
    tabA.waitForSelector('meta[name=pdkef-e2e-build][content=new]', { state: 'attached', timeout: 30_000 }),
    tabB.waitForSelector('meta[name=pdkef-e2e-build][content=new]', { state: 'attached', timeout: 30_000 }),
  ]);
  await tabB.locator('button[data-app-update-reload]').click();
  await reloaded;

  const cacheKeys = await tabB.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('pdkef-')));
  expect(cacheKeys).toHaveLength(1);
  expect(cacheKeys[0]).toMatch(/e2e$/);

  // Tab A restores its document from the draft: both edits, the last included.
  await tabA.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(tabA.locator('[class*="page-overlay"]')).toBeVisible({ timeout: 15_000 });
  await expect(tabA.locator('[data-editor-element]')).toHaveCount(2, { timeout: 15_000 });
  const values = await tabA.locator('[data-editor-text-input]').evaluateAll((els) => els.map((el) => el.value));
  expect(values.sort()).toEqual(['first edit', 'second edit']);
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
