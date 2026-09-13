// P1 from the UX review: the page grid used to render thumbnails one every
// ~500ms because `openThumbnailSource` spun up a brand-new pdf.js Worker per
// FILE, not per page. Profiled against this exact fixture set (five 1-page
// PDFs + one 12-page text-only report, 17 pages across 6 files) on astro
// dev, Chromium desktop: opening each file's own first page cost ~200-400ms
// (almost entirely the new Worker's boot/handshake), while every later page
// of a document already open cost ~15-20ms. No main-thread long task ever
// showed up during that gap (`PerformanceObserver('longtask')`), which is
// what ruled out contention with the debounced pre-merge or the draft
// autosave: the wait was real async worker start-up latency, not the main
// thread being busy elsewhere.
//
// `thumbnails.js` now shares one `PDFWorker` across every document it opens
// (see the header comment on `getSharedWorker` there for why a per-document
// `destroy()` still cannot tear down a worker the caller supplied): opening
// a sixth file no longer costs a sixth worker start-up. On the profiling rig
// this took 17 pages from ~2.5s down to ~0.5s, and the 375px draft-restore
// case (reported as zero thumbnails rendered at 5s) down to under 0.5s for
// the first row. Both thresholds below are generous next to those numbers.
import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

// Reloading to exercise the draft-restore path fetches more than one
// dynamically-served asset across the reload; blocking the service worker
// avoids it serving a stale bundle (see merge-restore.spec.js's comment).
test.use({ serviceWorkers: 'block' });

async function makePdfBuffer(label, pageCount, withText) {
  const document = await PDFDocument.create();
  const font = withText ? await document.embedFont(StandardFonts.Helvetica) : null;
  for (let i = 0; i < pageCount; i += 1) {
    const page = document.addPage([200, 300]);
    if (withText) {
      page.drawText(
        `${label} page ${i + 1} of ${pageCount}. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
        { x: 20, y: 250, size: 10, font },
      );
    }
  }
  document.setTitle(label);
  return Buffer.from(await document.save());
}

// Five 1-page PDFs (~1.3KB each) + one 12-page text-only report (~13KB) - the
// reviewer's exact fixture shape, 17 pages across 6 files in all.
async function makeFixtureFiles() {
  return Promise.all([
    ...Array.from({ length: 5 }, (_, i) => [`one-pager-${i + 1}.pdf`, 1, false]),
    ['report.pdf', 12, true],
  ].map(async ([name, pageCount, withText]) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name, pageCount, withText),
  })));
}

test('17 pages across 6 files all render a thumbnail within 2.5s', async ({ page }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  await page.locator('input[type="file"]').setInputFiles(await makeFixtureFiles());

  const thumbs = page.locator('ul[class*="grid"] > li[data-key] img[class*="thumb"]');
  await expect(thumbs).toHaveCount(17, { timeout: 2500 });
});

test('a draft restored at 375px wide renders its visible row within 2.5s of reload', async ({ page }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  await page.locator('input[type="file"]').setInputFiles(await makeFixtureFiles());

  // Prove the RESTORE path, not a fresh load: wait for the merge draft to
  // actually persist (useMergeDraft.ts's 700ms autosave debounce) before
  // reloading.
  await expect(
    page.locator('[class*="draft-status-row"]', { hasText: 'Draft saved' }),
  ).toBeVisible({ timeout: 10_000 });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  // Four columns at 375px wide (PageStrip.tsx's phone `gridMetrics`: a 72px
  // cell plus an 8px gap fits 4 into the 319px card content width) - the
  // first visible row, which must render well before the rest of the grid
  // (the full 17-cell grid can take longer once scrolled out of view).
  const cells = page.locator('ul[class*="grid"] > li[data-key]');
  await Promise.all(
    Array.from({ length: 4 }, (_, i) => expect(
      cells.nth(i).locator('img[class*="thumb"]'),
    ).toBeVisible({ timeout: 2500 })),
  );
});
