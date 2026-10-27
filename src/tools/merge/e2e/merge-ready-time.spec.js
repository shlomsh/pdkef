import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readFile } from 'node:fs/promises';

/* MERGE-12: the merge is built in the background, so Download is instant.
   Budget: under 500ms of real work for 20 files / 200 pages. The wait before
   the build (src/lib/quietPrepare.ts's DEFAULT_QUIET, 1500ms) is the policy,
   not the work, and is not in the number; QUAL-30 has the history. A distinct
   page width per file lets pdf-lib identify which file's page ended up first
   in the output, without drawing any text (kept small and fast to build).

   Direction A (2026-09-13): the file rows this spec waits on are the rail's
   (MergeRail.module.css's `.file-row`), a 320px glance-at column beside the
   document grid, not a full-width list. */
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

test('Download is built within the budget once it is warmed, for a 20-file, 200-page set', async ({ page }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const files = await buildFixtureFiles();

  await page.locator('input[type="file"]').setInputFiles(files);
  const rows = page.locator('ul[class*="file-list"] > li[class*="file-row"]');
  await expect(rows).toHaveCount(FILE_COUNT);
  // The set is known once every row has its page count. What comes before it
  // (inspecting twenty files, rendering twenty thumbnails) is work per file
  // added, not the merge this guards. The rail row (MergeRail.module.css's
  // `.file-pages`) shows the raw count, not a localized "N pages" string -
  // "…" until inspectPdf resolves it.
  await expect(rows.last().locator('[class*="file-pages"]')).not.toHaveText('…');

  // Focusing the Download element is what a hover or a keyboard visit does: it
  // ends the quiet wait and starts the build (DownloadElement's onFocus, then
  // usePreparedOutput's prepareNow). The clock and the watcher both live in the
  // page, because Playwright's expect() polls at 100, 250 and 500ms, then every
  // second: a link that appeared at 1.6s was reported at 1.85s, and one that
  // appeared at 1.9s at 2.85s (QUAL-30).
  const buildMs = await page.evaluate(() => new Promise((resolve, reject) => {
    const element = [...document.querySelectorAll('a[data-state]')].find((a) => /Download merged PDF/.test(a.textContent || ''));
    if (!element) { reject(new Error('The Download element is not on the page')); return; }
    const built = () => !!document.querySelector('a[href^="blob:"][download]');
    if (built()) { reject(new Error('The merge was built before the Download element was warmed')); return; }
    const startedAt = performance.now();
    const watcher = new MutationObserver(() => {
      if (!built()) return;
      watcher.disconnect();
      resolve(performance.now() - startedAt);
    });
    watcher.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });
    setTimeout(() => { watcher.disconnect(); reject(new Error('The merge was not built within 8s of warming')); }, 8_000);
    element.focus();
  }));
  // eslint-disable-next-line no-console
  console.log(`MERGE-12: built ${buildMs.toFixed(1)}ms after warming for ${FILE_COUNT} files / ${FILE_COUNT * PAGES_PER_FILE} pages`);
  // MERGE-12 asks for under 500ms on desktop: 331 to 363ms here (macOS,
  // 2026-10-27). CI's runners are slower and vary. CDP CPU throttling gives
  // 740 to 790ms at 2x, 1190 to 1300ms at 3x, 1710 to 1980ms at 4x, 2230 to
  // 2350ms at 5x, 2700 to 2890ms at 6x. The old whole-window reading (the
  // 1500ms wait, the build and up to half a second of poll lag) failed its
  // 2600ms bound at 3x with the app unchanged, the same 2.5 to 2.9s CI read
  // on its slow runners. 2500ms passes a CPU five times slower and fails one
  // six times slower, with about twice the headroom the 3x figure needs. The
  // first CI run that prints the line above replaces these throttle-derived
  // figures.
  expect(buildMs).toBeLessThan(2500);

  const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
  await expect(downloadLink).toHaveAttribute('href', /^blob:/);

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
  await expect(page.locator('ul[class*="file-list"] > li[class*="file-row"]')).toHaveCount(FILE_COUNT);

  // Direction A folded Reverse into the rail's Sort select as its own
  // option, rather than a separate "Reverse order" button. Fired as soon as
  // the select exists, well inside the 600ms idle window a fresh pre-merge
  // is waiting out - this cancels it and restarts against the reversed
  // order. Scoped to the rail: the phone chip row's "⋯" menu carries the
  // same select, CSS-hidden at this (desktop) viewport but still in the DOM.
  await page.locator('[class*="rail"] button[aria-label^="Sort:"]').click();
  await page.getByRole('option', { name: 'Reversed' }).click();

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
