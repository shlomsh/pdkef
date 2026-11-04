import { test, expect } from '@playwright/test';
import { PDFDocument, rgb } from '@cantoo/pdf-lib';
import { waitForIsland } from '../../../../e2e/support/tool.js';

// PE-08 - a PDF is a Scan input: its sheet is drawn as a picture and a two-page sheet becomes two pages.
// The fixture is made here, no document: a landscape page with a dark line down the middle and rows of
// dark bars either side. Only a real browser draws the sheet with pdf.js and reads it.

async function twoPageSheetPdf() {
  const doc = await PDFDocument.create();
  const sheet = doc.addPage([1000, 700]);
  sheet.drawRectangle({ x: 0, y: 0, width: 1000, height: 700, color: rgb(0.93, 0.92, 0.9) });
  sheet.drawRectangle({ x: 498, y: 0, width: 4, height: 700, color: rgb(0.12, 0.12, 0.12) });
  for (let row = 0; row < 14; row += 1) {
    for (const x of [70, 560]) sheet.drawRectangle({ x, y: 60 + row * 44, width: 370 - (row % 3) * 60, height: 12, color: rgb(0.2, 0.2, 0.2) });
  }
  return Buffer.from(await doc.save());
}

test('a PDF sheet with two pages arrives as two pages', async ({ page }) => {
  await page.goto('/scan-to-pdf/');
  await waitForIsland(page);
  await page.locator('input[type=file]:not([capture])').first().setInputFiles({
    name: 'sheet.pdf',
    mimeType: 'application/pdf',
    buffer: await twoPageSheetPdf(),
  });
  await expect(page.locator('[data-table-page]')).toHaveCount(2, { timeout: 30_000 });
});
