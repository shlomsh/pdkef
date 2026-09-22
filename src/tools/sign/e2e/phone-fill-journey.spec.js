import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * The whole phone form-fill round trip, as one person does it (MOBI-21).
 *
 * This spec exists because every guard in the suite passed on 2026-09-22 while
 * the core task on a phone was impossible: tap a field, type, tap the page to
 * put the keyboard away, then go back to fix a typo - and there was no way back
 * into the box at all. Each ticket had tested its own slice (the chevrons are on
 * screen, the bar is one row, the hit boxes do not overlap) and nothing had
 * tested the journey those slices add up to. Bisected: the lockout was on the
 * morning's base as well, so it was never a regression a narrower guard could
 * have caught - it was a path nobody walked.
 *
 * jsdom can prove none of it. The lockout lived in the gap between two browser
 * behaviours it does not model: `pointer-events: none` on an inert textarea, and
 * `preventDefault()` on `touchstart` suppressing the synthesised click pair that
 * the only edit route (`onDblClick`) needs. So this runs in a real engine with a
 * real touch device, on the practice form - the document MOBI-18 makes the
 * editor's benchmark.
 *
 * Kept deliberately to the user's own words for each step, and to assertions a
 * person would check by eye: is my text in the right box, can I get back into
 * it, and did anything I did not ask for appear on the page.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const PRACTICE_FORM = path.resolve(here, '..', '..', '..', '..', 'public', 'images', 'redaction-guide', 'sample.pdf');

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function openPracticeForm(page) {
  await page.goto('/sign/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({
    name: 'practice-form.pdf',
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(PRACTICE_FORM),
  });
  await expect(page.locator('[class*="page-overlay"]').first()).toBeVisible();
}

async function tapCentre(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

const elementCount = (page) => page.locator('[data-editor-element]').count();
const textOf = (element) => element.locator('textarea').inputValue();

test('fill two fields, put the keyboard away, then go back and fix the first', async ({ page }) => {
  await openPracticeForm(page);

  // Tap the Text tool, then the first field, and type.
  const textTool = page.getByRole('toolbar', { name: 'PDF annotations' }).getByRole('button', { name: 'Text', exact: true });
  await textTool.click();
  const firstField = page.locator('[class*="field-hint-cell"]').first();
  await expect(firstField).toBeVisible();
  await tapCentre(page, firstField);
  await page.keyboard.type('Ann');

  // Next, and type into the second field.
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.keyboard.type('Bob');
  expect(await elementCount(page), 'two fields filled, two boxes').toBe(2);

  // Put the keyboard away the way a phone does: tap the page, away from any box.
  // The form's own header band is printed ink, not a field.
  const overlay = page.locator('[class*="page-overlay"]').first();
  const o = await overlay.boundingBox();
  await page.touchscreen.tap(o.x + 12, o.y + 12);
  // Assert the session really closed - otherwise the "go back in" step below
  // would pass without ever testing re-entry.
  await expect(page.locator('[data-editor-text-input]:not([readonly])')).toHaveCount(0);
  expect(await elementCount(page), 'tapping the page to dismiss the keyboard adds nothing').toBe(2);

  // Go back to the first box and fix it. ONE tap has to be enough: a second tap
  // in quick succession is the browser's zoom gesture, not ours.
  const first = page.locator('[data-editor-element]').filter({ has: page.locator('textarea') }).nth(0);
  await expect.poll(() => textOf(first)).toBe('Ann');
  await tapCentre(page, first);
  await page.keyboard.press('End');
  await page.keyboard.type(' Lee');

  await expect.poll(() => textOf(first), { message: 'the fix landed in the box that was tapped' }).toBe('Ann Lee');
  expect(await elementCount(page), 'going back into a box never creates another one').toBe(2);
});

test('an empty box never tells a phone user to double-click', async ({ page }) => {
  // The placeholder on an empty, closed box read "Double-click to edit" - on a
  // phone, an instruction to perform the one gesture that cannot work there.
  await openPracticeForm(page);
  const textTool = page.getByRole('toolbar', { name: 'PDF annotations' }).getByRole('button', { name: 'Text', exact: true });
  await textTool.click();
  await tapCentre(page, page.locator('[class*="field-hint-cell"]').first());
  // Next creates a box on the next field; leave the first one empty and closed.
  await page.getByRole('button', { name: 'Next field' }).click();

  // Two boxes: the empty closed one we left, and the one Next opened.
  await expect(page.locator('[data-editor-element] textarea')).toHaveCount(2);
  const placeholders = await page.locator('[data-editor-element] textarea').evaluateAll(
    (inputs) => inputs.map((input) => input.getAttribute('placeholder') || ''),
  );
  for (const text of placeholders) expect(text.toLowerCase(), `placeholder "${text}"`).not.toContain('double');
  // And the closed one names the gesture that does work.
  expect(placeholders, 'the closed box says how to open it on touch').toContain('Tap to type');
});
