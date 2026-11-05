import { test, expect } from '@playwright/test';
import { waitForIsland } from '../../../../e2e/support/tool.js';
import { pageCorners, writeFakeCamera } from './fakeCamera.js';

// SCAN-08 - what jsdom cannot prove about the camera in the page: with a real (fake) camera stream, Start
// scanning opens the viewfinder, the page in view is taken by itself, the camera then waits for the page to
// turn, and Done lands on the table with that one page. That the same page is never taken twice is the
// capture machine's, proven on frame sequences in captureMachine.test.ts.

// The fake stream is landscape (640 x 480) and the viewfinder is a portrait phone under object-fit: cover, so the person
// sees only the middle third or so of the width. The default fake page fills about a third of that visible part.
const camera = writeFakeCamera();
// A page wholly in the frame, but wider than what is on screen.
const wideCamera = writeFakeCamera(3, { halfW: 150, halfH: 200 });

const phone = (file) => ({
  // A phone: coarse pointer and touch, which is where the live camera is offered.
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${file}`],
  },
});

test.use(phone(camera));

// The 640 x 480 fake in a 390 x 844 box: where the whole frame lands (coverRect) and the corners' screen positions.
const toScreen = (corners, box) => {
  const scale = Math.max(box.width / 640, box.height / 480);
  const w = 640 * scale;
  const h = 480 * scale;
  return corners.map((p) => ({ x: (box.width - w) / 2 + p.x * w, y: (box.height - h) / 2 + p.y * h }));
};
const rectOf = (points) => ({
  left: Math.min(...points.map((p) => p.x)), right: Math.max(...points.map((p) => p.x)),
  top: Math.min(...points.map((p) => p.y)), bottom: Math.max(...points.map((p) => p.y)),
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

// The outline sits on the page on screen, though the analysed frame is the crop the person sees.
test('a sideways stream with the page filling a third of the view gets its outline on the page, and is taken', async ({ page }) => {
  await page.goto('/scan-to-pdf/');
  await waitForIsland(page);
  await page.getByText('Start scanning').click();
  const viewfinder = page.getByRole('dialog');
  const box = await viewfinder.boundingBox();
  const want = rectOf(toScreen(pageCorners(), box));

  await expect.poll(async () => page.evaluate(() => {
    const r = document.querySelector('dialog polygon')?.getBoundingClientRect();
    return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
  }), { timeout: 15_000 }).toEqual(expect.objectContaining({ left: expect.any(Number) }));
  await expect.poll(async () => page.evaluate(() => {
    const r = document.querySelector('dialog polygon')?.getBoundingClientRect();
    return r ? [r.left, r.right, r.top, r.bottom] : null;
  })).toEqual([
    expect.closeTo(want.left, -1), expect.closeTo(want.right, -1), expect.closeTo(want.top, -1), expect.closeTo(want.bottom, -1),
  ]);

  await expect(viewfinder.getByRole('button', { name: /The last page taken, 1 so far/ })).toBeVisible({ timeout: 15_000 });
});

// The page a shot keeps is the one that was framed: the corners handed on are across the whole frame. The flight into
// the stack is cut to them, so its clip-path is where they can be read.
test('the corners a shot keeps are the page across the whole frame', async ({ page }) => {
  await page.addInitScript(() => {
    window.__flights = [];
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement) || !('flatten' in node.dataset)) continue;
          const photoPage = node.children[1];
          window.__flights.push({ clip: photoPage.style.clipPath, width: parseFloat(photoPage.style.width), height: parseFloat(photoPage.style.height) });
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/scan-to-pdf/');
  await waitForIsland(page);
  await page.getByText('Start scanning').click();
  await expect.poll(() => page.evaluate(() => window.__flights.length), { timeout: 15_000 }).toBeGreaterThan(0);

  const flight = await page.evaluate(() => window.__flights[0]);
  const taken = [...flight.clip.matchAll(/(-?[\d.]+)px (-?[\d.]+)px/g)].map((m) => ({ x: parseFloat(m[1]) / flight.width, y: parseFloat(m[2]) / flight.height }));
  expect(taken).toHaveLength(4);
  for (const corner of pageCorners()) {
    const nearest = Math.min(...taken.map((p) => Math.hypot(p.x - corner.x, p.y - corner.y)));
    expect(nearest).toBeLessThan(0.03);
  }
});

// A page the person cannot see whole is not taken, whatever the whole frame holds. Its own browser: the fake camera is a launch flag.
test('a page wider than the screen is not taken, and the hint says so', async ({ playwright, baseURL }) => {
  const { launchOptions, ...contextOptions } = phone(wideCamera);
  const browser = await playwright.chromium.launch(launchOptions);
  try {
    const page = await (await browser.newContext({ ...contextOptions, baseURL })).newPage();
    // A shot that never comes has nothing to wait on, so count frames: 60 analysed are several holds' worth.
    await page.addInitScript(() => {
      window.__frames = 0;
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function count(...args) { window.__frames += 1; return post.apply(this, args); };
    });
    await page.goto('/scan-to-pdf/');
    await waitForIsland(page);
    await page.getByText('Start scanning').click();
    const viewfinder = page.getByRole('dialog');
    const hint = viewfinder.locator('[data-camera-hint]');
    await expect.poll(() => page.evaluate(() => window.__frames), { timeout: 20_000 }).toBeGreaterThan(60);
    await expect(viewfinder.getByRole('button', { name: /The last page taken/ })).toHaveCount(0);
    await expect(hint).toHaveText(/Fit the whole page in|Point at a page/);
  } finally {
    await browser.close();
  }
});

// SCAN-65 - the viewer opens over the running camera, so only a real camera shows the page coming back.
test('a page removed from the stack is taken again by itself', async ({ page }) => {
  await page.goto('/scan-to-pdf/');
  await waitForIsland(page);
  await page.getByText('Start scanning').click();
  const stack = page.getByRole('button', { name: /The last page taken, 1 so far/ });
  await expect(stack).toBeVisible({ timeout: 15_000 });

  await stack.click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(stack).toHaveCount(0);
  await expect(stack).toBeVisible({ timeout: 15_000 });
});

// The camera keeps running under the viewer, and nothing it does there may count once the viewer closes.
test('a page whose photo was swapped in the viewer is taken when the viewer closes', async ({ page }) => {
  await page.goto('/scan-to-pdf/');
  await waitForIsland(page);
  await page.getByText('Start scanning').click();
  const stack = page.getByRole('button', { name: /The last page taken, 1 so far/ });
  await expect(stack).toBeVisible({ timeout: 15_000 });
  await stack.click();

  const photo = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;
    canvas.getContext('2d').fillRect(100, 100, 400, 600);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('[data-page-viewer] input[capture]').first().setInputFiles({ name: 'swap.png', mimeType: 'image/png', buffer: Buffer.from(photo) });
  // The swap frees the page, and the paused camera then fires on it under the viewer.
  const hint = page.locator('[data-camera-hint]');
  await expect(hint).not.toHaveText(/Turn the page/);
  await expect(hint).toHaveText(/Turn the page/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /The last page taken, 2 so far/ })).toBeVisible({ timeout: 15_000 });
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
