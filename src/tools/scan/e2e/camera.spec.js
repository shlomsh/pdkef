import { test, expect } from '@playwright/test';
import { waitForIsland } from '../../../../e2e/support/tool.js';
import { writeFakeCamera } from './fakeCamera.js';

// SCAN-08 - what jsdom cannot prove about the camera in the page: with a real (fake) camera stream, Start
// scanning opens the viewfinder, the page in view is taken by itself, the camera then waits for the page to
// turn, and Done lands on the table with that one page. That the same page is never taken twice is the
// capture machine's, proven on frame sequences in captureMachine.test.ts.

const camera = writeFakeCamera();

test.use({
  // A phone: coarse pointer and touch, which is where the live camera is offered.
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${camera}`],
  },
});

test('the camera takes a page by itself and Done lands on the table', async ({ page }) => {
  await page.goto('/scan-to-pdf/');
  await waitForIsland(page);

  await page.getByText('Start scanning').click();
  const viewfinder = page.getByRole('dialog');
  await expect(viewfinder).toBeVisible();

  const stack = viewfinder.getByRole('button', { name: /The last page taken, 1 so far/ });
  await expect(stack).toBeVisible({ timeout: 15_000 });
  await expect(viewfinder.locator('[data-camera-hint]')).toHaveText('Page 1. Turn the page.');

  await viewfinder.getByRole('button', { name: 'Done' }).click();
  await expect(viewfinder).toBeHidden();
  await expect(page.locator('[data-table-page]')).toHaveCount(1);
});

// SCAN-15 - only a browser can say the page stayed put. The fake camera offers no zoom, so the track is given one.
test('a pinch on the viewfinder zooms the camera and leaves the page alone', async ({ page }) => {
  await page.addInitScript(() => {
    window.__zooms = [];
    MediaStreamTrack.prototype.getCapabilities = () => ({ zoom: { min: 1, max: 10, step: 0.1 } });
    MediaStreamTrack.prototype.applyConstraints = async (constraints) => { window.__zooms.push(constraints.advanced[0].zoom); };
  });
  await page.goto('/scan-to-pdf/');
  await waitForIsland(page);
  await page.getByText('Start scanning').click();
  const viewfinder = page.getByRole('dialog');
  await expect(viewfinder.getByRole('switch')).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  const fingers = (gap) => [{ x: 195 - gap, y: 420, id: 0 }, { x: 195 + gap, y: 420, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(40) });
  for (const gap of [60, 80, 100, 120]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(gap) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await expect.poll(() => page.evaluate(() => Math.max(0, ...window.__zooms))).toBeGreaterThan(2);
  expect(await page.evaluate(() => visualViewport.scale)).toBe(1);

  await viewfinder.getByRole('button', { name: 'Close' }).click();
  await expect(viewfinder).toBeHidden();
});

// SCAN-16 - a phone too slow for the stream: its checks are held to two a second, so the track steps down once and
// then the native camera takes over, with a line of its own.
test('a phone that cannot keep up steps down, then hands over to the native camera', async ({ page }) => {
  await page.addInitScript(() => {
    window.__sizes = [];
    window.__opens = 0;
    const realOpen = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (constraints) => { window.__opens += 1; return realOpen(constraints); };
    const realApply = MediaStreamTrack.prototype.applyConstraints;
    MediaStreamTrack.prototype.applyConstraints = function apply(constraints) {
      window.__sizes.push(constraints.width?.ideal);
      return realApply.call(this, constraints);
    };
    const RealWorker = window.Worker;
    window.Worker = class extends RealWorker {
      constructor(url, options) {
        super(url, options);
        this.slow = String(url).includes('camera');
      }

      postMessage(message, transfer) {
        if (!this.slow) { super.postMessage(message, transfer); return; }
        const data = { t: message.t, quad: null, confidence: 0, sharpness: 0, area: 0, hash: '0'.repeat(16), focus: 0 };
        setTimeout(() => this.onmessage?.({ data }), 500);
      }
    };
  });
  await page.goto('/scan-to-pdf/');
  await waitForIsland(page);
  await page.getByText('Start scanning').click();
  const viewfinder = page.getByRole('dialog');

  await expect(viewfinder.getByText('Each page goes in as a photo on this phone')).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => window.__sizes)).toEqual([2592]);
  await expect(viewfinder.getByText('Take a photo')).toBeVisible();

  // The native camera leaves the page and comes back: that must not reopen a stream the phone cannot run.
  await page.evaluate(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((done) => { setTimeout(done, 500); });
  });
  expect(await page.evaluate(() => window.__opens)).toBe(1);
});
