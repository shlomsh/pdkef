import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, PDFName, PDFArray, PDFDict } from '@cantoo/pdf-lib';
import { analyzePdf } from '../analyzePdf.js';

// COMP-01 - the floors the tool's copy may quote, measured with the real
// encoder in a real browser on the committed fixtures. A change that drops
// below these floors must change the copy in the same commit (COMP-01).

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name));

async function compress(page, fixture, levelTitle) {
  await page.goto('/compress/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: fixture, mimeType: 'application/pdf', buffer: read(fixture) });
  await page.getByRole('radio', { name: new RegExp(levelTitle) }).click();
  await page.getByRole('button', { name: 'Compress PDF' }).click();
  await expect(page.locator('a[download], :text("Already as small as it gets")').first()).toBeVisible({ timeout: 60_000 });
}

async function compressAndDownload(page, fixture, levelTitle) {
  await compress(page, fixture, levelTitle);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('a[download]').first().click();
  const file = await (await downloadPromise).path();
  const bytes = fs.readFileSync(file);
  const before = read(fixture).length;
  const saved = 1 - bytes.length / before;
  console.log(`[COMP-01 KPI] ${fixture} @ ${levelTitle}: ${before} -> ${bytes.length} (${(saved * 100).toFixed(1)}% smaller)`);
  return { bytes, saved, size: bytes.length };
}

test.describe('compress KPI (COMP-01)', () => {
  test('scan.pdf at Recommended is at least 40% smaller', async ({ page }) => {
    const { saved } = await compressAndDownload(page, 'scan.pdf', 'Recommended');
    expect(saved).toBeGreaterThanOrEqual(0.4);
  });

  test('mixed.pdf at Recommended is at least 25% smaller and keeps its text and link', async ({ page }) => {
    const { bytes, saved } = await compressAndDownload(page, 'mixed.pdf', 'Recommended');
    expect(saved).toBeGreaterThanOrEqual(0.25);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(analyzePdf(doc, { totalBytes: bytes.length }).hasText).toBe(true);
    const annots = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    expect(annots.size()).toBe(1);
    const annot = annots.lookup(0, PDFDict);
    const action = annot.lookup(PDFName.of('A'), PDFDict);
    expect(action.lookup(PDFName.of('URI')).decodeText()).toBe('https://example.com/');
  });

  for (const fixture of ['text-only.pdf', 'vector-drawing.pdf']) {
    test(`${fixture} at Recommended has nothing to shrink and offers no download`, async ({ page }) => {
      await page.goto('/compress/');
      await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
      const chooser = page.waitForEvent('filechooser');
      await page.getByText('Choose file', { exact: true }).click();
      await (await chooser).setFiles({ name: fixture, mimeType: 'application/pdf', buffer: read(fixture) });
      await expect(page.getByRole('note').filter({ hasText: 'Nothing here to shrink.' })).toBeVisible();
      await page.getByRole('radio', { name: /Recommended/ }).click();
      await page.getByRole('button', { name: 'Compress PDF' }).click();
      await expect(page.getByText('Already as small as it gets', { exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('a[download]')).toHaveCount(0);
    });
  }

  test('scan.pdf shrinks more at each stronger level', async ({ page }) => {
    const extreme = await compressAndDownload(page, 'scan.pdf', 'Extreme Compression');
    const recommended = await compressAndDownload(page, 'scan.pdf', 'Recommended');
    const high = await compressAndDownload(page, 'scan.pdf', 'High Quality');
    expect(extreme.size).toBeLessThan(recommended.size);
    expect(recommended.size).toBeLessThan(high.size);
  });
});
