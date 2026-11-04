import { test, expect } from '@playwright/test';
import { waitForIsland } from '../support/tool.js';
import { PDFDocument, rgb } from '@cantoo/pdf-lib';

// SCAN-47 - a finished scan opens in Highlight with no download between them. Only a real browser builds
// the PDF, crosses the navigation through IndexedDB and draws the page in the next tool.

async function onePagePdf() {
  const doc = await PDFDocument.create();
  const sheet = doc.addPage([600, 800]);
  sheet.drawRectangle({ x: 0, y: 0, width: 600, height: 800, color: rgb(0.95, 0.95, 0.93) });
  for (let row = 0; row < 14; row += 1) sheet.drawRectangle({ x: 70, y: 80 + row * 44, width: 420, height: 12, color: rgb(0.2, 0.2, 0.2) });
  return Buffer.from(await doc.save());
}

test('Highlight on a finished scan opens the scan in Highlight', async ({ page }) => {
  await page.goto('/scan-to-pdf/');
  await waitForIsland(page);
  await page.locator('input[type=file]:not([capture])').first().setInputFiles({
    name: 'page.pdf',
    mimeType: 'application/pdf',
    buffer: await onePagePdf(),
  });
  await expect(page.locator('[data-table-page]')).toHaveCount(1, { timeout: 30_000 });

  const highlight = page.locator('[data-rail-pinned]').getByRole('button', { name: 'Highlight', exact: true });
  await expect(highlight).toBeEnabled({ timeout: 30_000 });
  await highlight.click();

  await page.waitForURL(/\/highlight-pdf\/?(?:\?.*)?$/);
  await waitForIsland(page);
  await expect(page.locator('[data-tool-shell]')).toContainText('.pdf', { timeout: 30_000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
});
