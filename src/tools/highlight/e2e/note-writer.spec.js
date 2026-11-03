import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';
import { pullCord } from './lamp.js';
import { tapUntil } from '../../../../e2e/support/touch.js';

/* READ-19: on a phone a note is read in the bottom pane and typed only on the full-screen writing page. Focus after a
   real tap, rendered rects and the top layer inside the lamp need a real browser. */

test.use({ viewport: { width: 402, height: 874 }, hasTouch: true, serviceWorkers: 'block' });

const LINES = [
  { text: 'A line of text a student would highlight', y: 700 },
  { text: 'A second line with a mark of its own', y: 600 },
  { text: 'A third line low on the page', y: 120 },
];

async function open(page) {
  const source = await makePdfBuffer(null, { title: false, lines: LINES });
  await openTool(page, '/highlight-pdf/', { file: { name: 'notes.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
}

// Draws a highlight over the line at `y` and returns the locator of its mark.
async function highlight(page, y) {
  const marks = page.locator('[data-page-overlay] [data-element-id]');
  const before = await marks.count();
  const box = await page.locator('[data-page-overlay]').first().boundingBox();
  const py = box.y + box.height * ((792 - (y - 6)) / 792);
  await page.mouse.move(box.x + box.width * (72 / 612), py);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (330 / 612), py, { steps: 8 });
  await page.mouse.up();
  await expect(marks).toHaveCount(before + 1);
  return marks.nth(before);
}

async function tapMark(page, mark, done) {
  const band = await mark.boundingBox();
  await tapUntil(page, { x: band.x + band.width / 2, y: band.y + band.height / 2 }, done);
}

const markerRowOpen = (page) => async () => (await page.locator('[data-marker-row]:visible').count()) === 1;

async function commentOn(page, mark) {
  await tapMark(page, mark, markerRowOpen(page));
  await page.getByRole('button', { name: 'Comment' }).first().click();
}

test.describe('the phone writing page', () => {
  test('Comment opens the writer with its field focused, and the pane has no field', async ({ page }) => {
    await open(page);
    await commentOn(page, await highlight(page, 700));
    const writer = page.locator('[data-note-writer]');
    await expect(writer).toHaveAttribute('open', '');
    await expect(page.locator('[data-note-writer-input]')).toBeFocused();
    await expect(page.locator('[data-note-pane] textarea')).toHaveCount(0);
    await page.keyboard.type('first note');
    await writer.getByRole('button', { name: 'Comment' }).click();
    await expect(writer).not.toHaveAttribute('open', '');
    await expect(page.locator('[data-note-card][data-active]')).toContainText('first note');
  });

  test('Edit from the card menu opens the writer with the text; Save keeps it, Cancel drops the change', async ({ page }) => {
    await open(page);
    await commentOn(page, await highlight(page, 700));
    await page.keyboard.type('first note');
    const writer = page.locator('[data-note-writer]');
    await writer.getByRole('button', { name: 'Comment' }).click();
    const card = page.locator('[data-note-card][data-active]');
    const edit = async () => {
      await card.locator('[data-comment-more]').click();
      await page.locator('[data-comment-menu-edit]').click();
      await expect(writer).toHaveAttribute('open', '');
      await expect(page.locator('[data-note-writer-input]')).toBeFocused();
    };
    await edit();
    await expect(page.locator('[data-note-writer-input]')).toHaveValue('first note');
    await page.keyboard.type(' more');
    await writer.getByRole('button', { name: 'Save' }).click();
    await expect(card).toHaveText(/first note more/);
    await edit();
    await page.keyboard.type(' x');
    await writer.getByRole('button', { name: 'Cancel' }).click();
    await expect(writer).not.toHaveAttribute('open', '');
    await expect(card).toHaveText(/first note more/);
    await expect(card).not.toContainText('more x');
  });

  test('Cancel on a brand new note leaves no note', async ({ page }) => {
    await open(page);
    const first = await highlight(page, 700);
    await commentOn(page, first);
    await page.keyboard.type('kept');
    const writer = page.locator('[data-note-writer]');
    await writer.getByRole('button', { name: 'Comment' }).click();
    const cards = page.locator('[data-note-card]');
    const before = await cards.count();
    await commentOn(page, await highlight(page, 600));
    await expect(page.locator('[data-note-writer-input]')).toBeFocused();
    await writer.getByRole('button', { name: 'Cancel' }).click();
    await expect(writer).not.toHaveAttribute('open', '');
    // Cancel discards the blank note and closes the pane, as the card's own Cancel did; reopen it to count the notes.
    await expect(page.locator('[data-note-pane]')).toHaveCount(0);
    await tapMark(page, first, async () => (await page.locator('[data-note-pane]').count()) === 1);
    await expect(cards).toHaveCount(before);
    await expect(page.locator('[data-note-card]', { hasText: /^\s*$/ })).toHaveCount(0);
  });

  test('the passage sits above the pane when a long note opens it', async ({ page }) => {
    await open(page);
    const mark = await highlight(page, 120);
    await commentOn(page, mark);
    for (let i = 1; i <= 14; i++) {
      await page.keyboard.type(`line ${i}`);
      if (i < 14) await page.keyboard.press('Shift+Enter');
    }
    await page.locator('[data-note-writer]').getByRole('button', { name: 'Comment' }).click();
    const pane = page.locator('[data-note-pane]');
    await pane.getByRole('button', { name: 'Close notes' }).click();
    await expect(pane).toBeHidden();
    await tapMark(page, mark, async () => pane.isVisible());
    await expect.poll(async () => {
      const m = await mark.boundingBox();
      const p = await pane.boundingBox();
      return !!m && !!p && m.y + m.height <= p.y - 4 && m.y >= 0;
    }).toBe(true);
  });

  test('in the lamp the writer covers the screen and takes focus', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { delete Element.prototype.requestFullscreen; Element.prototype.requestFullscreen = undefined; });
    await pullCord(page);
    await expect(page.locator('[data-pseudo-fullscreen]')).toHaveCount(1);
    await commentOn(page, await highlight(page, 700));
    await expect(page.locator('[data-note-writer-input]')).toBeFocused();
    await expect.poll(async () => {
      const b = await page.locator('[data-note-writer]').boundingBox();
      return !!b && b.x === 0 && b.y === 0 && b.width === 402 && Math.abs(b.height - 874) <= 2;
    }).toBe(true);
  });
});

test.describe('a narrow window with a mouse', () => {
  test.use({ viewport: { width: 800, height: 900 }, hasTouch: false });

  test('the rest toolbar Comment opens the writer with its field focused', async ({ page }) => {
    await open(page);
    const mark = await highlight(page, 700);
    await mark.click();
    await page.locator('[data-rest-toolbar]').getByRole('button', { name: 'Comment' }).click();
    await expect(page.locator('[data-note-writer]')).toHaveAttribute('open', '');
    await expect(page.locator('[data-note-writer-input]')).toBeFocused();
  });
});
