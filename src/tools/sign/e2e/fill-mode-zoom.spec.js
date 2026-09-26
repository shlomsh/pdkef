import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, devices } from '@playwright/test';

/**
 * Fill mode (`/sign/?next=1`) on a phone: zoom and the practice form. Three
 * regressions Shlomi hit on 2026-09-26, one test each.
 *
 * 1. Moving between fields keeps a pinch zoom (SNG-17, 9666ebc8). A static
 *    `maximum-scale=1` stopped iOS zooming in on focus, but iOS re-applies
 *    the viewport meta on every focus change, so it also snapped his own
 *    pinch back to 1 the moment he moved to the next field.
 *    `viewportContent` (`src/tools/sign/fill/viewportZoomLock.ts`) now adds
 *    the clamp only while the page is at rest.
 * 2. At rest the meta carries `maximum-scale=1` in fill mode (the iOS
 *    zoom-on-focus fix, b4519a2d), it is gone while zoomed, and production
 *    (no `?next=1`) never gets it.
 * 3. The practice form keeps fill mode (SNG-18, 3d5cc0d6): the practice
 *    form lives in the home page's launcher, which used to navigate to a
 *    bare `/sign/`, dropping `?next=1`.
 *
 * What Chromium can and cannot prove here, measured while writing this:
 * Chromium applies `maximum-scale=1` as a hard clamp, to a user pinch
 * (`Input.synthesizePinchGesture`) and to `Emulation.setPageScaleFactor`
 * alike, and re-clamps on its next layout after the meta changes. iOS instead
 * ignores the clamp during a user pinch and applies it on the next focus. So
 * no CDP call reproduces "iOS lets the person pinch past a resting clamp". The
 * stand-in, `pinchInPastRestingClamp`, loosens the resting clamp to
 * `maximum-scale=5` (the part iOS does for free) and then pinches for real.
 * Everything after that is the app's own doing and is what these tests
 * assert: its `visualViewport` 'resize' handler rewrites the meta to the
 * page's original content with no `maximum-scale` at all while zoomed, puts
 * `maximum-scale=1` back once the person pinches out to rest, and the pinch
 * survives an Enter to the next field. A regression that clamps while zoomed,
 * on load or on focus, snaps Chromium's scale back to 1 on the spot, which is
 * the same outcome iOS shows the person on the next field.
 *
 * Why e2e: jsdom has no visual viewport, no viewport meta handling and no
 * pinch; the pure half (`viewportContent`) has its own unit test.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const PRACTICE_FORM = path.resolve(here, '..', '..', '..', '..', 'public', 'images', 'redaction-guide', 'sample.pdf');

// Pixel 7: isMobile, so Chromium honours the viewport meta, and hasTouch.
const { defaultBrowserType, ...pixel7 } = devices['Pixel 7'];
test.use({ ...pixel7 });

const CLAMP = /maximum-scale=1(?![.\d])/;
// The layout's own meta (src/layouts/BaseLayout.astro), before fill mode touches it.
const ORIGINAL_META = 'width=device-width, initial-scale=1, viewport-fit=cover';
const ZOOM = 2;
// A synthesized pinch can fall short under a loaded runner, so the tests
// pin the scale actually reached and assert that one is kept.
const ZOOMED_AT_LEAST = 1.4;
// Chromium scrolls a focused input just far enough to fit, so its edge can
// sit a subpixel past the visual viewport's.
const EDGE_SLACK_PX = 2;

async function openPracticeForm(page, url) {
  await page.goto(url);
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

const viewportMeta = (page) => page.locator('meta[name="viewport"]').getAttribute('content');
const scaleOf = (page) => page.evaluate(() => window.visualViewport.scale);
const focusedFillKey = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-fill-key') ?? null);

/** The focused element's rect against the visual viewport, both in layout-viewport CSS px. */
const focusedAgainstVisualViewport = (page) => page.evaluate(() => {
  const r = document.activeElement.getBoundingClientRect();
  const v = window.visualViewport;
  return {
    left: r.left - v.offsetLeft,
    top: r.top - v.offsetTop,
    right: v.offsetLeft + v.width - r.right,
    bottom: v.offsetTop + v.height - r.bottom,
  };
});

async function pinch(page, point, scaleFactor) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.synthesizePinchGesture', {
    x: point.x,
    y: point.y,
    scaleFactor,
    relativeSpeed: 1000,
    gestureSourceType: 'touch',
  });
  await cdp.detach();
}

/**
 * A pinch zoom the way iOS allows it over a resting `maximum-scale=1`: see
 * the file header. Loosens the clamp (iOS's part), then pinches for real
 * toward `point`, which also pans the visual viewport there. Repeated until
 * the page is zoomed, since under a loaded runner a synthesized pinch
 * sometimes stops short or never starts (measured: 1x, 1.55x, 1.86x of 2x).
 * Returns the scale it settled at.
 */
