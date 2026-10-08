import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// RED-62: some forms draw a title twice, the second copy a hair to the side,
// to fake bold. Every reader of page words (Find, the saved-file check) must
// see each word once, not "EEmmppllooyyee". Only a browser runs pdf.js's real
// text items through the real Find and the real export + check.

const TITLE = 'Employee Card';
const HEBREW_TITLE = 'כרטיס עובד';

async function makeFixture() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([300, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const hebrew = await doc.embedFont(fs.readFileSync('public/fonts/Heebo-Regular.ttf'), { subset: true });
  for (const dx of [0, 0.4]) {
    page.drawText(TITLE, { x: 40 + dx, y: 330, size: 24, font });
    page.drawText(HEBREW_TITLE, { x: 40 + dx, y: 280, size: 24, font: hebrew });
  }
  page.drawText('Name: Dana Levi', { x: 40, y: 200, size: 14, font });
  return Buffer.from(await doc.save());
}

async function openFixture(page) {
  await page.goto('/redact');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: 'overprinted.pdf', mimeType: 'application/pdf', buffer: await makeFixture() });
  await expect(page.locator('[class*="page-wrapper"]').first()).toBeVisible();
}

test('Find reads an overprinted title once', async ({ page }) => {
  await openFixture(page);
  await page.locator('[data-redact-find-toggle]').click();
  await page.locator('[data-redact-find-input]').fill('Employee');
  await expect(page.locator('[data-redact-find-status]')).toHaveText(/^1 of 1\b/);
  await page.locator('[data-redact-find-input]').fill(HEBREW_TITLE);
  await expect(page.locator('[data-redact-find-status]')).toHaveText(/^1 of 1\b/);
});

test('the saved-file check lists a covered overprinted title as the words it says', async ({ page }) => {
  await openFixture(page);
  const toolbar = page.getByRole('toolbar', { name: 'PDF redaction' });
  await toolbar.getByRole('button', { name: 'Blackout', exact: true }).click();
  const overlay = page.locator('.redact-draw-area').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('page overlay has no bounding box');
  // Title: baseline 330 of 400, 24pt, so about y 322..350 from the bottom.
  const at = (x, y) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  const from = at(30 / 300, (400 - 352) / 400);
  const to = at(230 / 300, (400 - 322) / 400);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[class*="redact-box"]')).toHaveCount(1);

  await Promise.all([
    page.waitForEvent('download'),
    toolbar.getByRole('button', { name: 'Download', exact: true }).click(),
  ]);

  const check = page.locator('[data-saved-file-check]');
  await expect(check).toBeVisible({ timeout: 15_000 });
  await expect(check.locator(`[data-check-term="${TITLE}"]`)).toHaveCount(1);
  await expect(check.locator('[data-check-term="EEmmppllooyyee CCaarrdd"]')).toHaveCount(0);
});
