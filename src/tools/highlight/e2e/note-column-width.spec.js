import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';
import { pullCord } from './lamp.js';

/* READ-23: a document can mix portrait pages and landscape spreads. Every page is as wide as the document's widest, so
   the page and its notes fill the width on each one, and the notes keep one width and one place all the way down. */

test.use({ serviceWorkers: 'block', viewport: { width: 1400, height: 900 } });

const SIZES = [[612, 792], [792, 612]];

async function addNote(page, index, text) {
  const overlay = page.locator('[data-page-overlay]').nth(index);
  await overlay.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
  // The page narrows when the rail first appears, so its box is read again for every swipe.
  const box = await overlay.boundingBox();
  const [, h] = SIZES[index];
  const y = box.y + box.height * ((h - 494) / h);
  await page.mouse.move(box.x + box.width * 0.12, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 10 });
  await page.mouse.up();
  const mark = overlay.locator('[data-element-id]').last();
  await mark.scrollIntoViewIfNeeded();
  const band = await mark.boundingBox();
  await page.mouse.click(band.x + band.width / 2, band.y + band.height / 2);
  await page.getByRole('button', { name: 'Comment' }).first().click();
  await page.keyboard.type(text);
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('[data-comment-card] textarea')).toHaveCount(0);
}

/** Per page: where its page and its notes sit (the rail: an open card leans out of it on purpose). */
const measure = (page) => page.locator('[data-editor-page-card]').evaluateAll((cards) => cards.map((card) => {
  const wrapper = card.querySelector('[data-page-wrapper]').getBoundingClientRect();
  const notes = card.querySelector('[data-comment-rail]').getBoundingClientRect();
  return { left: wrapper.left, page: wrapper.width, height: wrapper.height, notesLeft: notes.left, notes: notes.width };
}));

function expectOneWidth([portrait, spread]) {
  for (const key of ['left', 'page', 'notesLeft', 'notes']) expect(Math.abs(portrait[key] - spread[key])).toBeLessThan(1);
  expect(portrait.height / portrait.page).toBeCloseTo(792 / 612, 2);
  expect(spread.height / spread.page).toBeCloseTo(612 / 792, 2);
}

test('portrait pages and spreads share one width, and their notes one column', async ({ page }) => {
  const source = await makePdfBuffer(null, {
    title: false, pages: 2, size: (i) => SIZES[i],
    lines: [{ text: 'A line of text a student would highlight', y: 500 }],
  });
  await openTool(page, '/highlight-pdf/', { file: { name: 'mixed.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
  await addNote(page, 0, 'on the portrait page');
  await addNote(page, 1, 'on the spread');

  expectOneWidth(await measure(page));

  // Headless Chromium has no real fullscreen; the lamp falls back to its pseudo fullscreen, as on an iPhone.
  await page.evaluate(() => { delete Element.prototype.requestFullscreen; Element.prototype.requestFullscreen = undefined; });
  // Scrolled down, the cord is tucked away and a press only brings it back.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await pullCord(page);
  await expect(page.locator('[data-pseudo-fullscreen]')).toHaveCount(1);
  expectOneWidth(await measure(page));
});
