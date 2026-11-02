import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

/* R52, R62 outside the lamp: two fingers use the browser's own zoom, and zoomed in, one finger sideways still marks from a
   line of text and pans the page from anywhere else. Only a real browser decides touch-action and claims a pan, so this
   is an e2e. CDP touch points are in the visual viewport's CSS px, unscaled: a page point maps by its viewport offset. */

test.use({ serviceWorkers: 'block', hasTouch: true, isMobile: true, viewport: { width: 402, height: 874 } });

const view = (page) => page.evaluate(() => ({ left: visualViewport.offsetLeft, top: visualViewport.offsetTop, scale: visualViewport.scale }));

async function swipe(page, cdp, x, y, dx) {
  const v = await view(page);
  const at = (step) => ({ x: x - v.left + (dx * step) / 10, y: y - v.top });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(0)] });
  for (let step = 1; step <= 10; step += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(step)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('outside the lamp two fingers zoom the page, and one finger marks from a line and pans from a gap', async ({ page }) => {
  const source = await makePdfBuffer(null, { title: false, lines: [{ text: 'A line of text a student would highlight', y: 700 }] });
  await openTool(page, '/highlight-pdf/', { file: { name: 'pinch.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
  const box = await page.locator('[data-page-overlay]').first().boundingBox();
  const lineY = box.y + box.height * ((792 - 694) / 792);
  const textX = box.x + box.width * (72 / 612);
  const marks = page.locator('[data-page-overlay] [data-element-id]');
  const cdp = await page.context().newCDPSession(page);

  await cdp.send('Input.synthesizePinchGesture', { x: textX + 10, y: lineY, scaleFactor: 2, relativeSpeed: 400, gestureSourceType: 'touch' });
  await expect.poll(async () => (await view(page)).scale).toBeGreaterThan(1.5);
  await expect(marks).toHaveCount(0);

  const zoomed = await view(page);
  await swipe(page, cdp, Math.max(textX + 4, zoomed.left + 10), lineY, 60);
  await expect(marks).toHaveCount(1);
  expect((await view(page)).left).toBeCloseTo(zoomed.left, 0);

  const gapY = box.y + box.height * 0.6;
  await page.evaluate((y) => window.scrollTo(0, y - 200), gapY);
  const before = await view(page);
  await swipe(page, cdp, before.left + 150, Math.max(gapY, before.top + 100), -100);
  await expect.poll(async () => (await view(page)).left).toBeGreaterThan(before.left + 20);
  await expect(marks).toHaveCount(1);
});

test('in the lamp a pinch is the lamp\'s own zoom: the browser stays at 1x', async ({ page }) => {
  const source = await makePdfBuffer(null, { title: false, lines: [{ text: 'A line of text a student would highlight', y: 700 }] });
  await openTool(page, '/highlight-pdf/', { file: { name: 'pinch.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
  await page.getByRole('button', { name: 'Full screen' }).first().tap();
  await expect(page.locator('[role="toolbar"][data-mode]')).toBeVisible();
  const box = await page.locator('[data-page-overlay]').first().boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.synthesizePinchGesture', { x: box.x + box.width / 2, y: box.y + 200, scaleFactor: 2, relativeSpeed: 400, gestureSourceType: 'touch' });
  await expect.poll(async () => (await page.locator('[data-page-overlay]').first().boundingBox()).width).toBeGreaterThan(box.width * 1.3);
  expect((await view(page)).scale).toBeCloseTo(1, 2);
});
