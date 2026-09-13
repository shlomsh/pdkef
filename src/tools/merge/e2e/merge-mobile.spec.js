import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

/* Direction A (2026-09-13): MERGE-06, re-measured at 375 x 812 (the size the
   critique used) against the rebuilt phone layout - a horizontally
   scrolling chip row (`ul[class*="chip-row"]`) replacing the add bar and
   the rail's file list, sticky per-file captions, a tap on a page cell that
   reveals that cell's own 44px controls (there is no Edit pages mode any
   more), and the rail collapsing to a sticky bottom sheet (Download, then
   Share/Compress it/Sign it/Options).
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

  test("a tap on a page reveals that page's 44px controls, and only that page's", async ({ page, browser }, testInfo) => {
    // There is no Edit pages mode any more (Shlomi, 2026-09-13): a tap on a
    // page cell reveals that cell's own rotate/skip/open cluster, and
    // tapping elsewhere lets go of it. This needs a real touch context on
    // chromium (a narrowed mouse-driven viewport never reveals a cluster by
    // tapping); webkit's iPhone 15 project already provides one, so it
    // keeps using the shared `page` fixture.
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

    const cards = work.locator('ul[class*="grid"] > li[data-key]');
    const firstCard = cards.nth(0);
    const secondCard = cards.nth(1);
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    const rotateButton = firstCard.getByRole('button', { name: /^Rotate page/ });

    // Before any tap, neither cell's cluster is usable on touch (no hover,
    // no focus-within from a tap alone).
    await expect(rotateButton).toBeHidden();

    await firstCard.tap();

    await expect(rotateButton).toBeVisible();
    // Only the tapped cell's cluster is displayed - the untapped neighbour's
    // stays hidden, even though the selected cluster may visually overhang
    // it (PageStrip.module.css, the phone media query).
    const secondActions = secondCard.locator('[class*="actions"]');
    await expect(secondActions).toBeHidden();

    // Review (2026-09-13): on a coarse pointer the button's own border box
    // IS the 44x44 hit area, with the 32px visual chrome on an inner glyph
    // span (PageStrip.module.css `@media (pointer: coarse)`), so a plain
    // rect measurement proves it - no pseudo-element to tap around. A tap
    // 5px inside the button's top edge (outside the 32px glyph) still
    // rotates the page.
    const box = await rotateButton.boundingBox();
    if (!box) throw new Error('Rotate button has no bounding box');
    expect(Math.round(box.width)).toBe(44);
    expect(Math.round(box.height)).toBe(44);
    await work.mouse.click(box.x + box.width / 2, box.y + 5);
    await expect(firstCard).toHaveAttribute('data-rotation', '90');

    // Tapping the second page moves the selection: the first card's cluster
    // is let go of, and the second's shows.
    await secondCard.tap();
    await expect(rotateButton).toBeHidden();
    await expect(secondCard.getByRole('button', { name: /^Rotate page/ })).toBeVisible();

    // Tapping outside the grid entirely lets go of the selection.
    await work.locator('h1').first().tap();
    await expect(secondCard.getByRole('button', { name: /^Rotate page/ })).toBeHidden();

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

  /* Team-lead follow-up (2026-09-13): the phone "…" popover's entries, top
     to bottom - Add files, Clear all, Sort (or Reset order once rearranged,
     never both at once), Add page numbers. Nothing else in it (no
     "Options"), and it stays inside the viewport. */
  test('the "…" popover lists Add files, Clear all, Sort, Add page numbers, in that order', async ({ page }, testInfo) => {
    await useMobileViewport(page, testInfo);
    await page.goto('/merge/');
    await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

    const files = await Promise.all(['one.pdf', 'two.pdf', 'three.pdf'].map(async (name) => ({
      name,
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(name),
    })));
    await page.locator('input[type="file"]').setInputFiles(files);

    const more = page.locator('summary', { hasText: '⋯' }).first();
    await expect(more).toBeVisible({ timeout: 10_000 });
    await more.click();

    const body = page.locator('[class*="chip-menu-body"]').first();
    await expect(body).toBeVisible();
    const box = await body.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error('Popover or viewport unavailable');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);

    const kinds = await body.evaluate((el) => Array.from(el.children).map((child) => {
      if (child.matches('label[class*="sort-select-wrap"]')) return 'sort';
      if (child.matches('[class*="rearranged-note"]')) return 'reset-order';
      if (child.matches('label[class*="page-numbers-row"]')) return 'page-numbers';
      if (child.tagName === 'BUTTON') return child.textContent.trim();
      return child.textContent.trim();
    }));
    expect(kinds).toEqual(['Add files', 'Clear all', 'sort', 'page-numbers']);
    expect(kinds).not.toContain('Options');
  });
});
