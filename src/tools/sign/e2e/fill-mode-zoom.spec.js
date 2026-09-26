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
 *    `viewportContent` (`src/tools/sign/fill/viewportZoomLock.ts`) adds that
 *    clamp only at rest; zoomed, it holds minimum and maximum at the pinched
 *    scale, since iOS otherwise re-zooms each focused field to 16px text
 *    (3.97x became 2.12x on a 7.53px field, iOS Simulator).
 * 2. At rest the meta carries `maximum-scale=1` in fill mode (the iOS
 *    zoom-on-focus fix, b4519a2d), the pinch scale is held while zoomed and
 *    released while two fingers are down, and the old editor (`?next=0`)
 *    never gets any of it.
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
 * assert: its `visualViewport` 'resize' handler holds the meta's limits at
 * the settled pinch scale while zoomed, puts `maximum-scale=1` back once the
 * person pinches out to rest, and the pinch survives an Enter to the next
 * field. Chromium has no focus zoom, so the 16px re-zoom itself is proven only
 * in the iOS Simulator (`npm run gate:ios`, SNG-20). A regression that clamps while zoomed,
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

// CI's Linux Chromium never applies the loosened viewport meta, so the
// stand-in pinch stays at 1x on every retry (PR 27's run, 2026-09-26). The two
// pinch tests run on macOS until SNG-21 finds a pinch that works there too.
const PINCH_STAND_IN_WORKS = process.platform !== 'linux';

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
  test.skip(!PINCH_STAND_IN_WORKS, 'Linux Chromium ignores the loosened viewport meta (SNG-21)');
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

test('fill mode: maximum-scale=1 at rest, the pinch scale held while zoomed, released under two fingers, back at rest (SNG-17)', async ({ page }) => {
  test.skip(!PINCH_STAND_IN_WORKS, 'Linux Chromium ignores the loosened viewport meta (SNG-21)');
  await openPracticeForm(page, '/sign/?next=1');
  await expect.poll(() => viewportMeta(page), { message: 'at rest, fill mode clamps iOS zoom-on-focus' }).toBe(`${ORIGINAL_META}, maximum-scale=1`);
  const first = page.locator('[data-fill-input]').first();
  await first.focus();
  expect(await viewportMeta(page), 'focusing a field at rest keeps the clamp').toMatch(CLAMP);

  // Zoomed: once the pinch settles, the app's own resize handler holds the
  // limits at the pinched scale, rounded down, so iOS's focus zoom (toward
  // 16px text) has nowhere to go.
  const box = await first.boundingBox();
  const zoomed = await pinchInPastRestingClamp(page, { x: box.x + 10, y: box.y + box.height / 2 });
  const held = Math.floor(zoomed * 100) / 100;
  await expect.poll(() => viewportMeta(page), { message: 'while zoomed the limits hold the pinch scale' })
    .toBe(`${ORIGINAL_META}, minimum-scale=${held}, maximum-scale=${held}`);

  // Two fingers down release every limit, so a pinch back out is never held;
  // lifting them puts the held scale back once the page settles.
  const cdp = await page.context().newCDPSession(page);
  const fingers = [{ x: 150, y: 300, id: 1 }, { x: 250, y: 300, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers });
  await expect.poll(() => viewportMeta(page), { message: 'two fingers down release the limits' }).toBe(ORIGINAL_META);
  // Held, not tapped: Chromium reads a quick two-finger tap as "zoom out".
  await page.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // Lifting them puts limits back for whatever scale is left. Chromium keeps
  // no zoom of its own under min = max limits, so releasing them drops it to
  // 1x here (iOS keeps the person's zoom apart from the page's limits); the
  // app's decision is what's asserted, not Chromium's leftover scale.
  await expect.poll(async () => {
    const scale = await scaleOf(page);
    const expected = scale > 1.01
      ? `${ORIGINAL_META}, minimum-scale=${Math.floor(scale * 100) / 100}, maximum-scale=${Math.floor(scale * 100) / 100}`
      : `${ORIGINAL_META}, maximum-scale=1`;
    return (await viewportMeta(page)) === expected;
  }, { message: 'lifting them puts the limits back for the scale that is left' }).toBe(true);
  await cdp.detach();

  // Back at rest, the clamp returns by itself. Chromium, unlike iOS, holds a
  // pinch to the page's limits, so each round loosens them first (iOS's part,
  // as pinchInPastRestingClamp does) and halves the scale; repeated since a
  // synthesized pinch can stop short under load (measured: 1.70x left).
  await expect.poll(async () => {
    if ((await scaleOf(page)) > 1.001) {
      await page.evaluate(() => {
        const meta = document.querySelector('meta[name="viewport"]');
        meta.setAttribute('content', meta.getAttribute('content').replace(/, *(?:minimum|maximum)-scale=[\d.]+/g, ''));
      });
      await pinch(page, { x: 100, y: 100 }, 0.5);
    }
    return scaleOf(page);
  }, { message: 'pinched back out to rest' }).toBeCloseTo(1, 2);
  await expect.poll(() => viewportMeta(page), { message: 'pinching back out to rest restores the clamp' }).toBe(`${ORIGINAL_META}, maximum-scale=1`);
});

test('the old editor (?next=0) never gets maximum-scale, with a field being typed in (SNG-17, b4519a2d)', async ({ page }) => {
  // Its own test for a fresh context: a second load in the same one would
  // restore the practice form from recents instead of offering the picker.
  await openPracticeForm(page, '/sign/?next=0');
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
