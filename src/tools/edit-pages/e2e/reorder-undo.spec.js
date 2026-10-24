import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readFile } from 'node:fs/promises';

/**
 * Real drag-to-reorder, then undo/redo, in a real browser.
 *
 * Edit Pages runs on the shared page grid (docs/shared-page-grid.md), where a
 * page is dragged by its thumbnail. The unit tests prove the history-stack
 * bookkeeping under jsdom, but only a real mouse drag shows that, after the
 * drag controller has physically moved the cell, the keyed re-render still
 * lands the DOM in the order state says, both for the post-drag order and for
 * the order Undo and Redo restore.
 *
 * Page identity in the DOM is `data-key` on each `ul[data-page-grid] > li`,
 * the render key, so reading it back in document order is reading the tool's
 * own idea of the visible page order.
 */

async function makePdfBuffer(pageCount) {
  const document = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) document.addPage([300, 400]);
  return Buffer.from(await document.save());
}

function cells(page) {
  return page.locator('ul[data-page-grid] > li[data-key]');
}

async function openEditPagesTool(page, pageCount) {
  await page.goto('/edit-pdf/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'edit-pages-reorder-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(pageCount),
  });
  await expect(cells(page)).toHaveCount(pageCount);
  // Wait for the settled fit: a late thumbnail can refit the grid and move a cell from under the pointer.
  for (let i = 0; i < pageCount; i += 1) {
    await expect(cells(page).nth(i).locator('img')).toHaveAttribute('src', /^(data|blob):/, { timeout: 10_000 });
  }
  await expect(page.locator('ul[data-page-grid][data-fit-settled]')).toBeVisible();
}

/** The full visible page order, read straight off the DOM - never from
 * `pages` state, which is exactly what a reconciliation bug would disagree
 * with. */
async function visibleOrder(page) {
  return page.$$eval('ul[data-page-grid] > li[data-key]', (nodes) => nodes.map((node) => node.getAttribute('data-key')));
}

/** Drags one page onto another by its thumbnail with real `page.mouse` events,
 * in several steps because the drop target is recomputed on each move. */
async function dragPageOnto(page, fromIndex, toIndex) {
  const from = await cells(page).nth(fromIndex).locator('[data-thumb-box]').boundingBox();
  const to = await cells(page).nth(toIndex).locator('[data-thumb-box]').boundingBox();
  if (!from || !to) throw new Error('Drag source or drop target has no bounding box');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
}

test.use({ viewport: { width: 1280, height: 900 } });

test.describe('Edit Pages drag-to-reorder undo/redo', () => {
  test('a real drag reorders the visible pages, and undo/redo restore each order exactly', async ({ page }) => {
    await openEditPagesTool(page, 5);

    const originalOrder = await visibleOrder(page);
    expect(originalOrder).toHaveLength(5);

    // Drag the first page onto the fourth - a real, multi-position move, not an adjacent
    // swap, so a bug that merely swaps neighbours instead of truly
    // reordering would still be caught.
    await dragPageOnto(page, 0, 3);

    const draggedOrder = await visibleOrder(page);
    expect(draggedOrder, `Drag did not reorder the grid; order is still ${draggedOrder.join(',')}`)
      .not.toEqual(originalOrder);
    expect(draggedOrder).toHaveLength(5);
    expect(new Set(draggedOrder)).toEqual(new Set(originalOrder));

    const undoButton = page.getByRole('button', { name: 'Undo last change' });
    await expect(undoButton).toBeEnabled();
    await undoButton.click();

    const afterUndo = await visibleOrder(page);
    expect(afterUndo, `Undo should restore ${originalOrder.join(',')} but the DOM shows ${afterUndo.join(',')}`)
      .toEqual(originalOrder);

    const redoButton = page.getByRole('button', { name: 'Redo last undone change' });
    await expect(redoButton).toBeEnabled();
    await redoButton.click();

    const afterRedo = await visibleOrder(page);
    expect(afterRedo, `Redo should restore ${draggedOrder.join(',')} but the DOM shows ${afterRedo.join(',')}`)
      .toEqual(draggedOrder);
  });
});

test('the downloaded file after "skip page 2, rotate page 1" has one page fewer and page 1 rotated 90', async ({ page }) => {
  await openEditPagesTool(page, 4);
  await cells(page).nth(1).click();
  await page.keyboard.press('Delete');
  await expect(cells(page).nth(1)).toHaveAttribute('data-skipped', 'true');
  await cells(page).first().click();
  await page.keyboard.press('r');
  await expect(cells(page).first()).toHaveAttribute('data-rotation', '90');

  const link = page.getByRole('link', { name: /Download/ }).first();
  await expect(link).toHaveAttribute('href', /^blob:/, { timeout: 15_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const savedPath = await download.path();
  if (!savedPath) throw new Error('Playwright did not retain the downloaded PDF');
  const out = await PDFDocument.load(await readFile(savedPath));
  expect(out.getPageCount()).toBe(3);
  expect(out.getPage(0).getRotation().angle).toBe(90);
});
