import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

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
