import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readFile } from 'node:fs/promises';

/* Direction A (2026-09-13, renamed from merge-strip.spec.js): the document's
   page grid. It wraps (no horizontal strip) and is a `<ul class*="grid">`
   (PageStrip.module.css) of `<li class="page" data-key data-rotation
   data-skipped>` cells plus `<li class="caption" data-caption-for>` label
   rows. Its per-page controls (rotate, skip) are CSS `visibility: hidden`
   until the cell is hovered or focused (or, on touch, until that cell is
   tapped - there is no Edit pages mode) - see PageStrip.module.css's
   `.page:hover .actions, .page:focus-visible .actions,
   .page[data-selected] .actions`. On a pointer-driven project we hover the
   cell before clicking a button inside it. */

// A distinct page width per file lets pdf-lib tell the merged output's pages
// apart afterwards, without relying on drawn text.
async function makePdfBuffer(label, pageCount, width) {
  const document = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) document.addPage([width, 792]);
  document.setTitle(label);
  return Buffer.from(await document.save());
}

function grid(page) {
  return page.locator('ul[class*="grid"]');
}

function cards(page) {
  return grid(page).locator('> li[data-key]');
}

test('the assembled grid: every page, rotate, skip and keyboard reorder land in the export (MERGE-08/09)', async ({ page }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

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

  // Thumbnails render progressively; wait for the first three near the start
  // of the grid.
  for (let i = 0; i < 3; i += 1) {
    await expect(cards(page).nth(i).locator('img')).toHaveAttribute('src', /^data:/, { timeout: 10_000 });
  }

  // Rotate card 2 (index 1: file1's first page).
  const card2 = cards(page).nth(1);
  await card2.hover();
  await card2.getByRole('button', { name: 'Rotate page 2', exact: true }).click({ force: true });
  await expect(card2).toHaveAttribute('data-rotation', '90');

  // Skip card 3 (index 2: file1's second page).
  const card3 = cards(page).nth(2);
  await card3.hover();
  await card3.getByRole('button', { name: 'Skip page 3', exact: true }).click({ force: true });
  await expect(card3).toHaveAttribute('data-skipped', 'true');
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
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

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
  await expect(page.getByText('Pages were rearranged', { exact: false }).locator('visible=true')).toBeVisible();
});
