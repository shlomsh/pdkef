import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { openTool } from '../support/tool.js';

// PE-07: Highlight offers Scan once, the first time a crooked scan opens, and the file really arrives in Scan.
// The page has to be a picture of a sheet, and only a real browser draws it and runs the check, so jsdom cannot prove this.

test.use({ serviceWorkers: 'block' });

/** A one-page PDF that is one picture of a sheet whose rows lean by `degrees`. */
async function scanPdf(page, degrees, text = '') {
  const dataUrl = await page.evaluate((angle) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1400;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f2f0ec';
    ctx.fillRect(0, 0, 1000, 1400);
    ctx.translate(500, 700);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.fillStyle = '#222';
    for (let row = 0; row < 34; row += 1) {
      for (let word = 0; word < 9; word += 1) ctx.fillRect(-380 + word * 86, -560 + row * 33, 70 - ((row + word) % 3) * 12, 12);
    }
    return canvas.toDataURL('image/png');
  }, degrees);
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(dataUrl);
  const sheet = doc.addPage([600, 840]);
  sheet.drawImage(image, { x: 0, y: 0, width: 600, height: 840 });
  if (text) sheet.drawText(text, { x: 60, y: 780, size: 18, font: await doc.embedFont(StandardFonts.Helvetica) });
  return Buffer.from(await doc.save());
}

const offer = (page) => page.locator('[data-scan-offer]');
const CHECK_MS = 20_000;
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.scanChecks = [];
    const send = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      void Promise.resolve(typeof data === 'string' ? data : data?.text?.()).then((body) => {
        if (body?.includes('highlight_scan_check')) window.scanChecks.push(body);
      });
      return send(url, data);
    };
  });
});

/** Waits for the silent check on this page to answer `outcome`, so that "no line" proves something. */
async function checkAnswers(page, outcome) {
  await expect.poll(() => page.evaluate(() => window.scanChecks.join()), { timeout: CHECK_MS }).toContain(`"outcome":"${outcome}"`);
}

test('a crooked scan is offered Scan once, and Straighten carries the file there', async ({ page }) => {
  await page.goto('/highlight-pdf/');
  const buffer = await scanPdf(page, 3);
  const file = { name: 'crooked.pdf', buffer };
  await openTool(page, '/highlight-pdf/', { file, overlaySelector: '[data-page-overlay]' });
  const before = await page.locator('[data-page-overlay]').first().boundingBox();
  await expect(offer(page)).toContainText('This scan leans a little.', { timeout: CHECK_MS });
  await expect(offer(page)).toBeInViewport({ ratio: 1 });
  expect(await page.locator('[data-page-overlay]').first().boundingBox()).toEqual(before);

  await offer(page).getByRole('button', { name: 'Straighten' }).click();
  await page.waitForURL('**/scan-to-pdf/');
  await expect(page.locator('[data-table-page]')).toHaveCount(1, { timeout: 30_000 });

  // PE-09: the straightened copy comes back to Highlight and reads as straight, so the line never offers it twice.
  await page.getByRole('button', { name: 'Highlight', exact: false }).first().click({ timeout: 30_000 });
  await page.waitForURL('**/highlight-pdf/');
  await page.locator('[data-page-overlay]').first().waitFor({ timeout: 30_000 });
  await checkAnswers(page, 'straight');
  await expect(offer(page)).toHaveCount(0);
});

test('the offer does not come back for a file that has had it', async ({ page }) => {
  await page.goto('/highlight-pdf/');
  const file = { name: 'crooked.pdf', buffer: await scanPdf(page, 3) };
  await openTool(page, '/highlight-pdf/', { file, overlaySelector: '[data-page-overlay]' });
  await offer(page).getByRole('button', { name: 'Keep as is' }).click({ timeout: CHECK_MS });
  await expect(offer(page)).toHaveCount(0);
  await page.reload();
  await page.locator('[data-page-overlay]').first().waitFor();
  await checkAnswers(page, 'lean');
  await expect(offer(page)).toHaveCount(0);
});

test('a scan with hidden text is offered too, and the first mark takes the line away', async ({ page }) => {
  await page.goto('/highlight-pdf/');
  const file = { name: 'with-text.pdf', buffer: await scanPdf(page, 3, 'Recognised text on the scanned page') };
  await openTool(page, '/highlight-pdf/', { file, overlaySelector: '[data-page-overlay]' });
  await expect(offer(page)).toHaveCount(1, { timeout: CHECK_MS });

  const box = await page.locator('[data-page-overlay]').first().boundingBox();
  const y = box.y + box.height * ((840 - 786) / 840);
  await page.mouse.move(box.x + box.width * (64 / 600), y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (300 / 600), y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('[data-page-overlay] [data-element-id]')).toHaveCount(1);
  await expect(offer(page)).toHaveCount(0);
});