async function pinchInPastRestingClamp(page, point) {
  await expect.poll(async () => {
    const scale = await scaleOf(page);
    if (scale > ZOOMED_AT_LEAST) return scale;
    await page.evaluate(async () => {
      const meta = document.querySelector('meta[name="viewport"]');
      meta.setAttribute('content', meta.getAttribute('content').replace(/maximum-scale=1(?![.\d])/, 'maximum-scale=5'));
      // Chromium applies new scale limits only on its next layout, and an
      // idle page may not lay out again for seconds (measured: pinch and
      // setPageScaleFactor both stuck at 1 with the loosened meta in place).
      // Dirty layout for one frame, then put it back.
      const root = document.documentElement;
      root.style.setProperty('min-height', '101vh');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      root.style.removeProperty('min-height');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await pinch(page, point, ZOOM / scale);
    return scaleOf(page);
  }, { message: 'the pinch zoomed in' }).toBeGreaterThan(ZOOMED_AT_LEAST);
  // Settled: the gesture's last scale-change frames have landed.
  await page.waitForTimeout(300);
  return scaleOf(page);
}

test('fill mode: moving to the next field keeps a pinch zoom (SNG-17, 9666ebc8)', async ({ page }) => {
  await openPracticeForm(page, '/sign/?next=1');
  const first = page.locator('[data-fill-input]').first();
  await first.focus();
  const firstKey = await focusedFillKey(page);
  expect(firstKey, 'a fill input has focus').not.toBeNull();

  const box = await first.boundingBox();
  const zoomed = await pinchInPastRestingClamp(page, { x: box.x + 10, y: box.y + box.height / 2 });

  // Enter is fill mode's own hop to the next field (docs/sign-fill-mode.md,
  // "Keys"), and the only one Chrome on iOS has. Three hops: the third one
  // leaves the column, so the platform has to pan to it.
  let previousKey = firstKey;
  for (let hop = 1; hop <= 3; hop += 1) {
    await page.keyboard.press('Enter');
    await expect.poll(() => focusedFillKey(page), { message: `hop ${hop}: focus moved on` }).not.toBe(previousKey);
    previousKey = await focusedFillKey(page);
    expect(previousKey, `hop ${hop}: focus is on a fill input`).not.toBeNull();

    // A moment after focus, so a snap back to 1 that lands a frame or two
    // later is still caught.
    await page.waitForTimeout(300);
    expect(await scaleOf(page), `hop ${hop}: still zoomed ${zoomed.toFixed(2)}x after moving to the next field`).toBeCloseTo(zoomed, 2);
    expect(await viewportMeta(page), `hop ${hop}: no maximum-scale while zoomed`).not.toMatch(CLAMP);
    const inset = await focusedAgainstVisualViewport(page);
    for (const [edge, px] of Object.entries(inset)) {
      expect(px, `hop ${hop}: the newly focused field is inside the visual viewport (${edge} edge)`).toBeGreaterThanOrEqual(-EDGE_SLACK_PX);
    }
  }
});

test('fill mode: maximum-scale=1 at rest, gone while zoomed, back at rest (SNG-17, b4519a2d)', async ({ page }) => {
  await openPracticeForm(page, '/sign/?next=1');
  await expect.poll(() => viewportMeta(page), { message: 'at rest, fill mode clamps iOS zoom-on-focus' }).toBe(`${ORIGINAL_META}, maximum-scale=1`);
  const first = page.locator('[data-fill-input]').first();
  await first.focus();
  expect(await viewportMeta(page), 'focusing a field at rest keeps the clamp').toMatch(CLAMP);

  // Zoomed: the app's own resize handler replaces the loosened stand-in with
  // the layout's original content, no maximum-scale of any kind.
  const box = await first.boundingBox();
  await pinchInPastRestingClamp(page, { x: box.x + 10, y: box.y + box.height / 2 });
  await expect.poll(() => viewportMeta(page), { message: 'while zoomed the meta is the layout original' }).toBe(ORIGINAL_META);

  // Back at rest, the clamp returns by itself. Each pinch halves the scale
  // (the layout's minimum is 1), repeated since a synthesized pinch can stop
  // short under load (measured: 1.70x left).
  await expect.poll(async () => {
    if ((await scaleOf(page)) > 1.001) await pinch(page, { x: 100, y: 100 }, 0.5);
    return scaleOf(page);
  }, { message: 'pinched back out to rest' }).toBeCloseTo(1, 2);
  await expect.poll(() => viewportMeta(page), { message: 'pinching back out to rest restores the clamp' }).toBe(`${ORIGINAL_META}, maximum-scale=1`);
});

test('production (no ?next=1) never gets maximum-scale, with a field being typed in (SNG-17, b4519a2d)', async ({ page }) => {
  // Its own test for a fresh context: a second load in the same one would
  // restore the practice form from recents instead of offering the picker.
  await openPracticeForm(page, '/sign/');
  await expect(page.locator('[data-fill-input]'), 'production is not fill mode').toHaveCount(0);
  await page.getByRole('toolbar', { name: 'PDF annotations' }).getByRole('button', { name: 'Text', exact: true }).click();
  const field = page.locator('[class*="field-hint-cell"]').first();
  await field.scrollIntoViewIfNeeded();
  const fieldBox = await field.boundingBox();
  await page.touchscreen.tap(fieldBox.x + fieldBox.width / 2, fieldBox.y + fieldBox.height / 2);
  await expect(page.locator('[data-editor-element]')).toHaveCount(1);
  expect(await viewportMeta(page), 'production never gets maximum-scale').toBe(ORIGINAL_META);
});

test('the practice form keeps fill mode: /?next=1 opens it on /sign/?next=1 (SNG-18, 3d5cc0d6)', async ({ page }) => {
  await page.goto('/?next=1');
  await page.getByRole('button', { name: /practice form/i }).first().click();
  await page.waitForURL(/\/sign\//);
  expect(new URL(page.url()).searchParams.get('next'), 'the practice form URL keeps next=1').toBe('1');
  await expect(page.locator('[data-fill-input]').first(), 'fill mode is on: the form shows fill inputs').toBeVisible();
  await expect.poll(() => viewportMeta(page), { message: 'fill mode is on: the resting clamp is set' }).toMatch(CLAMP);
});
