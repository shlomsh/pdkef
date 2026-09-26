import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * MOBI-30: a tap on blank page area deselects a text box, whether it is open
 * for typing, selected but not editing, or (untested here - covered by
 * PdfWorkspace.test.tsx's own blur assertion) already had its keyboard
 * dismissed some other way.
 *
 * Reported on a real iPhone, not reproducible on the iOS Simulator with a
 * clean stationary tap, and not reproducible under Playwright's own
 * `page.touchscreen.tap()` either (see touch-edit-reentry.spec.js's
 * `closeSession`, which already passes with a plain tap). The likely
 * mechanism: iOS reads a tap with a few points of finger jitter as the start
 * of a pan, fires `pointercancel` and suppresses the synthesised `click`
 * entirely - but still delivers `touchstart`/`touchend`. `PdfWorkspace.tsx`
 * now recognises the tap from those two events directly
 * (`src/tools/sign/tapOutsideDeselect.ts`), so this suite drives raw touch
 * input through CDP `Input.dispatchTouchEvent` rather than the high-level
 * `touchscreen.tap()`, which cannot express jitter, a slow pan, or a second
 * finger. CDP touch injection is Chromium-only (see touch-edit-reentry.spec.js,
 * the existing precedent: it is not in playwright.config.js's `webkit`
 * project's testMatch allowlist either), so this file is Chromium-only too;
 * WebKit's own coverage is the plain-tap case already proven by
 * touch-edit-reentry.spec.js's `closeSession`.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  here, '..', '..', '..', '..', 'src', 'tools', 'sign', 'fields', '__fixtures__',
  'health-declaration-page1-geometry.pdf',
);

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const elements = (page) => page.locator('[data-editor-element]');
/** The one textarea a caret can actually be in: outside a session it is `readOnly`. */
const openSession = (page) => page.locator('[data-editor-text-input]:not([readonly])');
const activeElement = (page) => page.locator('[data-editor-element][data-editor-active]');

async function openWithFixture(page) {
  await page.goto('/sign/?next=0');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({
    name: 'health-declaration.pdf',
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(FIXTURE),
  });
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
  return page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Text', exact: true });
}

/** Arms the one-shot Text tool and waits for its field hints to be on screen. */
async function armText(page, textTool) {
  if ((await textTool.getAttribute('aria-pressed')) !== 'true') await textTool.click();
  await expect(page.locator('[class*="field-hint-cell"]').first()).toBeVisible();
}

/**
 * Taps the centre of whatever `locator` currently is via CDP, so every tap in
 * this file - including the ones that must NOT deselect - goes through the
 * same raw touch pipeline as the gesture under test, not `touchscreen.tap()`.
 */
async function tapCentre(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const rect = await locator.boundingBox();
  await touchTap(page, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  return rect;
}

/**
 * Places a text box on the first detected free-text cell and types into it,
 * leaving it open for typing (armed once, one placement - see editor.md's
 * "tools are one-shot").
 */
async function placeAndFillFirstCell(page, textTool, text = 'Shlomi') {
  await armText(page, textTool);
  await tapCentre(page, page.locator('[class*="field-hint-cell"]').first());
  await expect(elements(page)).toHaveCount(1);
  await expect(openSession(page)).toHaveCount(1);
  await page.keyboard.type(text);
}

/**
 * One finger, touchdown at `start`, optionally jittering to `end` before
 * release (both in CSS px / viewport coordinates). `end` defaults to `start`
 * for a perfectly stationary tap. This is the low-level primitive every case
 * below is built from - a real device tap is never perfectly stationary, and
 * `page.touchscreen.tap()` cannot express the difference between a 6px
 * jitter and an 80px pan.
 */
async function touchTap(page, start, end = start) {
  const cdp = await page.context().newCDPSession(page);
  const point = (p) => [{ x: p.x, y: p.y, radiusX: 1, radiusY: 1, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(start) });
  if (end.x !== start.x || end.y !== start.y) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(end) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** A real one-finger pan: several touchmove steps between `from` and `to`. */
async function touchPan(page, from, to, steps = 5) {
  const cdp = await page.context().newCDPSession(page);
  const point = (p) => [{ x: p.x, y: p.y, radiusX: 1, radiusY: 1, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from) });
  for (let step = 1; step <= steps; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point({
        x: from.x + ((to.x - from.x) * step) / steps,
        y: from.y + ((to.y - from.y) * step) / steps,
      }),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Two fingers, touching down together and spreading apart - a pinch. */
async function touchPinch(page, center) {
  const cdp = await page.context().newCDPSession(page);
  const points = (offset) => [
    { x: center.x - offset, y: center.y, id: 1, radiusX: 1, radiusY: 1, force: 1 },
    { x: center.x + offset, y: center.y, id: 2, radiusX: 1, radiusY: 1, force: 1 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(10) });
  for (const offset of [20, 30, 40]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(offset) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test.describe('tap outside deselects on touch (MOBI-30)', () => {
  test('a stationary tap on blank page area closes an open edit session', async ({ page }) => {
    const textTool = await openWithFixture(page);
    await placeAndFillFirstCell(page, textTool);

    const container = await page.locator('[class*="pages-container"]').boundingBox();
    await touchTap(page, { x: container.x + 4, y: container.y + 4 });

    await expect(openSession(page)).toHaveCount(0);
    await expect(activeElement(page)).toHaveCount(0);
    // The box itself must survive - this closes the session, it never deletes.
    await expect(elements(page)).toHaveCount(1);
  });

  test('a touch that jitters 6 CSS px before release still deselects', async ({ page }) => {
    const textTool = await openWithFixture(page);
    await placeAndFillFirstCell(page, textTool);

    const container = await page.locator('[class*="pages-container"]').boundingBox();
    const start = { x: container.x + 20, y: container.y + 20 };
    // Well under the 16 screen-pt default slop - the jitter iOS itself reads
    // as "still a tap" rather than the start of a pan.
    await touchTap(page, start, { x: start.x + 6, y: start.y });

    await expect(openSession(page)).toHaveCount(0);
    await expect(activeElement(page)).toHaveCount(0);
    await expect(elements(page)).toHaveCount(1);
  });

  test('selected but not editing, a tap on blank page area deselects', async ({ page }) => {
    const textTool = await openWithFixture(page);
    await placeAndFillFirstCell(page, textTool);

    const container = await page.locator('[class*="pages-container"]').boundingBox();
    // Close the session first (MOBI-21's documented route back to "closed").
    await touchTap(page, { x: container.x + 4, y: container.y + 4 });
    await expect(openSession(page)).toHaveCount(0);

    // Re-select the box, without re-editing it, via a real drag: movement
    // past useDraggableElement's tap tolerance is a move, not a tap, so the
    // box ends up selected (its bar is up) but not in an edit session - see
    // touch-edit-reentry.spec.js's own "after a drag ... Selected, not
    // editing" case for the same state reached the same way.
    const box = elements(page).first();
    const start = await box.boundingBox();
    await touchPan(
      page,
      { x: start.x + start.width / 2, y: start.y + start.height / 2 },
      { x: start.x + start.width / 2 + 40, y: start.y + start.height / 2 + 10 },
    );
    await expect(openSession(page)).toHaveCount(0);
    await expect(activeElement(page)).toHaveCount(1);

    await touchTap(page, { x: container.x + 4, y: container.y + 4 });
    await expect(activeElement(page)).toHaveCount(0);
  });

  test('a one-finger scroll-pan of 80px does not deselect', async ({ page }) => {
    const textTool = await openWithFixture(page);
    await placeAndFillFirstCell(page, textTool);

    const container = await page.locator('[class*="pages-container"]').boundingBox();
    const start = { x: container.x + 20, y: container.y + 20 };
    await touchPan(page, start, { x: start.x, y: start.y + 80 });

    // Whatever a real 80px pan did to scroll position, it must not have read
    // as a tap: the session (or at least the selection) must still be up.
    await expect(activeElement(page)).toHaveCount(1);
  });

  test('a pinch does not deselect', async ({ page }) => {
    const textTool = await openWithFixture(page);
    await placeAndFillFirstCell(page, textTool);

    const container = await page.locator('[class*="pages-container"]').boundingBox();
    await touchPinch(page, { x: container.x + container.width / 2, y: container.y + 100 });

    await expect(activeElement(page)).toHaveCount(1);
  });
});
