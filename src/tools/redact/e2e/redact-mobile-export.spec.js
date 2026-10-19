import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

// EditorExportActions.tsx (shared by Sign and Redact) drops the sticky toolbar's
// Download below 920px once Share exists (`.desktop-download`), unless the tool
// passes keepDownloadOnPhone. Redact does, so its phone toolbar carries both;
// Sign's toolbar is too full and still drops it. The completion row below the
// document never hides either control. The wrap is real CSS (SignToolbar.module.css,
// reused by Redact), so jsdom - which never loads module CSS or runs a layout engine - cannot prove it
// (see CLAUDE.md's "some editor bugs require a browser, not jsdom"). This is the
// one guard that does.

async function makePdfBuffer() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Redact mobile export fixture', { x: 72, y: 720, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  return Buffer.from(await doc.save());
}

async function openRedactTool(page) {
  // Native Share is not exposed in every browser context. Supply its
  // supported shape before the island loads, matching merge-layout.spec.js -
  // this is the one condition the toolbar's Download-hiding rule is gated on.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
  });

  await page.goto('/redact');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'redact-mobile-export.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(),
  });
  await expect(page.locator('[class*="page-wrapper"]')).toBeVisible();
}

test.describe('redact export actions on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keeps the sticky toolbar\'s Download beside Share on a phone, and both below the document', async ({ page }) => {
    await openRedactTool(page);

    const toolbar = page.getByRole('toolbar', { name: 'PDF redaction' });
    const toolbarShare = toolbar.getByRole('button', { name: 'Share', exact: true });
    const toolbarDownload = toolbar.getByRole('button', { name: 'Download', exact: true });

    // Redact opts in to keepDownloadOnPhone: Share and Download both stay in
    // the phone toolbar (12 controls, 6+6).
    await expect(toolbarShare).toBeVisible();
    await expect(toolbarDownload).toBeVisible();

    // The completion row below the document is the reliable place to finish
    // either way, so it must never hide either control.
    // The row only exists once there is something to download, so draw a box.
    await page.getByRole('button', { name: 'Blackout', exact: true }).click();
    const overlay = page.locator('.redact-draw-area').first();
    await overlay.scrollIntoViewIfNeeded();
    const area = await overlay.boundingBox();
    if (!area) throw new Error('PDF redaction overlay has no bounding box');
    await page.mouse.move(area.x + area.width * 0.3, area.y + area.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.6, area.y + area.height * 0.36, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('[class*="redact-box"]')).toHaveCount(1);
    const completionRow = page.locator('[class*="export-actions"]');
    await expect(completionRow).toBeVisible();
    const completionDownload = completionRow.getByRole('button', { name: 'Download', exact: true });
    const completionShare = completionRow.getByRole('button', { name: 'Share', exact: true });
    await expect(completionDownload).toBeVisible();
    await expect(completionShare).toBeVisible();
  });

  test('keeps the toolbar\'s own Download visible when native Share is unavailable', async ({ page }) => {
    // Force the "no native Share" shape explicitly rather than relying on a
    // browser's ambient default: WebKit ships a real Web Share API, so an
    // unstubbed context here would make this assertion depend on which
    // project ran it instead of on the app's own logic.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    });
    await page.goto('/redact');
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Choose file', { exact: true }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'redact-mobile-export-no-share.pdf',
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(),
    });
    await expect(page.locator('[class*="page-wrapper"]')).toBeVisible();

    const toolbar = page.getByRole('toolbar', { name: 'PDF redaction' });
    await expect(toolbar.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
    await expect(toolbar.getByRole('button', { name: 'Download', exact: true })).toBeVisible();
  });
});
