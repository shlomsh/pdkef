import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { waitForIsland } from '../../../../e2e/support/tool.js';

/**
 * SIGN-45 (backlog/tasks/SIGN-45.md, docs/sign-fill-mode.md "Taps"): nothing is
 * armed by default. With no tool picked, the Text button is not pressed and a
 * click or tap on the page, blank or on a detected fill line, creates no text,
 * focuses no input and opens no keyboard. Pressing Text arms it (the same tap
 * on the fill line now types there); pressing it again disarms it. Text placed
 * earlier stays editable by clicking it. Real focus and hit-testing, so jsdom
 * cannot prove it. Run on the practice form, at desktop size and phone size.
 */

test.use({ serviceWorkers: 'block' });

const here = path.dirname(fileURLToPath(import.meta.url));
const PRACTICE_FORM = path.resolve(here, '..', '..', '..', '..', 'public', 'images', 'redaction-guide', 'sample.pdf');

const PROFILES = [
  ['desktop', { viewport: { width: 1280, height: 900 } }],
  ['phone 390x844', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
];

async function openFillMode(page) {
  await page.goto('/sign/?next=1');
  await waitForIsland(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({
    name: 'practice-form.pdf',
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(PRACTICE_FORM),
  });
  await expect(page.locator('[class*="page-overlay"]').first()).toBeVisible();
  await expect(page.locator('[data-fill-input]').first()).toBeVisible({ timeout: 15_000 });
}

const textButton = (page) =>
  page.getByRole('toolbar', { name: 'PDF annotations' }).getByRole('button', { name: 'Text', exact: true });
const elementCount = (page) => page.locator('[data-editor-element]').count();
const typingInProgress = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  });

/** Click (desktop) or tap (phone) at the centre of a locator. */
async function press(page, locator, isTouch) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('target has no bounding box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (isTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** A blank spot on the page: the bottom-right corner of the first page overlay. */
async function blankSpot(page) {
  const overlay = page.locator('[class*="page-overlay"]').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  return { x: box.x + box.width * 0.92, y: box.y + box.height * 0.96 };
}

for (const [label, profile] of PROFILES) {
  test.describe(`SIGN-45 nothing armed, ${label}`, () => {
    test.use(profile);
    const isTouch = !!profile.hasTouch;

    test('a fresh document shows Text unpressed; a tap on blank page or a fill line makes no text', async ({ page }) => {
      await openFillMode(page);
      await expect(textButton(page)).toHaveAttribute('aria-pressed', 'false');
      const before = await elementCount(page);

      const spot = await blankSpot(page);
      if (isTouch) await page.touchscreen.tap(spot.x, spot.y);
      else await page.mouse.click(spot.x, spot.y);
      await press(page, page.locator('[data-fill-input]').first(), isTouch);

      expect(await elementCount(page)).toBe(before);
      expect(await typingInProgress(page)).toBe(false);
      await expect(textButton(page)).toHaveAttribute('aria-pressed', 'false');
    });

    test('Text arms and the same tap on the fill line types there; pressing Text again disarms', async ({ page }) => {
      await openFillMode(page);
      const line = page.locator('[data-fill-input]').first();
      const before = await elementCount(page);

      await textButton(page).click();
      await expect(textButton(page)).toHaveAttribute('aria-pressed', 'true');
      await press(page, line, isTouch);
      await expect.poll(() => typingInProgress(page)).toBe(true);
      await page.keyboard.type('Ann');

      await page.keyboard.press('Escape');
      await expect.poll(() => elementCount(page)).toBeGreaterThan(before);
      // Typing disarmed Text (one-shot). Arm it again, let the double-tap window
      // (toolArming.js) pass on the page's own clock, then press it once more.
      await textButton(page).click();
      await expect(textButton(page)).toHaveAttribute('aria-pressed', 'true');
      const armedAt = await page.evaluate(() => performance.now());
      await page.waitForFunction((t) => performance.now() > t + 1000, armedAt);
      await textButton(page).click();
      await expect(textButton(page)).toHaveAttribute('aria-pressed', 'false');

      const after = await elementCount(page);
      await press(page, page.locator('[data-fill-input]').nth(1), isTouch);
      expect(await elementCount(page)).toBe(after);
      expect(await typingInProgress(page)).toBe(false);
    });

    test('text placed earlier stays editable by clicking it with nothing armed', async ({ page }) => {
      await openFillMode(page);
      await textButton(page).click();
      await press(page, page.locator('[data-fill-input]').first(), isTouch);
      await expect.poll(() => typingInProgress(page)).toBe(true);
      await page.keyboard.type('Ann');
      await page.keyboard.press('Escape');
      if ((await textButton(page).getAttribute('aria-pressed')) === 'true') await textButton(page).click();
      await expect(textButton(page)).toHaveAttribute('aria-pressed', 'false');

      const placed = page.locator('[data-editor-element]').filter({ has: page.locator('textarea') }).first();
      await expect(placed.locator('textarea')).toHaveValue('Ann');
      const before = await elementCount(page);
      await press(page, placed, isTouch);
      await expect.poll(() => typingInProgress(page)).toBe(true);
      expect(await elementCount(page)).toBe(before);
      await expect(placed.locator('textarea')).toHaveValue('Ann');
    });
  });
}
