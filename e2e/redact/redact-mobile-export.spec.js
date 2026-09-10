import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

// EditorExportActions.tsx (shared by Sign and Redact) keeps one intentional gap
// between its two surfaces: the sticky toolbar's Download carries
// `.desktop-download`, hidden below 920px once Share exists to take its place,
// while the completion row below the document never hides either control. That
// gap is a real CSS media query (SignToolbar.module.css, reused by Redact), so
// jsdom - which never loads module CSS or runs a layout engine - cannot prove it
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

  test('hides the sticky toolbar\'s Download once native Share exists, but keeps both below the document', async ({ page }) => {
    await openRedactTool(page);

    const toolbar = page.getByRole('toolbar', { name: 'PDF redaction' });
    const toolbarShare = toolbar.getByRole('button', { name: 'Share', exact: true });
    const toolbarDownload = toolbar.getByRole('button', { name: 'Download', exact: true });

    // The intentional gap: on a phone, with Share available, the toolbar
    // keeps editing tools and drops its own Download rather than wrapping.
    await expect(toolbarShare).toBeVisible();
    await expect(toolbarDownload).toBeHidden();

    // The completion row below the document is the reliable place to finish
    // either way, so it must never hide either control.
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
