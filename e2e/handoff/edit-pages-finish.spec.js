import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

/* Edit Pages has no Apply step: the output is prepared in the background after
   an edit, and the Download element is ready on its own. This guards the finish
   flow that follows an edit, on the Merge model (see merge-handoff.spec.js):
   on desktop, Compress and Sign sit under the rail's Download element; on a
   phone, a quiet Download in the bar opens a done strip that carries the same
   hand-offs. Either way the next tool opens with the EDITED file (the
   `_modified` name). Visits other tools, so it lives here and not under the
   tool's own e2e folder. */

async function makeFixture() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 6; i += 1) doc.addPage([300, 400]).drawText(`Page ${i}`, { x: 40, y: 340, size: 28, font });
  return Buffer.from(await doc.save());
}

async function openAndEdit(page) {
  await page.goto('/organize-pdf/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await page.locator('input[type="file"]').setInputFiles({ name: 'six.pdf', mimeType: 'application/pdf', buffer: await makeFixture() });
  const cells = page.locator('ul[data-page-grid] > li[data-key]');
  await expect(cells).toHaveCount(6);
  await cells.first().click();
  await page.keyboard.press('r');
  await expect(cells.first()).toHaveAttribute('data-rotation', '90');
}

test.describe('desktop', () => {
  test('Download is ready at once after an edit and Sign carries the edited file on', async ({ page }) => {
    await openAndEdit(page);
    await expect(page.getByRole('link', { name: /Download/ }).first()).toHaveAttribute('href', /^blob:/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Compress', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign', exact: true }).click();
    await expect(page).toHaveURL(/\/sign\/$/);
    await expect(page.getByText(/_modified/).first()).toBeVisible({ timeout: 15_000 });
  });

  test('Compress carries the edited file on', async ({ page }) => {
    await openAndEdit(page);
    await expect(page.getByRole('link', { name: /Download/ }).first()).toHaveAttribute('href', /^blob:/, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Compress', exact: true }).click();
    await page.waitForURL(/\/compress\/?(?:\?.*)?$/);
    await expect(page.locator('[data-tool-shell]')).toContainText('_modified', { timeout: 15_000 });
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });

  test('the quiet Download opens a done strip whose Sign carries the edited file on', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
    });
    await page.goto('/organize-pdf/');
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    await page.locator('input[type="file"]').setInputFiles({ name: 'six.pdf', mimeType: 'application/pdf', buffer: await makeFixture() });
    const cells = page.locator('ul[data-page-grid] > li[data-key]');
    await expect(cells).toHaveCount(6);
    await cells.first().tap();
    await page.getByRole('button', { name: 'Rotate page 1', exact: true }).tap();
    await expect(cells.first()).toHaveAttribute('data-rotation', '90');

    const quiet = page.locator('[data-quiet-download]');
    await expect(quiet).toBeVisible();
    await expect(quiet).toHaveAttribute('href', /^blob:/, { timeout: 15_000 });
    await page.addInitScript(() => {});
    // Stop the browser's own save so the tap only raises the strip.
    await quiet.evaluate((el) => el.addEventListener('click', (e) => e.preventDefault(), { capture: false }));
    await quiet.tap();

    const sign = page.getByRole('button', { name: 'Sign', exact: true }).last();
    await expect(sign).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compress', exact: true }).last()).toBeVisible();
    await sign.tap();
    await expect(page).toHaveURL(/\/sign\/$/);
    await expect(page.getByText(/_modified/).first()).toBeVisible({ timeout: 15_000 });
  });
});
