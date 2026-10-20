import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

/* Shlomi 2026-10-20: under Sign's Download/Share pair, once a signed export
   exists, "Compress it" and "Redact it" carry that file on (Merge's done
   state is the model). They show only for the export of the document as it
   stands: any further edit retires them, so a stale file is never handed on. */

async function makeFixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 500]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Hand-off fixture', { x: 40, y: 440, size: 18, font });
  return Buffer.from(await doc.save());
}

async function openAndWhiteout(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sign/?next=0');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-tool-shell], main').getByText(/Choose file/).first().click();
  await (await chooser).setFiles({ name: 'handoff.pdf', mimeType: 'application/pdf', buffer: await makeFixture() });
  const pageArea = page.locator('[class*="page-wrapper"]').first();
  await expect(pageArea).toBeVisible();
  await page.locator('[role="toolbar"]').first().getByRole('button', { name: 'Whiteout', exact: true }).click();
  return pageArea;
}

async function dragBox(page, pageArea, from, to) {
  await pageArea.scrollIntoViewIfNeeded();
  const area = await pageArea.boundingBox();
  await page.mouse.move(area.x + area.width * from[0], area.y + area.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * to[0], area.y + area.height * to[1], { steps: 6 });
  await page.mouse.up();
}

test('after a signed download, Compress it and Redact it carry the file on', async ({ page }) => {
  const pageArea = await openAndWhiteout(page);
  await dragBox(page, pageArea, [0.3, 0.3], [0.6, 0.4]);
  await expect(page.getByRole('button', { name: 'Compress it' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Redact it' })).toHaveCount(0);

  const completion = page.locator('[class*="export-actions"]').last();
  const downloaded = page.waitForEvent('download');
  await completion.getByRole('button', { name: 'Download', exact: true }).click();
  await downloaded;

  const compress = page.getByRole('button', { name: 'Compress it' });
  const redact = page.getByRole('button', { name: 'Redact it' });
  await expect(compress).toBeVisible();
  await expect(redact).toBeVisible();
  const [a, b] = [await compress.boundingBox(), await redact.boundingBox()];
  expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);

  await redact.click();
  await page.waitForURL(/\/redact\/$/);
  await expect(page.locator('[class*="page-wrapper"]').first()).toBeVisible();
  await expect(page.getByText(/^signed_/).first()).toBeVisible();
});

test('another edit after the download retires the hand-offs', async ({ page }) => {
  const pageArea = await openAndWhiteout(page);
  await dragBox(page, pageArea, [0.3, 0.3], [0.6, 0.4]);
  const completion = page.locator('[class*="export-actions"]').last();
  const downloaded = page.waitForEvent('download');
  await completion.getByRole('button', { name: 'Download', exact: true }).click();
  await downloaded;
  await expect(page.getByRole('button', { name: 'Compress it' })).toBeVisible();

  await page.locator('[role="toolbar"]').first().getByRole('button', { name: 'Whiteout', exact: true }).click();
  await dragBox(page, pageArea, [0.3, 0.75], [0.6, 0.9]  /* below the floating toolbar */);
  await expect(page.getByRole('button', { name: 'Compress it' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Redact it' })).toHaveCount(0);
});
