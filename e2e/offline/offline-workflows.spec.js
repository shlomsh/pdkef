import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/*
 * SIGN-07: "processing must work offline once required assets are
 * provisioned" is a written product promise (see the install-pdf-app and
 * how-to-sign-a-pdf-on-* SEO copy: "let its required assets load before
 * disconnecting" / "test an export... before going offline"), and until now
 * nothing exercised it - which is how two real bugs shipped unnoticed. First,
 * `CACHE_VERSION` (public/sw.js) was hashed from the precache manifest's URL
 * list alone, which had shrunk to a single constant entry, so every build
 * produced the identical cache name and a same-URL asset (a font, an icon)
 * could never be invalidated by a content change - fixed by hashing every
 * dist/ file's actual bytes instead (scripts/buildId.mjs). Second, and only
 * findable from a real Chromium tab: `Cache.match()` silently fails to match
 * the live `FetchEvent.request` object for any `destination: 'script'`
 * request - exactly how a `client:load` island loads its own hydration
 * bundle - even when the identical URL is verifiably precached and matches
 * fine as a plain string. Every tool would 404 its own JS offline regardless
 * of how much sw.js precached; see the fetch handler's branch 2 in sw.js for
 * the fix and the full account. Every test here does the same shape: warm
 * the runtime cache with a real online pass, then flip the browser context
 * offline before repeating the operation, so a regression in either of these
 * - or a reintroduced network call in open/edit/export - fails here instead
 * of shipping.
 */

async function makePdfBuffer(label) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 72, y: 720, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  return Buffer.from(await doc.save());
}

async function waitForServiceWorkerControl(page) {
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, null, {
    timeout: 15_000,
  });
}

async function purgeAppCaches(page) {
  // What activate() does to the previous build's cache on a real deploy -
  // used here to simulate an upgrade without needing a second build.
  await page.evaluate(async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('pdkef-')).map((key) => caches.delete(key)));
  });
}

async function openSignToolWithFile(page, buffer, name = 'offline-e2e.pdf') {
  await page.goto('/sign/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name, mimeType: 'application/pdf', buffer });
  await expect(page.locator('[class*="page-wrapper"]')).toBeVisible();
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
}

// The workspace's own "Download" button (not the toolbar's identically-named
// shortcut, which carries a `title` and resolves as a second match) lives in
// the export-actions row under the page canvas.
function workspaceDownloadButton(page) {
  return page.locator('[class*="export-actions"]').getByRole('button', { name: 'Download', exact: true });
}

async function addTextAt(page, text, xRatio, yRatio) {
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
  // Deselect so the debounced autosave sees a settled snapshot rather than
  // racing a still-open editing session.
  await page.keyboard.press('Escape');
}

test.describe('offline workflows (SIGN-07)', () => {
  test('Merge completes fully offline once the page has been visited online', async ({ page, context }) => {
    await page.goto('/merge/');
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    await waitForServiceWorkerControl(page);

    const files = await Promise.all(
      ['a.pdf', 'b.pdf'].map(async (name) => ({ name, mimeType: 'application/pdf', buffer: await makePdfBuffer(name) })),
    );
    await page.locator('input[type="file"]').setInputFiles(files);
    await page.getByRole('button', { name: 'Merge 2 PDFs', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Download PDF', exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');

    await context.setOffline(true);
    try {
      await page.reload();
      await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();

      const offlineFiles = await Promise.all(
        ['c.pdf', 'd.pdf'].map(async (name) => ({ name, mimeType: 'application/pdf', buffer: await makePdfBuffer(name) })),
      );
      await page.locator('input[type="file"]').setInputFiles(offlineFiles);
      await page.getByRole('button', { name: 'Merge 2 PDFs', exact: true }).click();

      const download = page.getByRole('link', { name: 'Download PDF', exact: true });
      await expect(download).toBeVisible();
      await expect(download).toHaveAttribute('href', /^blob:/);
    } finally {
      await context.setOffline(false);
    }
  });

  test('Sign: restoring a draft and exporting complete fully offline', async ({ page, context }) => {
    await openSignToolWithFile(page, await makePdfBuffer('offline sign fixture'));
    await waitForServiceWorkerControl(page);
    await addTextAt(page, 'Offline export check', 0.3, 0.3);
    await expect(page.getByText('Draft saved')).toBeVisible();

    // Warm the export path itself (fontkit/pdf-lib/the default font), not
    // just page load, before going offline.
    const [firstDownload] = await Promise.all([
      page.waitForEvent('download'),
      workspaceDownloadButton(page).click(),
    ]);
    expect(firstDownload.suggestedFilename()).toMatch(/^signed_/);
    await page.waitForLoadState('networkidle');

    await context.setOffline(true);
    try {
      await page.reload();
      // No file picker interaction here - the draft (source bytes + edits) is
      // restored from IndexedDB on mount, independent of the network.
      await expect(page.locator('[class*="page-wrapper"]')).toBeVisible();
      const restoredText = page.locator('[data-editor-element] textarea[data-editor-text-input]');
      await expect(restoredText).toHaveValue('Offline export check');

      const [secondDownload] = await Promise.all([
        page.waitForEvent('download'),
        workspaceDownloadButton(page).click(),
      ]);
      expect(secondDownload.suggestedFilename()).toMatch(/^signed_/);
    } finally {
      await context.setOffline(false);
    }
  });

  test('Sign: an in-progress draft survives an app-cache upgrade', async ({ page }) => {
    await openSignToolWithFile(page, await makePdfBuffer('upgrade survival fixture'));
    await waitForServiceWorkerControl(page);
    await addTextAt(page, 'Upgrade survival check', 0.3, 0.4);
    await expect(page.getByText('Draft saved')).toBeVisible();

    // Simulate the moment a new deploy's activate() drops the previous
    // build's cache. The draft (IndexedDB, a separate store from Cache
    // Storage) must not be reachable from this at all.
    await purgeAppCaches(page);

    await page.reload();
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    await expect(page.locator('[class*="page-wrapper"]')).toBeVisible();
    const restoredText = page.locator('[data-editor-element] textarea[data-editor-text-input]');
    await expect(restoredText).toHaveValue('Upgrade survival check');
  });
});
