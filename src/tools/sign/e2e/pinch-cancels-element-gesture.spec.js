import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * MOBI-31: a pinch whose first finger lands on a Sign text box must zoom the
 * page, never drag the box. Verified live on iOS Safari, the iOS Simulator
 * and real touch HID by the lead: the element gesture started on the first
 * finger's `touchstart`, called `preventDefault()`, and never noticed the
 * second pointer - so the pinch moved the box (it jumped from one form cell
 * to another) instead of zooming.
 *
 * jsdom cannot dispatch real multi-touch sequences, so this is a Playwright
 * guard - same reasoning as touch-edit-reentry.spec.js's own CDP drag helper.
 * Playwright's `page.touchscreen` only supports one contact point; a second,
 * concurrently-active touch needs `Input.dispatchTouchEvent` directly, which
 * is the same input pipeline the gesture controller's `touchmove` listener
 * reads. The fixture and the placement helpers mirror touch-edit-reentry.spec.js.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  here, '..', '..', '..', '..', 'src', 'editor', 'adapters', 'pdf', '__fixtures__',
  'health-declaration-page1-geometry.pdf',
);

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function openWithFixture(page) {
  await page.goto('/sign');
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
 * Taps the centre of whatever `locator` currently is, measuring immediately
 * before the tap: arming a tool adds the tool-status row, which moves the
 * document under the finger - see touch-edit-reentry.spec.js's own copy.
 */
async function tapCentre(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const rect = await locator.boundingBox();
  await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
  return rect;
}

/** Places a text box on the first detected free-text cell and types into it. */
async function placeTextBox(page, textTool, text) {
  await armText(page, textTool);
  await tapCentre(page, page.locator('[class*="field-hint-cell"]').first());
  await expect(page.locator('[data-editor-element]')).toHaveCount(1);
  await page.keyboard.type(text);
  const id = await page.locator('[data-editor-element]').first().getAttribute('data-editor-element-id');
  return page.locator(`[data-editor-element-id="${id}"]`);
}

/** Tapping the page card's own background: how a phone dismisses the keyboard. */
async function closeSession(page) {
  const container = await page.locator('[class*="pages-container"]').boundingBox();
  await page.touchscreen.tap(container.x + 4, container.y + 4);
  await expect(page.locator('[data-editor-text-input]:not([readonly])')).toHaveCount(0);
}

/**
 * A real two-finger pinch, dispatched through CDP (Playwright's own
 * `touchscreen` only ever tracks one contact point at a time). The first
 * finger touches down on `target` and drags a little on its own first - by
 * itself, exactly the single-finger gesture that used to move the box -
 * before the second finger joins and both spread apart, as a real pinch does.
 */
async function pinchOverElement(page, target) {
  const cdp = await page.context().newCDPSession(page);
  const point = (x, y, id) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 });
  const f1Start = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const f1Mid = { x: f1Start.x + 15, y: f1Start.y + 15 };
  const f2Start = { x: f1Start.x + 40, y: f1Start.y + 40 };

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(f1Start.x, f1Start.y, 0)],
  });
  // Finger 1 alone, still moving - the gesture the element hooks currently
  // read as a drag-in-progress.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [point(f1Mid.x, f1Mid.y, 0)],
  });
  // Finger 2 joins mid-gesture: both touch points are now active.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(f1Mid.x, f1Mid.y, 0), point(f2Start.x, f2Start.y, 1)],
  });
  // The pinch itself: the two fingers spread apart.
  for (let step = 1; step <= 5; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        point(f1Mid.x - step * 6, f1Mid.y - step * 6, 0),
        point(f2Start.x + step * 6, f2Start.y + step * 6, 1),
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('a pinch that starts on a text box does not move or resize it', async ({ page }) => {
  const textTool = await openWithFixture(page);
  const box = await placeTextBox(page, textTool, 'Shlomi');
  await closeSession(page);

  const before = await box.boundingBox();

  await pinchOverElement(page, before);

  // The gesture was cancelled, not committed: left/top/width are exactly
  // where they started, not somewhere along the pinch's path.
  const after = await box.boundingBox();
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
  expect(after.width).toBeCloseTo(before.width, 0);

  // And the box never opened a text-edit session either - a pinch is not a
  // tap (MOBI-21).
  await expect(page.locator('[data-editor-text-input]:not([readonly])')).toHaveCount(0);
});
