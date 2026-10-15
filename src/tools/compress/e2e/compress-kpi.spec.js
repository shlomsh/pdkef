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

// Picking a file starts a run at once and any option change starts another: wait for a run newer
// than `after` to finish.
const runOf = (page) => page.locator('[data-compress-run]').first().getAttribute('data-compress-run').then(Number);
async function waitForDone(page, after = 0) {
  await expect.poll(async () => {
    const root = page.locator('[data-compress-status]').first();
    if ((await root.getAttribute('data-compress-status')) !== 'done') return false;
    return Number(await root.getAttribute('data-compress-run')) > after;
  }, { timeout: 60_000 }).toBe(true);
}

async function chooseLevel(page, levelTitle) {
  const radio = page.getByRole('radio', { name: levelTitle });
  if ((await radio.getAttribute('aria-checked')) === 'true' || (await radio.isChecked().catch(() => false))) return;
  const before = await runOf(page);
  await radio.click();
  await waitForDone(page, before);
}

async function compress(page, fixture, levelTitle) {
  await page.goto('/compress/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: fixture, mimeType: 'application/pdf', buffer: read(fixture) });
  await waitForDone(page);
  await chooseLevel(page, levelTitle);
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
  test('scan.pdf at Balanced is at least 40% smaller', async ({ page }) => {
    const { saved } = await compressAndDownload(page, 'scan.pdf', 'Balanced');
    expect(saved).toBeGreaterThanOrEqual(0.4);
  });

  test('mixed.pdf at Balanced is at least 25% smaller and keeps its text and link', async ({ page }) => {
    const { bytes, saved } = await compressAndDownload(page, 'mixed.pdf', 'Balanced');
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
    test(`${fixture} at Balanced has nothing to shrink and offers no download`, async ({ page }) => {
      await page.goto('/compress/');
      await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
      const chooser = page.waitForEvent('filechooser');
      await page.getByText('Choose file', { exact: true }).click();
      await (await chooser).setFiles({ name: fixture, mimeType: 'application/pdf', buffer: read(fixture) });
      await waitForDone(page);
      await expect(page.locator('[data-compress-strip]').getByText('Nothing here to shrink.')).toBeVisible();
      await expect(page.getByText('Already as small as it gets', { exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('a[download]')).toHaveCount(0);
    });
  }

  test('scan.pdf shrinks more at each stronger level', async ({ page }) => {
    const extreme = await compressAndDownload(page, 'scan.pdf', 'Smallest');
    const recommended = await compressAndDownload(page, 'scan.pdf', 'Balanced');
    const high = await compressAndDownload(page, 'scan.pdf', 'Sharpest');
    expect(extreme.size).toBeLessThan(recommended.size);
    expect(recommended.size).toBeLessThan(high.size);
  });
});
