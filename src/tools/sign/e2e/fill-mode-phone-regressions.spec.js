import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * Fill mode (`/sign/?next=1`) on a phone: guards for the regressions Shlomi
 * found by hand on 2026-09-26, one test per bug, each named in its title.
 *
 * WebKit only (the `webkit` project, iPhone 15 profile). Every one of these
 * reproduced only there: a tap on a `<button>` does not focus it in WebKit, so
 * the fill input that held focus blurs to `<body>`, and fill mode reads a blur
 * to `<body>` as "editing ended" (useFillFocus.ts). Chromium focuses the
 * button instead and hides the bug, and jsdom has no tap-to-focus model at
 * all, so none of this can live in a unit test.
 *
 * 1. Aa opens the formatting row and it stays (975538bc).
 * 2. A second button on that row keeps the edit session (975538bc).
 * 3. Fill mode uses the compact one-row bar on phones (e1ab9cba).
 * 4. The font picker is a bottom sheet with live preview (3f32b9a2); the old
 *    popover widened the page and the phone zoomed out to fit it.
 * 5. Cancel on that sheet reverts the preview (3f32b9a2).
 * 6. A tap on a filled element's edge focuses its own input, not a selection
 *    under another field's keyboard (1fd881c5). Emulated WebKit retargets the
 *    synthesised click onto the textarea and hides this bug, so the guard
 *    checks the focus arrives during the touch itself (see the test).
 *
 * Every input is a touch tap, on the practice form, the editor's benchmark.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const PRACTICE_FORM = path.resolve(here, '..', '..', '..', '..', 'public', 'images', 'redaction-guide', 'sample.pdf');

// The `webkit` project is the only one that should run this file; chromium's
// glob also matches it, and a desktop Chrome profile has no touch to tap with.
test.skip(({ browserName }) => browserName !== 'webkit', 'the bugs guarded here are WebKit tap-focus behaviour');

async function openFillMode(page) {
  await page.goto('/sign/?next=1');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({
    name: 'practice-form.pdf',
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(PRACTICE_FORM),
  });
  await expect(page.locator('[data-fill-input]').first()).toBeVisible();
}

const isFocused = (locator) => locator.evaluate((node) => node === document.activeElement);

/**
 * Type into the first field and press Enter: the field becomes a committed
 * text element and focus moves on to the next field's input. Returns that
 * element and its textarea.
 */
async function fillFirstField(page) {
  await openFillMode(page);
  const slot = page.locator('[data-fill-input]').first();
  await slot.scrollIntoViewIfNeeded();
  await slot.tap();
  await page.keyboard.type('Ann');
  await page.keyboard.press('Enter');
  const element = page.locator('[data-editor-element]').filter({ has: page.locator('textarea') }).first();
  const textarea = element.locator('textarea');
  await expect(textarea).toHaveValue('Ann');
  // Focus has moved on to the next field, so the element is at rest.
  await expect.poll(() => isFocused(textarea)).toBe(false);
  return { element, textarea };
}

/** Fill a field, then tap back into it: the element is selected and editing. */
async function editFilledField(page) {
  const { element, textarea } = await fillFirstField(page);
  await textarea.tap();
  await expect(element).toHaveAttribute('data-editor-active', /.*/);
  await expect.poll(() => isFocused(textarea)).toBe(true);
  const actions = element.locator('[data-editor-actions]');
  await expect(actions.getByRole('button', { name: 'Formatting options', expanded: false })).toBeVisible();
  return { element, textarea, actions };
}

/** Tap Aa on the compact bar: the full formatting row takes its place. */
async function openFormattingRow(actions) {
  await actions.getByRole('button', { name: 'Formatting options', expanded: false }).tap();
  await expect(actions.getByRole('button', { name: 'Formatting options', expanded: true })).toBeVisible();
}

async function expectStillEditing(element, textarea, message) {
  await expect(element, `${message}: still selected`).toHaveAttribute('data-editor-active', /.*/);
  expect(await isFocused(textarea), `${message}: its textarea still holds focus`).toBe(true);
}

const fontOf = (textarea) => textarea.evaluate((node) => getComputedStyle(node).fontFamily);

