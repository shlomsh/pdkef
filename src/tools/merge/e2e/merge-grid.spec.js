import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readFile } from 'node:fs/promises';
import { makePdfBuffer as buildPdf } from '../../../../e2e/support/pdf.js';
import { waitForIsland } from '../../../../e2e/support/tool.js';

/* Direction A (2026-09-13, renamed from merge-strip.spec.js): the document's
   page grid. It wraps (no horizontal strip) and is a `<ul class*="grid">`
   (PageGrid.module.css) of `<li class="page" data-key data-rotation
   data-skipped>` cells plus `<li class="caption" data-caption-for>` label
   rows. Its per-page controls (rotate, skip) are CSS `visibility: hidden`
   until the cell is hovered or focused (or, on touch, until that cell is
   tapped - there is no Edit pages mode) - see PageGrid.module.css's
   `.page:hover .actions, .page:focus-visible .actions,
   .page[data-selected] .actions`. On a pointer-driven project we hover the
   cell before clicking a button inside it. */

// A distinct page width per file lets pdf-lib tell the merged output's pages
// apart afterwards, without relying on drawn text.
const makePdfBuffer = (label, pageCount, width) => buildPdf(label, { pages: pageCount, size: [width, 792] });

function grid(page) {
  return page.locator('ul[class*="grid"]');
}

function cards(page) {
  return grid(page).locator('> li[data-key]');
}

test('desktop page drag keeps the grabbing cursor for the whole gesture', async ({ page }) => {
  await page.goto('/merge/');
  await waitForIsland(page);

  const buffer = await makePdfBuffer('cursor-check', 2, 300);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'cursor-check.pdf',
    mimeType: 'application/pdf',
    buffer,
  });

  const first = cards(page).first();
  await expect(first).toBeVisible();
  const box = await first.boundingBox();
  if (!box) throw new Error('First page has no bounding box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y + 12, { steps: 3 });

  await expect.poll(() => page.locator('html').getAttribute('data-page-dragging')).toBe('');
  expect(await page.evaluate(({ x: px, y: py }) => {
    const beneathPointer = document.elementFromPoint(px, py);
    return beneathPointer ? getComputedStyle(beneathPointer).cursor : null;
  }, { x: x + 12, y: y + 12 })).toBe('grabbing');

  await page.mouse.up();
  await expect(page.locator('html')).not.toHaveAttribute('data-page-dragging', '');
});

