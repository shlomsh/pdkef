import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';
import { tapUntil } from '../../../../e2e/support/touch.js';

/* READ-17: a closed note card clamps its text to four lines, the open card shows it whole and a click on the text
   toggles that, and editing is reached from the card's menu. Rendered line clamping needs a real browser. */

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

test('a long note clamps when closed, shows whole when open, and is edited from its menu', async ({ page }) => {
  const source = await makePdfBuffer(null, { title: false, lines: LINES });
  await openTool(page, '/highlight-pdf/', { file: { name: 'notes.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
  await addNote(page, 700, 'comment '.repeat(80).trim());
  await addNote(page, 600, 'short note');

  const card = page.locator('[data-comment-card]').first();
  const group = card.locator('[role="group"]');
  const text = card.locator('[data-comment-text]');
  const metrics = () => text.evaluate((n) => {
    const lh = parseFloat(getComputedStyle(n).lineHeight);
    return { lh, height: n.getBoundingClientRect().height, overflows: n.scrollHeight > n.clientHeight };
  });
  const clamped = async () => {
    const m = await metrics();
    expect(m.height).toBeLessThanOrEqual(m.lh * 4 + 2);
  };
  const whole = async () => {
    const m = await metrics();
    expect(m.height).toBeGreaterThan(m.lh * 6);
  };

  // Not active: clamped, and the text runs past the clamp.
  await expect(card).not.toHaveAttribute('data-active', /.*/);
  await clamped();
  expect((await metrics()).overflows).toBe(true);

  // Click selects and shows the whole note.
  await card.click();
  await expect(card).toHaveAttribute('data-active', /.*/);
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await whole();

  // Clicking the text folds it back and opens it again.
  await text.click();
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await clamped();
  await text.click();
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await whole();
  await expect(card.locator('textarea')).toHaveCount(0);

  // Editing is reached from the menu only.
  await card.locator('[data-comment-more]').click();
  await card.locator('[data-comment-menu-edit]').click();
  await expect(page.locator('[data-comment-card] textarea')).toHaveCount(1);
  await expect(card.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await expect(card.locator('textarea')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-comment-card] textarea')).toHaveCount(0);
});

/* On a phone the note sits in the bottom pane, whose cards scroll: the menu must open above every scroll container,
   or Delete is cut off under the card's edge. */
// Only a real browser resolves dir="auto" and places the top-layer menu.
test('opening the menu leaves a note in the other direction where it was, and the menu stays on its card', async ({ page }) => {
  const source = await makePdfBuffer(null, { title: false, lines: LINES });
  await openTool(page, '/highlight-pdf/', { file: { name: 'notes.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
  await addNote(page, 700, 'בהערה '.repeat(40).trim());

  const card = page.locator('[data-comment-card]').first();
  await card.click();
  await expect(card).toHaveAttribute('data-active', /.*/);
  const text = card.locator('[data-comment-text]');
  const more = card.locator('[data-comment-more]');
  const direction = () => text.evaluate((n) => getComputedStyle(n).direction);
  expect(await direction()).toBe('rtl');
  const before = await more.boundingBox();

  await more.click();
  const menu = page.locator('[data-comment-menu]');
  await expect(menu).toBeVisible();
  expect(await direction()).toBe('rtl');
  // The button stays at the note's end; a flip would carry it the card's whole width.
  expect(Math.abs((await more.boundingBox()).x - before.x)).toBeLessThanOrEqual(6);
  // The menu speaks the interface's language, whichever way the note runs.
  expect(await menu.evaluate((n) => getComputedStyle(n).direction)).toBe('ltr');

  const cardBox = await card.boundingBox();
  const menuBox = await menu.boundingBox();
  expect(menuBox.x).toBeGreaterThanOrEqual(cardBox.x);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
});

test.describe('in the phone note pane', () => {
  test.use({ isMobile: false, hasTouch: true, viewport: { width: 402, height: 874 } });

  test('the menu of a short note is whole and every item can be tapped', async ({ page }) => {
    const source = await makePdfBuffer(null, { title: false, lines: LINES });
    await openTool(page, '/highlight-pdf/', { file: { name: 'notes.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
    const box = await page.locator('[data-page-overlay]').first().boundingBox();
    const y = box.y + box.height * ((792 - 694) / 792);
    await page.mouse.move(box.x + box.width * (72 / 612), y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * (330 / 612), y, { steps: 8 });
    await page.mouse.up();
    const band = await page.locator('[data-page-overlay] [data-element-id]').first().boundingBox();
    await tapUntil(page, { x: band.x + band.width / 2, y: band.y + band.height / 2 }, async () => (await page.locator('[data-marker-row]:visible').count()) === 1);
    await page.getByRole('button', { name: 'Comment' }).first().click();
    await expect(page.locator('[data-note-writer-input]')).toBeFocused();
    await page.keyboard.type('short note');
    await page.keyboard.press('Control+Enter');

    const card = page.locator('[data-note-card][data-active]');
    await card.locator('[data-comment-more]').click();
    const items = page.locator('[data-comment-menu] [role="menuitem"]');
    await expect(items).toHaveCount(2);
    // Polled: the menu is placed a frame after it opens.
    await expect.poll(() => items.evaluateAll((nodes) => nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return n.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }))).toEqual([true, true]);
  });
});
