import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

/* MERGE-06: measured at 375 x 812, the size the review used. This spec runs
   under the `webkit` project (added to its testMatch in playwright.config.js)
   at iPhone 15, which is already this size; it also runs on `chromium`
   (the project every other Merge spec uses), where we set the viewport
   ourselves so the same assertions catch a regression on both engines. */
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

  test('loaded state: the sort row is one line, no label wraps', async ({ page }, testInfo) => {
    await useMobileViewport(page, testInfo);
    await page.goto('/merge/');
    await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

    const files = await Promise.all(['one.pdf', 'two.pdf'].map(async (name) => ({
      name,
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(name),
    })));
    await page.locator('input[type="file"]').setInputFiles(files);

    const toolbar = page.getByRole('toolbar', { name: 'Sort' });
    await expect(toolbar).toBeVisible();
    const sortSelect = page.locator('#merge-sort');
    const reverseButton = page.getByRole('button', { name: 'Reverse order', exact: true });

    const [toolbarBox, selectBox, reverseBox] = await Promise.all([
      toolbar.boundingBox(),
      sortSelect.boundingBox(),
      reverseButton.boundingBox(),
    ]);
    if (!toolbarBox || !selectBox || !reverseBox) throw new Error('Sort row boxes are unavailable');

    // Neither control is tall enough to have wrapped its label onto a second line.
    expect(selectBox.height).toBeLessThan(56);
    expect(reverseBox.height).toBeLessThan(56);
    // The row itself is one line: its own height is not meaningfully taller
    // than its tallest child, the way a wrapped two-line toolbar would be.
    expect(toolbarBox.height).toBeLessThan(Math.max(selectBox.height, reverseBox.height) + 24);
  });

  test('the pinned Download control never overlaps the last file row', async ({ page }, testInfo) => {
    await useMobileViewport(page, testInfo);
    await page.goto('/merge/');
    await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

    const files = await Promise.all(
      Array.from({ length: 8 }, (_, i) => `file-${i}.pdf`).map(async (name) => ({
        name,
        mimeType: 'application/pdf',
        buffer: await makePdfBuffer(name),
      })),
    );
    await page.locator('input[type="file"]').setInputFiles(files);
    await expect(page.locator('ul[class*="file-list"] > li')).toHaveCount(8);

    const actionRow = page.locator('[class*="action-row"]').first();
    await expect(actionRow).toBeVisible();
    const viewportSize = page.viewportSize();
    if (!viewportSize) throw new Error('No viewport size');

    const actionBoxBeforeScroll = await actionRow.boundingBox();
    if (!actionBoxBeforeScroll) throw new Error('Action row has no bounding box');
    // It sticks to the bottom edge of the screen.
    expect(actionBoxBeforeScroll.y + actionBoxBeforeScroll.height).toBeLessThanOrEqual(viewportSize.height + 1);

    await page.locator('ul[class*="file-list"] > li').last().scrollIntoViewIfNeeded();
    const [lastRowBox, actionBoxAfterScroll] = await Promise.all([
      page.locator('ul[class*="file-list"] > li').last().boundingBox(),
      actionRow.boundingBox(),
    ]);
    if (!lastRowBox || !actionBoxAfterScroll) throw new Error('Boxes unavailable after scroll');
    // No overlap: the last row is fully above the pinned row once scrolled to the end.
    expect(lastRowBox.y + lastRowBox.height).toBeLessThanOrEqual(actionBoxAfterScroll.y + 1);
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