test('the assembled grid: every page, rotate, skip and keyboard reorder land in the export (MERGE-08/09)', async ({ page }) => {
  await page.goto('/merge/');
  await waitForIsland(page);

  // file0: 1 page, width 100. file1: 2 pages, width 200. file2: 3 pages,
  // width 300. file3: 4 pages, width 400. 10 pages total.
  const files = await Promise.all([
    ['file0.pdf', 1, 100],
    ['file1.pdf', 2, 200],
    ['file2.pdf', 3, 300],
    ['file3.pdf', 4, 400],
  ].map(async ([name, pageCount, width]) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name, pageCount, width),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);

  await expect(cards(page)).toHaveCount(10);
  await expect(page.locator('[class*="doc-heading-count"]', { hasText: '10 pages' })).toBeVisible();

  // Wait for every thumbnail and the settled fit (MERGE-24): a page shape that
  // arrives late can still refit the desktop grid and move a card from under
  // the pointer between the hover and the click.
  for (let i = 0; i < 10; i += 1) {
    await expect(cards(page).nth(i).locator('img')).toHaveAttribute('src', /^data:/, { timeout: 10_000 });
  }
  await expect(page.locator('ul[class*="grid"][data-fit-settled]')).toBeVisible();

  // Rotate card 2 (index 1: file1's first page).
  const card2 = cards(page).nth(1);
  await card2.hover();
  await card2.getByRole('button', { name: 'Rotate page 2', exact: true }).click({ force: true });
  await expect(card2).toHaveAttribute('data-rotation', '90');

  // Skip card 3 (index 2: file1's second page).
  const card3 = cards(page).nth(2);
  const card2ThumbBefore = await card2.locator('[class*="thumb-box"]').boundingBox();
  const card3ThumbBefore = await card3.locator('[class*="thumb-box"]').boundingBox();
  await card3.hover();
  await card3.getByRole('button', { name: 'Hide page 3 from the merged PDF', exact: true }).click({ force: true });
  await expect(card3).toHaveAttribute('data-skipped', 'true');
  await expect(card3.getByRole('button', { name: 'Show page 3 in the merged PDF', exact: true })).toBeVisible();
  const card2ThumbAfter = await card2.locator('[class*="thumb-box"]').boundingBox();
  const card3ThumbAfter = await card3.locator('[class*="thumb-box"]').boundingBox();
  if (!card2ThumbBefore || !card3ThumbBefore || !card2ThumbAfter || !card3ThumbAfter) throw new Error('Thumbnail box unavailable');
  expect(Math.abs(card2ThumbBefore.y - card3ThumbBefore.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(card2ThumbAfter.y - card3ThumbAfter.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(card3ThumbAfter.y - card3ThumbBefore.y)).toBeLessThanOrEqual(1);
  await expect(page.locator('[class*="doc-heading-count"]', { hasText: '9 pages' })).toBeVisible();
  // "1 page skipped" - the count uses the same singular/plural pageCountOne
  // string as everywhere else, not a bare number.
  await expect(page.locator('[class*="doc-heading-count"]', { hasText: '1 page skipped' })).toBeVisible();

  // Keyboard: focus card 1 (file0's only page) and move it forward one slot.
  const card1Key = await cards(page).nth(0).getAttribute('data-key');
  await cards(page).nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(cards(page).nth(1)).toHaveAttribute('data-key', card1Key || '');

  const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
  await expect(downloadLink).toBeVisible({ timeout: 10_000 });
  await expect(downloadLink).toContainText('9 pages');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadLink.click(),
  ]);
  const savedPath = await download.path();
  if (!savedPath) throw new Error('Playwright did not retain the downloaded PDF');
  const bytes = await readFile(savedPath);
  const merged = await PDFDocument.load(bytes);
  expect(merged.getPageCount()).toBe(9);

  // The moved page: after moving card1 (file0, width 100) one slot forward,
  // file1's rotated first page (width 200) becomes output page 1.
  const firstOutputPage = merged.getPage(0);
  expect(firstOutputPage.getWidth()).toBe(200);
  expect(firstOutputPage.getRotation().angle).toBe(90);
});

test('dropping a file onto the grid inserts its pages there and flags the rearrangement (MERGE-10)', async ({ page }) => {
  await page.goto('/merge/');
  await waitForIsland(page);

  const files = await Promise.all([
    ['first.pdf', 2, 100],
    ['second.pdf', 3, 200],
  ].map(async ([name, pageCount, width]) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name, pageCount, width),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);
  await expect(cards(page)).toHaveCount(5);

  // Card index 1 is first.pdf's second page - inside first.pdf's run, not at
  // its boundary, so the drop lands "inside another file's pages".
  const targetCard = cards(page).nth(1);
  const box = await targetCard.boundingBox();
  if (!box) throw new Error('Target card has no bounding box');
  const clientX = box.x + box.width * 0.25;
  const clientY = box.y + box.height / 2;

  const buffer = await makePdfBuffer('inserted.pdf', 1, 999);
  const base64 = buffer.toString('base64');
  const dataTransfer = await page.evaluateHandle(async (b64) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], 'inserted.pdf', { type: 'application/pdf' });
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt;
  }, base64);

  await page.dispatchEvent('#app > astro-island > div', 'dragover', {
    dataTransfer,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
  });
  await page.dispatchEvent('#app > astro-island > div', 'drop', {
    dataTransfer,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
  });

  // The new file's page lands at that position: what was card index 1 is now
  // the inserted file's page.
  await expect(cards(page).nth(1)).toHaveAttribute('aria-label', /inserted\.pdf/, { timeout: 10_000 });
  await expect(cards(page)).toHaveCount(6);

  // Landing inside a file's run (not at its boundary) rearranges the file
  // list, which surfaces the note in place of the sort control. The note
  // exists twice in the DOM (the desktop rail and the phone popover, one of
  // them CSS-hidden), so this asks for the visible one.
  await expect(page.getByText('Pages moved across files', { exact: false }).locator('visible=true')).toBeVisible();
});

