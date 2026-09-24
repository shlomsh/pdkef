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

async function makeMultiPagePdfBuffer(label, pageCount) {
  const document = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) document.addPage([612, 792]);
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

  test('touch reorder has an explicit gesture hint and suppresses native long-press targets', async ({ page, browser }, testInfo) => {
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

    await expect(work.getByText('Touch and hold a file or page, then drag to reorder.', { exact: true })).toBeVisible();

    const chip = work.locator('ul[class*="chip-row"] > li').first();
    await expect(chip).toHaveCSS('user-select', 'none');
    await expect(chip).toHaveCSS('cursor', 'grab');
    await expect(chip).toHaveCSS('touch-action', 'pan-y');

    // A chip is a drag target, not a navigation shortcut. Previously its
    // click handler scrolled to the file caption, so a short/aborted drag
    // jumped the document to an apparently random location.
    const scrollBeforeTap = await work.evaluate(() => window.scrollY);
    await chip.click();
    await work.waitForTimeout(150);
    expect(await work.evaluate(() => window.scrollY)).toBe(scrollBeforeTap);

    const thumbnail = work.locator('li[data-key] img').first();
    await expect(thumbnail).toBeVisible({ timeout: 10_000 });
    await expect(thumbnail).toHaveCSS('pointer-events', 'none');
    await expect(thumbnail).toHaveAttribute('draggable', 'false');

    if (touchContext) await touchContext.close();
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

  test('file controls are directly visible and sorting still changes the merged output', async ({ page }, testInfo) => {
    await useMobileViewport(page, testInfo);
    await page.goto('/merge/');
    await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

    const files = await Promise.all(['one.pdf', 'two.pdf', 'three.pdf'].map(async (name) => ({
      name,
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(name),
    })));
    await page.locator('input[type="file"]').setInputFiles(files);

    const body = page.locator('[data-merge-file-controls]');
    await expect(body).toBeVisible();
    const box = await body.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error('Controls or viewport unavailable');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);

    await expect(body.getByRole('button', { name: 'Add files', exact: true })).toBeVisible();
    await expect(body.getByRole('button', { name: 'Clear all', exact: true })).toBeVisible();
    await expect(body.locator('button[aria-haspopup="listbox"]')).toBeVisible();
    await expect(body.getByRole('checkbox', { name: 'Add page numbers' })).toBeVisible();
    await expect(page.locator('summary', { hasText: '⋯' })).toHaveCount(0);
    const cards = page.locator('ul[class*="grid"] > li[data-key]');
    await expect(cards).toHaveCount(3);
    await body.locator('button[aria-haspopup="listbox"]').click();
    await page.getByRole('option', { name: 'Reversed' }).click();
    await expect(cards.first()).toHaveAttribute('aria-label', /three\.pdf/);
    await body.getByRole('checkbox').check();
    await expect(body.getByRole('checkbox')).toBeChecked();
  });

  for (const route of ['/merge/', '/he/merge/']) {
    test(`visible mobile file controls fit in ${route} and leave the desktop controls in place`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(route);
      await page.locator('astro-island[client="load"]:not([ssr])').waitFor();
      await page.locator('input[type="file"]').setInputFiles(await Promise.all(['one.pdf', 'two.pdf'].map(async (name) => ({
        name, mimeType: 'application/pdf', buffer: await makePdfBuffer(name),
      }))));
      const controls = page.locator('[data-merge-file-controls]');
      for (const width of [320, 375, 768]) {
        await page.setViewportSize({ width, height: 812 });
        await expect(controls).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const cardBox = await page.locator('[data-hide-identity][data-tool-loaded]').boundingBox();
        if (!cardBox) throw new Error('Loaded Merge card unavailable');
        const expectedGutter = width < 560 ? 16 : 24;
        expect(cardBox.x).toBeLessThanOrEqual(expectedGutter + 1);
        expect(cardBox.width).toBeGreaterThanOrEqual(width - (expectedGutter * 2) - 1);
        const controlsBox = await controls.boundingBox();
        if (!controlsBox) throw new Error('Mobile controls unavailable');
        expect(controlsBox.height).toBeLessThanOrEqual(56);
        for (const control of await controls.locator('button, select, label').all()) {
          await control.scrollIntoViewIfNeeded();
          await expect(control).toBeVisible();
          const controlBox = await control.boundingBox();
          expect(controlBox.x).toBeGreaterThanOrEqual(0);
          expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(width);
        }
        await controls.locator('button[aria-haspopup="listbox"]').click();
        await page.locator('[role="option"][data-value="reversed"]').click();
        await expect(page.locator('ul[class*="grid"] > li[data-key]').first()).toHaveAttribute('aria-label', /two\.pdf/);
        await controls.getByRole('checkbox').check();
        await expect(controls.getByRole('checkbox')).toBeChecked();
        await controls.locator('button[aria-haspopup="listbox"]').click();
        await page.locator('[role="option"][data-value="added"]').click();
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      await expect(controls).toBeHidden();
      await expect(page.locator('ul[class*="file-list"]')).toBeVisible();
      await expect(page.locator('[class*="rail-pinned"] a[download]')).toBeVisible();
      await expect(page.locator('.trust-chips')).toBeVisible();
    });
  }

  /* Review finding (2026-09-14): the caption's own negative bottom margin
     (visual tightening, PageStrip.module.css) pulls the first row of its
     run up underneath it; combined with `position: sticky` and its
     z-index that overlap was a real hit-test region, not only a paint one
     - measured, caption bottom 404.53px vs. first-row cell top 398.14px, a
     6.39px band where `elementFromPoint` returned the caption `<li>`
     instead of the cell, swallowing the tap. The caption's `::before` now
     restores pointer events everywhere except that sliver, so the tap
     falls through to the cell there while the caption's own label stays a
     valid hit target elsewhere (critique P0 guard, merge-direction-a.spec.js). */
  test('the sticky per-file caption never intercepts a tap on the row beneath it', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/merge/');
    await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

    // A run of 4 or more pages gets a full-width caption (PageStrip.tsx).
    const buffer = await makeMultiPagePdfBuffer('four-pages', 4);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'four-pages.pdf',
      mimeType: 'application/pdf',
      buffer,
    });

    const caption = page.locator('li[data-caption-for]').first();
    await expect(caption).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('li[data-key]').first()).toBeVisible();

    const hit = await page.evaluate(() => {
      const firstCell = document.querySelector('li[data-key]');
      const rect = firstCell.getBoundingClientRect();
      // 5px inside the cell's own top-left corner - the exact point the
      // review's caption-overlap.mjs measured the caption swallowing.
      const el = document.elementFromPoint(rect.left + 5, rect.top + 5);
      return {
        dataKey: el?.closest('[data-key]')?.getAttribute('data-key') ?? null,
        dataCaptionFor: el?.closest('[data-caption-for]')?.getAttribute('data-caption-for') ?? null,
      };
    });
    expect(hit.dataCaptionFor).toBeNull();
    expect(hit.dataKey).not.toBeNull();
  });
});
