import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

/* READ-13 follow-up: with notes in the margin rail, a click on another note moves the open mark to its passage and
   lets go of the first one, also when the first note is open for editing (its field used to swallow the click, so the
   person could not move from one note to the next). Layout, focus and the outline need a real browser. */

test.use({ serviceWorkers: 'block', viewport: { width: 1400, height: 900 } });

const LINES = [
  { text: 'A line of text a student would highlight', y: 700 },
  { text: 'A second line with a mark of its own', y: 600 },
];

async function addNote(page, y, text) {
  // The page narrows when the rail first appears, so its box is read again for every swipe.
  const box = await page.locator('[data-page-overlay]').first().boundingBox();
  const at = (px, py) => ({ x: box.x + box.width * (px / 612), y: box.y + box.height * ((792 - py) / 792) });
  const a = at(72, y - 6), b = at(330, y - 6);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  const mark = page.locator('[data-page-overlay] [data-element-id]').last();
  const band = await mark.boundingBox();
  await page.mouse.click(band.x + band.width / 2, band.y + band.height / 2);
  await page.getByRole('button', { name: 'Comment' }).first().click();
  await page.keyboard.type(text);
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('[data-comment-card] textarea')).toHaveCount(0);
}

test('clicking another note, even from one being edited, opens its mark and lets go of the first', async ({ page }) => {
  const source = await makePdfBuffer(null, { title: false, lines: LINES });
  await openTool(page, '/highlight-pdf/', { file: { name: 'notes.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
  await addNote(page, 700, 'first note');
  await addNote(page, 600, 'second note');

  const group = (n) => page.locator('[data-comment-card] [role="group"]').nth(n);
  const state = () => page.evaluate(() => ({
    focused: [...document.querySelectorAll('[data-comment-focus]')].map((n) => n.getAttribute('data-editor-element-id')),
    active: [...document.querySelectorAll('[data-comment-card]')].findIndex((c) => c.getAttribute('data-active')),
    outlines: document.querySelectorAll('[data-mark-outline]').length,
    fields: document.querySelectorAll('[data-comment-card] textarea').length,
  }));

  await group(0).click();
  await expect.poll(async () => (await state()).active).toBe(0);
  const marksOf = async () => page.locator('[data-page-overlay] [data-element-id]').evaluateAll((n) => n.map((m) => m.getAttribute('data-editor-element-id')));
  const [firstMark, secondMark] = await marksOf();
  expect((await state()).focused).toEqual([firstMark]);

  // Open the first note for editing, then go to the second, and back: each click lands on that note alone.
  await group(0).click();
  await expect(page.locator('[data-comment-card] textarea')).toHaveCount(1);
  await group(1).click();
  await expect.poll(state).toMatchObject({ active: 1, focused: [secondMark], outlines: 1, fields: 0 });
  await group(1).click();
  await expect(page.locator('[data-comment-card] textarea')).toHaveCount(1);
  await group(0).click();
  await expect.poll(state).toMatchObject({ active: 0, focused: [firstMark], outlines: 1, fields: 0 });
});