// A landscape-oriented source page (width > height) rotated 90deg is a final
// PORTRAIT page: PageGrid.tsx sets the <img>'s inline width/height to
// `var(--cell-h)`/`var(--cell-w)` (swapped ahead of the CSS rotate()), which
// on this axis is LARGER than its own `.thumb-box` container's un-rotated
// width. `.thumb` (PageGrid.module.css) is a flex item with `max-width:
// 100%` and no flex-shrink override, so both the flex-shrink algorithm and
// the percentage max-width clamped that swapped width down to the
// container's own (smaller) width before the rotate ever ran - the image
// rendered as a small, near-square clamped box instead of filling its
// portrait cell. Fixed by suppressing both on the rotated axis
// (`.page[data-rotation='90'] .thumb` / `'270'`). This asserts the fix by
// measuring, not by reading computed style values, since a passing max-width
// with a shrunk flex-basis would look identical in computed style alone.
test('a rotated landscape source thumbnail fills its portrait cell, not clamped by max-width (MERGE thumbnail geometry)', async ({ page }) => {
  await page.goto('/merge/');
  await waitForIsland(page);

  const buffer = await buildPdf('landscape-source', { size: [792, 612] }); // landscape source page
  await page.locator('input[type="file"]').setInputFiles({
    name: 'landscape-source.pdf',
    mimeType: 'application/pdf',
    buffer,
  });

  const card = cards(page).first();
  const thumb = card.locator('img[class*="thumb"]');
  await expect(thumb).toHaveAttribute('src', /^data:/, { timeout: 10_000 });

  await card.hover();
  await card.getByRole('button', { name: /^Rotate page/ }).click({ force: true });
  await expect(card).toHaveAttribute('data-rotation', '90');

  const [boxRect, imgRect] = await Promise.all([
    card.locator('[class*="thumb-box"]').evaluate((el) => el.getBoundingClientRect().toJSON()),
    thumb.evaluate((el) => el.getBoundingClientRect().toJSON()),
  ]);
  // The rotated image's own rect must match its container's, within
  // sub-pixel rounding - not clamped to a smaller square inside it.
  expect(Math.abs(imgRect.width - boxRect.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(imgRect.height - boxRect.height)).toBeLessThanOrEqual(1);
});

for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 800 }]) {
  test(`a very wide photo page stays inside its cell and the grid at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/merge/');
    await waitForIsland(page);
    await page.locator('input[type="file"]').setInputFiles([
      'public/images/redaction-guide/sample.pdf',
      'public/images/redaction-guide/blackout-before.jpg',
    ]);
    await expect(cards(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(cards(page).locator('img')).toHaveCount(2, { timeout: 15_000 });

    const gridBox = await page.locator('ul[class*="grid"][data-grouped]').boundingBox();
    const measured = await cards(page).evaluateAll((lis) =>
      lis.map((li) => {
        const box = li.querySelector('[class*="thumb-box"]').getBoundingClientRect();
        const cell = li.getBoundingClientRect();
        return { boxLeft: box.left, boxRight: box.right, boxWidth: box.width, liLeft: cell.left, liRight: cell.right };
      }),
    );
    for (const m of measured) {
      expect(m.boxLeft, `thumb box ${m.boxWidth}px wide vs cell ${m.liRight - m.liLeft}px`).toBeGreaterThanOrEqual(m.liLeft - 0.5);
      expect(m.boxRight, `thumb box ${m.boxWidth}px wide vs cell ${m.liRight - m.liLeft}px`).toBeLessThanOrEqual(m.liRight + 0.5);
      expect(m.boxLeft).toBeGreaterThanOrEqual(gridBox.x - 0.5);
      expect(m.boxRight).toBeLessThanOrEqual(gridBox.x + gridBox.width + 0.5);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

// MERGE-24: on desktop a handful of pages grow past the 104px cell and the
// whole grid still ends above the card's first-screen floor (its min-height).
test('desktop cells grow to fill the stage and the last page ends above the first-screen floor (MERGE-24)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/merge/');
  await waitForIsland(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: 'five-pages.pdf',
    mimeType: 'application/pdf',
    buffer: await buildPdf('five-pages', { pages: 5 }),
  });
  await expect(cards(page)).toHaveCount(5, { timeout: 15_000 });

  await expect.poll(async () => (await cards(page).first().locator('[class*="thumb-box"]').boundingBox())?.width ?? 0)
    .toBeGreaterThan(104);
  const { lastBottom, floor } = await page.evaluate(() => {
    const items = document.querySelectorAll('ul[class*="grid"] > li[data-key]');
    const card = items[0].closest('[data-tool-loaded]');
    return {
      lastBottom: items[items.length - 1].getBoundingClientRect().bottom,
      floor: card.getBoundingClientRect().top + parseFloat(getComputedStyle(card).minHeight),
    };
  });
  expect(lastBottom).toBeLessThanOrEqual(floor);
});
