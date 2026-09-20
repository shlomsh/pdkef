import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

/**
 * Real drag-to-reorder, then undo/redo, in a real browser.
 *
 * PdfEditPagesTool.undo.test.tsx already proves the reducer/history-stack
 * bookkeeping under jsdom, but it spies on `Sortable.create` and calls
 * `options.onEnd({ oldIndex, newIndex })` directly - no DOM node ever
 * actually moves. In a real browser, SortableJS (`forceFallback: true`)
 * moves the dragged card's own DOM node on drop, and only afterwards does
 * `onEnd` update the `pages` state array that Preact then re-renders from
 * (keyed by `page.pageNumber`, not array index - see PdfEditPagesTool.tsx).
 * Undo restores a different order through state alone, with no matching
 * DOM-level move. The open question this spec answers: once SortableJS has
 * already physically rearranged the grid's children, does Preact's keyed
 * reconciliation still land the DOM in the order the restored state says it
 * should be, for both the post-drag order and the order undo restores?
 *
 * Page identity in the DOM is `[data-page]` on each `.page-card`
 * (PdfEditPagesTool.tsx), which is the PDF's original page number and never
 * changes - it is exactly the render key, so reading it back off the DOM in
 * document order is reading the tool's own idea of "visible page order."
 */

async function makePdfBuffer(pageCount) {
  const document = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) document.addPage([300, 400]);
  return Buffer.from(await document.save());
}

async function openEditPagesTool(page, pageCount) {
  await page.goto('/edit-pdf/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'edit-pages-reorder-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(pageCount),
  });
  await expect(page.locator('[data-page]')).toHaveCount(pageCount);
}

/** The full visible page order, read straight off the DOM - never from
 * `pages` state, which is exactly what a reconciliation bug would disagree
 * with. */
async function visibleOrder(page) {
  return page.$$eval('[data-page]', (nodes) => nodes.map((node) => node.getAttribute('data-page')));
}

/**
 * Drags one page card onto another using real `page.mouse` events, the way
 * `forceFallback: true` expects: SortableJS's fallback path listens for
 * plain mousedown/mousemove/mouseup on the document, not native HTML5 DnD
 * events, so this is what a real pointer drag looks like to it. Several
 * intermediate `mousemove` steps are used (not one jump) because SortableJS
 * recomputes the swap target on each move event.
 */
async function dragPageOnto(page, fromPageNumber, toPageNumber) {
  const handle = page.locator(`[data-page="${fromPageNumber}"] [title="Drag to reorder"]`);
  const handleBox = await handle.boundingBox();
  const targetBox = await page.locator(`[data-page="${toPageNumber}"]`).boundingBox();
  if (!handleBox || !targetBox) throw new Error('Drag handle or drop target has no bounding box');

  const start = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
  // Land in the far half of the target card (in the direction of travel) so
  // the drop reads as "after" the target, not "before" it.
  const towardEnd = targetBox.x > handleBox.x ? 0.85 : 0.15;
  const end = { x: targetBox.x + targetBox.width * towardEnd, y: targetBox.y + targetBox.height / 2 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // A small first move past SortableJS's fallback tolerance to register the
  // drag start before heading toward the target.
  await page.mouse.move(start.x + 8, start.y + 4, { steps: 5 });

  const steps = 12;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      start.x + (end.x - start.x) * (i / steps),
      start.y + (end.y - start.y) * (i / steps),
      { steps: 3 },
    );
  }
  await page.mouse.up();
}

test.describe('Edit Pages drag-to-reorder undo/redo', () => {
  test('a real drag reorders the visible pages, and undo/redo restore each order exactly', async ({ page }) => {
    await openEditPagesTool(page, 5);

    const originalOrder = await visibleOrder(page);
    expect(originalOrder).toEqual(['1', '2', '3', '4', '5']);

    // Drag page 1 onto page 4 - a real, multi-position move, not an adjacent
    // swap, so a bug that merely swaps neighbours instead of truly
    // reordering would still be caught.
    await dragPageOnto(page, 1, 4);

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
