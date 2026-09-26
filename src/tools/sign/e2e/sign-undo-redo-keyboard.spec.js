import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/**
 * Real Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z, in a real browser.
 *
 * Rendered geometry and real key events are exactly what jsdom cannot prove:
 * SignToolContext.test.tsx already proves the reducer's array bookkeeping
 * (historyStack.ts's module doc explains why `future` must stay a strict,
 * contiguous run for this to be a lossless round trip), and
 * useHistoryShortcuts.test.jsx proves the listener wires the right keys to
 * the right callback. Neither can prove that the browser actually delivers a
 * trusted keydown for this chord, or that once the reducer restores an
 * element by its original array index, Preact's keyed re-render actually
 * paints it back at the same pixels and in the same paint order as its
 * neighbours - paint order here is DOM order, since nothing in the renderer
 * sets z-index (PdfWorkspace.tsx maps `pageElements` straight into the DOM).
 */

const MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';

async function makePdfBuffer() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Sign undo/redo e2e fixture', {
    x: 72,
    y: 720,
    size: 18,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  return Buffer.from(await doc.save());
}

async function openSignTool(page) {
  await page.goto('/sign/?next=0');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'sign-undo-redo-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(),
  });
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
}

async function clickOverlayAt(page, xRatio, yRatio) {
  const overlay = page.locator('[class*="page-overlay"]').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF overlay has no bounding box');
  await overlay.click({ position: { x: box.width * xRatio, y: box.height * yRatio } });
}

/**
 * The element's rect relative to its page-wrapper, not to the viewport.
 * boundingBox() is viewport-relative, and later placements (and the
 * scrollIntoViewIfNeeded a click does) scroll the page - three placements
 * plus several redos genuinely move window.scrollY, so comparing raw
 * boundingBox()es across those steps mistakes scroll drift for a position
 * regression. Measuring against the page-wrapper's own rect (same trick as
 * form-grid-fill.spec.js's `measure()`) cancels the scroll out because both
 * rects shift by the same amount.
 */
async function measureRelative(page, id) {
  return page.evaluate((elementId) => {
    const el = document.querySelector(`[data-editor-element-id="${elementId}"]`);
    const wrapper = el.closest('[class*="page-wrapper"]');
    const frame = wrapper.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left - frame.left,
      top: rect.top - frame.top,
      width: rect.width,
      height: rect.height,
    };
  }, id);
}

/** The largest edge offset between an element's current rect and `rect`. */
async function distanceFrom(page, id, rect) {
  const now = await measureRelative(page, id);
  return Math.max(
    Math.abs(now.left - rect.left),
    Math.abs(now.top - rect.top),
    Math.abs(now.width - rect.width),
    Math.abs(now.height - rect.height),
  );
}

/** Places a Symbols-tool element (no textarea involved, so focus never lands
 * on an INPUT/TEXTAREA and the undo/redo shortcut listener stays live). */
async function addSymbol(page, xRatio, yRatio) {
  const symbolTool = page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Symbols', exact: true });
  if ((await symbolTool.getAttribute('aria-pressed')) !== 'true') {
    await symbolTool.click();
  }
  await clickOverlayAt(page, xRatio, yRatio);
  const placed = page.locator('[data-editor-element][data-editor-active]');
  await expect(placed).toBeVisible();
  const id = await placed.getAttribute('data-editor-element-id');
  const rect = await measureRelative(page, id);
  return { id, rect };
}

/** DOM/paint order of every placed element, by id - this *is* stacking order,
 * since nothing sets z-index. */
async function elementOrder(page) {
  return page.$$eval('[data-editor-element-id]', (nodes) => (
    nodes.map((node) => node.getAttribute('data-editor-element-id'))
  ));
}

function closeEnough(a, b) {
  expect(Math.abs(a.left - b.left)).toBeLessThan(1);
  expect(Math.abs(a.top - b.top)).toBeLessThan(1);
  expect(Math.abs(a.width - b.width)).toBeLessThan(1);
  expect(Math.abs(a.height - b.height)).toBeLessThan(1);
}

test.describe('Sign editor keyboard undo/redo', () => {
  test('redo restores a placed element at the same rect and the same stacking position', async ({ page }) => {
    await openSignTool(page);

    // Three separate placements, each its own history entry, so redo has to
    // reinsert the middle one by its original index rather than just append.
    const a = await addSymbol(page, 0.3, 0.3);
    const b = await addSymbol(page, 0.3, 0.5);
    const c = await addSymbol(page, 0.3, 0.7);
    expect(await elementOrder(page)).toEqual([a.id, b.id, c.id]);

    // Undo twice: drop C, then B. Only A is left.
    await page.keyboard.press(`${MODIFIER}+z`);
    await expect(page.locator('[data-editor-element-id]')).toHaveCount(2);
    await page.keyboard.press(`${MODIFIER}+z`);
    await expect(page.locator('[data-editor-element-id]')).toHaveCount(1);
    expect(await elementOrder(page)).toEqual([a.id]);

    // Redo once: B comes back. It must land between A and where C will
    // reappear, not appended wherever the newest command happens to sit.
    await page.keyboard.press(`Shift+${MODIFIER}+z`);
    await expect(page.locator('[data-editor-element-id]')).toHaveCount(2);
    expect(await elementOrder(page)).toEqual([a.id, b.id]);
    const bAfterRedo = await measureRelative(page, b.id);
    closeEnough(bAfterRedo, b.rect);

    // Redo again: C comes back on top, restoring the original three-deep
    // stack in the original order.
    await page.keyboard.press(`Shift+${MODIFIER}+z`);
    await expect(page.locator('[data-editor-element-id]')).toHaveCount(3);
    expect(await elementOrder(page)).toEqual([a.id, b.id, c.id]);
    const cAfterRedo = await measureRelative(page, c.id);
    closeEnough(cAfterRedo, c.rect);
    const aStillThere = await measureRelative(page, a.id);
    closeEnough(aStillThere, a.rect);
  });

  test('undoing a drag-move restores the pre-drag position, then redo moves it again', async ({ page }) => {
    await openSignTool(page);

    const placed = await addSymbol(page, 0.4, 0.4);

    // Drag it to a clearly different spot, the same mouse-driven pattern
    // sign-editor.spec.js uses to move a placed whiteout box (move to the
    // element's centre, down, move to the target, up).
    const locator = page.locator(`[data-editor-element-id="${placed.id}"]`);
    const box = await locator.boundingBox();
    if (!box) throw new Error('placed element has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 60);
    await page.mouse.up();

    const moved = await measureRelative(page, placed.id);
    expect(Math.abs(moved.left - placed.rect.left)).toBeGreaterThan(40);
    expect(Math.abs(moved.top - placed.rect.top)).toBeGreaterThan(40);
    await expect(page.locator('[data-editor-element-id]')).toHaveCount(1);

    // Nothing here ever focuses a textarea (Symbols has none), so the mouse
    // drag above leaves focus on the page and the keyboard shortcut listener
    // stays live for this real Cmd/Ctrl+Z.
    await page.keyboard.press(`${MODIFIER}+z`);
    await expect(page.locator('[data-editor-element-id]')).toHaveCount(1);
    // The keypress returns before the re-render, so poll the position rather
    // than measuring once.
    await expect.poll(() => distanceFrom(page, placed.id, placed.rect)).toBeLessThan(1);

    await page.keyboard.press(`Shift+${MODIFIER}+z`);
    await expect(page.locator('[data-editor-element-id]')).toHaveCount(1);
    await expect.poll(() => distanceFrom(page, placed.id, moved)).toBeLessThan(1);
  });
});
