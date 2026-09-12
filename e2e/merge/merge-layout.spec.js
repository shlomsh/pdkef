import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readFile } from 'node:fs/promises';

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

  // MERGE-03: Merge is gone. The pre-merge runs in the background and the
  // Download link replaces it in place once ready - there is never a second,
  // stacked "done" button.
  await expect(page.getByRole('button', { name: /Merge/i })).toHaveCount(0);

  const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
  await expect(downloadLink).toBeVisible({ timeout: 10_000 });
  await expect(downloadLink).toHaveAttribute('href', /^blob:/);
  await expect(downloadLink).toHaveAttribute('download', 'first + 1 more.pdf');
  await expect(downloadLink).toContainText('2 pages');

  // Exactly one primary control: the in-progress `.tool-primary-action` button
  // is gone the moment the anchor takes over, never both at once.
  await expect(page.locator('[class*="tool-primary-action"]')).toHaveCount(0);

  const shareButton = page.locator('[class*="pdf-share-button"]');
  await expect(shareButton).toBeVisible();

  // E2.6: the icon and label must be a real flex row with a visible, tokenized
  // gap instead of relying on adjacent inline SVG/text layout.
  await expect(shareButton).toHaveCSS('display', 'inline-flex');
  await expect(shareButton).toHaveCSS('align-items', 'center');
  await expect(shareButton).toHaveCSS('gap', '8px');
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

  expect(download.suggestedFilename()).toBe('alpha + 1 more.pdf');
  const savedPath = await download.path();
  if (!savedPath) throw new Error('Playwright did not retain the downloaded PDF');
  const bytes = await readFile(savedPath);
  const merged = await PDFDocument.load(bytes);
  expect(merged.getPageCount()).toBe(2);
});
