import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readFile } from 'node:fs/promises';

/* Direction A (2026-09-13): the document is the centre. Merge's card
   (`.tool-card`, unchanged) still fills the width before any file is
   loaded, which is what the empty-state boxes below prove; once files land
   the old identity card / sort toolbar / Merge button are gone, replaced by
   the white "document" (the page grid, heading `#merge-pages-heading`) and
   a 320px rail. There is no Merge button - the pre-merge runs in the
   background and the Download element (one <a data-state>) reports on the
   result directly, so this spec checks that it arrives ready with an href,
   a download name and "2 pages", never a second, stacked "done" state. */

async function makePdfBuffer(label, pageCount = 1) {
  const document = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) document.addPage([612, 792]);
  document.setTitle(label);
  return Buffer.from(await document.save());
}

test('keeps the Merge card full width and spaces the native-share icon', async ({ page }) => {
  // Native Share is not exposed in every browser context. Supply its supported
  // shape before the island loads so this production-preview guard can verify
  // the post-export control without changing the app's behavior.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
  });

  await page.goto('/merge');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const app = page.locator('#app');
  const card = page.locator('#app > astro-island > div');
  const dropzone = card.locator('> div').first();
  await expect(card).toBeVisible();
  await expect(dropzone).toBeVisible();

  const [appBox, cardBox, dropzoneBox] = await Promise.all([
    app.boundingBox(),
    card.boundingBox(),
    dropzone.boundingBox(),
  ]);
  if (!appBox || !cardBox || !dropzoneBox) throw new Error('Merge layout boxes are unavailable');

  // E2.5: BasePdfTool's module wrapper must not shrink-wrap its dropzone at
  // desktop widths. The inner dropzone remains inset by the card padding.
  expect(Math.abs(cardBox.x - appBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(cardBox.width - appBox.width)).toBeLessThanOrEqual(1);
  expect(dropzoneBox.width).toBeLessThan(cardBox.width);
  expect(dropzoneBox.width).toBeGreaterThan(cardBox.width - 60);

  const files = await Promise.all(['first.pdf', 'second.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);

  // Direction A: there is no Merge button at all, loaded or otherwise - the
  // Download element is the only report on the result.
  await expect(page.getByRole('button', { name: /^Merge/i })).toHaveCount(0);

  const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
  await expect(downloadLink).toBeVisible({ timeout: 10_000 });
  await expect(downloadLink).toHaveAttribute('href', /^blob:/);
  await expect(downloadLink).toHaveAttribute('download', 'merged_first.pdf');
  await expect(downloadLink).toContainText('2 pages');

  // Exactly one Download element node, in the "ready" state - never a
  // second, stacked done indicator alongside it.
  await expect(page.locator('[data-state]')).toHaveCount(1);
  await expect(downloadLink).toHaveAttribute('data-state', 'ready');

  // Share sits in the rail's hand-off row alongside Compress it / Sign it,
  // with the row's own button class (PdfShareButton's `className`), so it is
  // found by name. E2.6's contract holds through that class: a real flex
  // row with a visible, tokenized gap between the icon and the label.
  const shareButton = page.getByRole('button', { name: 'Share', exact: true });
  await expect(shareButton).toBeVisible();
  await expect(shareButton).toHaveCSS('display', 'flex'); // blockified: a flex item of .handoff-row
  await expect(shareButton).toHaveCSS('align-items', 'center');
  await expect(shareButton).toHaveCSS('gap', '4.8px');
});

test('MERGE-11: two taps from an empty page to a saved file, nothing else touched', async ({ page }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const files = await Promise.all(['alpha.pdf', 'beta.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  // Tap 1: pick the files (setInputFiles stands in for the OS picker).
  await page.locator('input[type="file"]').setInputFiles(files);

  const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
  await expect(downloadLink).toBeVisible({ timeout: 10_000 });

  // Tap 2: Download. Nothing else is touched between the two actions.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadLink.click(),
  ]);

  expect(download.suggestedFilename()).toBe('merged_alpha.pdf');
  const savedPath = await download.path();
  if (!savedPath) throw new Error('Playwright did not retain the downloaded PDF');
  const bytes = await readFile(savedPath);
  const merged = await PDFDocument.load(bytes);
  expect(merged.getPageCount()).toBe(2);
});
