import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

/* Direction A (2026-09-13): MERGE-06, re-measured at 375 x 812 (the size the
   critique used) against the rebuilt phone layout - a horizontally
   scrolling chip row (`ul[class*="chip-row"]`) replacing the add bar and
   the rail's file list, sticky per-file captions, an "Edit pages" toggle
   that reveals the grid's 44px controls, and the rail collapsing to a
   sticky bottom sheet (Download, then Share/Compress it/Sign it/Options).
   This spec runs under the `webkit` project (added to its testMatch in
   playwright.config.js) at iPhone 15, which is already this size; it also
   runs on `chromium` (the project every other Merge spec uses), where we
   set the viewport ourselves so the same assertions catch a regression on
   both engines. */
async function useMobileViewport(page, testInfo) {
  if (testInfo.project.name === 'chromium') {
    await page.setViewportSize({ width: 375, height: 812 });
  }
}

async function makePdfBuffer(label) {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  document.setTitle(label);
  return Buffer.from(await document.save());
}

test.describe('Merge on a phone (MERGE-06)', () => {
  test('empty state: Choose files lands within the first screen', async ({ page }, testInfo) => {
    await useMobileViewport(page, testInfo);
    await page.goto('/merge/');
    await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

    const chooseButton = page.getByText('Choose files', { exact: true });
    await expect(chooseButton).toBeVisible();
    const box = await chooseButton.boundingBox();
    if (!box) throw new Error('Choose files has no bounding box');
    expect(box.y).toBeLessThan(600);
  });

  test('loaded state: no horizontal overflow, the chip row is visible, Download fits the viewport', async ({ page }, testInfo) => {
    await useMobileViewport(page, testInfo);
    await page.goto('/merge/');
    await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

    const files = await Promise.all(['one.pdf', 'two.pdf'].map(async (name) => ({
      name,
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(name),
    })));
    await page.locator('input[type="file"]').setInputFiles(files);

    const chipRow = page.locator('ul[class*="chip-row"]');
    await expect(chipRow).toBeVisible();
    await expect(chipRow.locator('> li').first()).toBeVisible();

    // Nothing on the page forces the document itself to scroll sideways -
    // the chip row scrolls internally, the page does not.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth !== document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);

    const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
    await expect(downloadLink).toBeVisible({ timeout: 10_000 });
    const viewportSize = page.viewportSize();
    if (!viewportSize) throw new Error('No viewport size');
    const downloadBox = await downloadLink.boundingBox();
    if (!downloadBox) throw new Error('Download element has no bounding box');
    // Fully inside the viewport, with no scrolling required: it lives in the
    // sticky bottom sheet.
    expect(downloadBox.x).toBeGreaterThanOrEqual(0);
    expect(downloadBox.y).toBeGreaterThanOrEqual(0);
    expect(downloadBox.x + downloadBox.width).toBeLessThanOrEqual(viewportSize.width + 1);
    expect(downloadBox.y + downloadBox.height).toBeLessThanOrEqual(viewportSize.height + 1);
  });

  test('"Edit pages" reveals the 44px page controls', async ({ page, browser }, testInfo) => {
    // The toggle itself is CSS-hidden under `@media (hover: hover) and
    // (pointer: fine)` (MergeDocument.module.css) - it exists for touch
    // devices only. `setViewportSize` alone (what every other test in this
    // file uses) narrows the chromium viewport but leaves it a mouse-driven,
    // hover-capable context, so the toggle would stay hidden and unclickable
    // there regardless of width. This test needs a real touch context on
    // chromium; webkit's iPhone 15 project already provides one, so it keeps
    // using the shared `page` fixture.
    let work = page;
    let touchContext;
    if (testInfo.project.name === 'chromium') {
      touchContext = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
      work = await touchContext.newPage();
    }

    await work.goto('/merge/');
    await work.locator('astro-island[client="load"]:not([ssr])').waitFor();

    const files = await Promise.all(['one.pdf', 'two.pdf'].map(async (name) => ({
      name,
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(name),
    })));
    await work.locator('input[type="file"]').setInputFiles(files);

    const firstCard = work.locator('ul[class*="grid"] > li[data-key]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    const rotateButton = firstCard.getByRole('button', { name: /^Rotate page/ });

    // Before "Edit pages", the actions cluster is not usable on touch (no
    // hover, no focus-within from a tap alone).
    await expect(rotateButton).toBeHidden();

    await work.getByRole('button', { name: 'Edit pages', exact: true }).click();

    await expect(rotateButton).toBeVisible();
    // The 32px visual button (PageStrip.module.css) carries a 44px hit area
    // through a `::before` pseudo-element (inset -7px), which Playwright
    // cannot measure by bounding box - so this proves the hit area the way a
    // finger would: a tap 5px outside the visible button (inside the 7px
    // pseudo inset, outside the 32px box) still rotates the page.
    const box = await rotateButton.boundingBox();
    if (!box) throw new Error('Rotate button has no bounding box');
    await work.mouse.click(box.x + box.width / 2, box.y - 5);
    await expect(firstCard).toHaveAttribute('data-rotation', '90');

    if (touchContext) await touchContext.close();
  });

  test('the two-tap path holds at 375px', async ({ page }, testInfo) => {
    await useMobileViewport(page, testInfo);
    await page.goto('/merge/');
    await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

    const files = await Promise.all(['a.pdf', 'b.pdf'].map(async (name) => ({
      name,
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(name),
    })));
    await page.locator('input[type="file"]').setInputFiles(files);

    const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
    await expect(downloadLink).toBeVisible({ timeout: 10_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadLink.click(),
    ]);
    expect(download.suggestedFilename()).toBe('merged_a.pdf');
  });
});
