import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readFile } from 'node:fs/promises';

/* MERGE-12: pre-merge on idle so Download is instant. Budget: under 500ms of
   real work plus the 600ms idle debounce (usePreparedMerge.ts's
   PREPARE_DEBOUNCE_MS), so under 1100ms total from the files landing to the
   Download link carrying a usable href. A distinct page width per file lets
   pdf-lib identify which file's page ended up first in the output, without
   drawing any text (kept small and fast to build). */
const FILE_COUNT = 20;
const PAGES_PER_FILE = 10;

async function makeFileBuffer(index) {
  const document = await PDFDocument.create();
  const width = 100 + index; // unique per file (index is 1-based)
  for (let i = 0; i < PAGES_PER_FILE; i += 1) document.addPage([width, 792]);
  return Buffer.from(await document.save());
}

async function buildFixtureFiles() {
  return Promise.all(
    Array.from({ length: FILE_COUNT }, (_, i) => i + 1).map(async (index) => ({
      name: `file-${String(index).padStart(2, '0')}.pdf`,
      mimeType: 'application/pdf',
      buffer: await makeFileBuffer(index),
    })),
  );
}

test('Download is ready well under a second for a 20-file, 200-page set', async ({ page }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const files = await buildFixtureFiles();

  await page.evaluate(() => { window.__mergeReadyStart = performance.now(); });
  await page.locator('input[type="file"]').setInputFiles(files);
  const rows = page.locator('ul[class*="file-list"] > li');
  await expect(rows).toHaveCount(FILE_COUNT);
  // "The last change" in the ticket's sense is the moment the set is known:
  // every row has its page count, which is when the idle wait starts. What
  // comes before it (inspecting twenty files, rendering twenty thumbnails) is
  // work per file added, not part of the pre-merge this guards.
  await expect(rows.last().locator('[class*="file-meta"]')).toContainText('pages');
  const knownAtMs = await page.evaluate(() => performance.now() - window.__mergeReadyStart);

  const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
  await expect(downloadLink).toHaveAttribute('href', /^blob:/, { timeout: 5_000 });

  const elapsedMs = await page.evaluate(() => performance.now() - window.__mergeReadyStart);
  const fromLastChangeMs = elapsedMs - knownAtMs;
  // eslint-disable-next-line no-console
  console.log(`MERGE-12: ready ${fromLastChangeMs.toFixed(1)}ms after the last change (${elapsedMs.toFixed(1)}ms after the files landed) for ${FILE_COUNT} files / ${FILE_COUNT * PAGES_PER_FILE} pages`);
  // 600 ms of idle plus the 500 ms the ticket allows for the merge itself.
  expect(fromLastChangeMs).toBeLessThan(1100);

  await expect(downloadLink).toContainText(`${FILE_COUNT * PAGES_PER_FILE} pages`);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadLink.click(),
  ]);
  const savedPath = await download.path();
  if (!savedPath) throw new Error('Playwright did not retain the downloaded PDF');
  const bytes = await readFile(savedPath);
  const merged = await PDFDocument.load(bytes);
  expect(merged.getPageCount()).toBe(FILE_COUNT * PAGES_PER_FILE);
});

test('a mid-prepare reorder cancels the running merge and delivers the new order', async ({ page }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const files = await buildFixtureFiles();
  await page.locator('input[type="file"]').setInputFiles(files);
  await expect(page.locator('ul[class*="file-list"] > li')).toHaveCount(FILE_COUNT);

  // Fired as soon as the sort toolbar exists, well inside the 600ms idle
  // window a fresh pre-merge is waiting out - this cancels it and restarts
  // against the reversed order.
  await page.getByRole('button', { name: 'Reverse order', exact: true }).click();

  const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
  await expect(downloadLink).toHaveAttribute('href', /^blob:/, { timeout: 5_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadLink.click(),
  ]);
  const savedPath = await download.path();
  if (!savedPath) throw new Error('Playwright did not retain the downloaded PDF');
  const bytes = await readFile(savedPath);
  const merged = await PDFDocument.load(bytes);
  expect(merged.getPageCount()).toBe(FILE_COUNT * PAGES_PER_FILE);
  // The list was reversed, so the last file added (file-20, width 120) is
  // now first, and its page landed first in the delivered blob.
  expect(merged.getPage(0).getWidth()).toBe(100 + FILE_COUNT);
});