// The old font popover was wider than the page, so iOS zoomed the whole page
// out to fit it.
async function expectNoHorizontalOverflow(page, message) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${message}: page is no wider than the viewport`).toBeLessThanOrEqual(innerWidth);
}

/** Open the font sheet from the formatting row and tap a font other than the current one. */
async function previewAnotherFont(page, element, textarea, actions) {
  await openFormattingRow(actions);
  const original = await fontOf(textarea);
  await actions.locator('button[title^="Font:"]').tap();
  const sheet = page.locator('dialog[data-fill-keep-session]');
  await expect(sheet).toBeVisible();
  const choice = sheet.locator('[role="option"][aria-selected="false"]').first();
  const chosenName = await choice.getAttribute('data-font-name');
  await choice.tap();
  await expect.poll(() => fontOf(textarea), `tapping ${chosenName} previews it on the element`).not.toBe(original);
  return { sheet, original, previewed: await fontOf(textarea) };
}

test.describe('fill mode on a phone, WebKit (SNG-17 regressions, Shlomi 2026-09-26)', () => {
  test('Aa opens the formatting row and it stays open, with the field still focused (975538bc)', async ({ page }) => {
    const { element, textarea, actions } = await editFilledField(page);
    await openFormattingRow(actions);
    // The bug: the row opened, then the deferred blur-to-body check ended the
    // edit session and the row folded shut a moment later.
    await page.waitForTimeout(300);
    await expect(actions.getByRole('button', { name: 'Formatting options' })).toHaveAttribute('aria-expanded', 'true');
    await expectStillEditing(element, textarea, 'after Aa');
  });

  test('a second button on the formatting row keeps the edit session (975538bc)', async ({ page }) => {
    const { element, textarea, actions } = await editFilledField(page);
    await openFormattingRow(actions);
    await actions.getByRole('button', { name: /^Text direction/ }).tap();
    await page.waitForTimeout(300);
    await expectStillEditing(element, textarea, 'after Text direction');
    await expect(actions.getByRole('button', { name: 'Formatting options' })).toHaveAttribute('aria-expanded', 'true');
  });

  test('fill mode uses the compact one-row bar on phones, without Previous/Next (e1ab9cba)', async ({ page }) => {
    const { actions } = await editFilledField(page);
    const box = await actions.boundingBox();
    // One row of 28px buttons plus padding; the full toolbar wraps to ~80px.
    expect(box.height).toBeLessThan(60);
    // Fill mode's keyboard Next/Previous moves between fields, so the bar has no pair of its own.
    await expect(actions.getByRole('button', { name: 'Previous field' })).toHaveCount(0);
    await expect(actions.getByRole('button', { name: 'Next field' })).toHaveCount(0);
  });

  test('the font picker is a bottom sheet: preview on tap, Done keeps it and returns to the field (3f32b9a2)', async ({ page }) => {
    const { element, textarea, actions } = await editFilledField(page);
    await expectNoHorizontalOverflow(page, 'before the sheet');
    const { sheet, previewed } = await previewAnotherFont(page, element, textarea, actions);

    // Docked to the bottom of the viewport, full width.
    const dock = await sheet.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { open: node.open, left: rect.left, width: rect.width, bottom: rect.bottom, innerWidth: window.innerWidth, innerHeight: window.innerHeight };
    });
    expect(dock.open).toBe(true);
    expect(Math.abs(dock.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(dock.width - dock.innerWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(dock.bottom - dock.innerHeight)).toBeLessThanOrEqual(1);
    // The search field never takes focus by itself: that would raise the keyboard over the list.
    expect(await sheet.locator('input').evaluate((node) => node === document.activeElement)).toBe(false);
    // A preview leaves the sheet open for another try.
    await expect(sheet).toBeVisible();
    await expectNoHorizontalOverflow(page, 'with the sheet open');

    await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(sheet).toHaveCount(0);
    expect(await fontOf(textarea), 'Done keeps the previewed font').toBe(previewed);
    await expect.poll(() => isFocused(textarea), 'focus returns to the field').toBe(true);
    await expectStillEditing(element, textarea, 'after Done');
    await expectNoHorizontalOverflow(page, 'after Done');
  });

  test('Cancel on the font sheet reverts the preview (3f32b9a2)', async ({ page }) => {
    const { element, textarea, actions } = await editFilledField(page);
    const { sheet, original } = await previewAnotherFont(page, element, textarea, actions);
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).tap();
    await expect(sheet).toHaveCount(0);
    await expect.poll(() => fontOf(textarea), 'Cancel puts the original font back').toBe(original);
    await expectNoHorizontalOverflow(page, 'after Cancel');
  });

  test('a tap on a filled element\'s edge focuses its own input, not a selection under the next field (1fd881c5)', async ({ page }) => {
    const { element, textarea } = await fillFirstField(page);
    // The next field holds focus (and on a phone, the keyboard).
    await expect(page.locator('[data-fill-input]:focus')).toHaveCount(1);

    // Two px outside the rendered box, inside the element's hit overhang
    // (EditorElement.module.css's `inset: -4px`): on the element, off its textarea.
    const point = await element.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const candidates = [
        { x: rect.left + rect.width / 2, y: rect.top - 2 },
        { x: rect.left - 2, y: rect.top + rect.height / 2 },
        { x: rect.left + rect.width / 2, y: rect.bottom + 2 },
      ];
      return candidates.find(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return hit && node.contains(hit) && !hit.closest('textarea');
      }) ?? null;
    });
    expect(point, 'a point on the element but outside its textarea').not.toBeNull();

    // Which event the focus arrived during: the touch itself, or a mouse event
    // the browser synthesised from it. Playwright's WebKit retargets that
    // synthesised click from the edge onto the textarea 2px away, which
    // focuses it natively and hides the bug here; on the phone, that click
    // selected the element and left the keyboard on the other field. The fix
    // focuses the element's own input in the touch handler and cancels the
    // click, so that is what this checks.
    await page.evaluate(() => {
      window.__focusArrivedDuring = null;
      let during = null;
      for (const type of ['touchstart', 'touchend', 'mousedown', 'click']) {
        window.addEventListener(type, () => { during = type; }, { capture: true });
      }
      window.addEventListener('focusin', (event) => {
        if (event.target.tagName === 'TEXTAREA') window.__focusArrivedDuring ??= during;
      }, { capture: true });
    });

    await page.touchscreen.tap(point.x, point.y);
    await expect.poll(() => isFocused(textarea), 'the tapped element\'s own input takes focus').toBe(true);
    expect(await page.evaluate(() => window.__focusArrivedDuring), 'focused by the tap itself, not a synthesised click').toBe('touchend');
    await expect(element).toHaveAttribute('data-editor-active', /.*/);
  });
});
