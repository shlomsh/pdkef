import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

async function makePdfBuffer(label) {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
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

  const mergeButton = page.getByRole('button', { name: 'Merge 2 PDFs', exact: true });
  await expect(mergeButton).toBeEnabled();
  await mergeButton.click();

  const shareButton = page.locator('[class*="pdf-share-button"]');
  await expect(shareButton).toBeVisible();

  // E2.6: the icon and label must be a real flex row with a visible, tokenized
  // gap instead of relying on adjacent inline SVG/text layout.
  await expect(shareButton).toHaveCSS('display', 'inline-flex');
  await expect(shareButton).toHaveCSS('align-items', 'center');
  await expect(shareButton).toHaveCSS('gap', '8px');
});
