import { test, expect } from '@playwright/test';

// SCAN-01, Shlomi on his iPhone: "my finger hides the exact positioning". A touch drag on a
// corner shows a magnifier loupe off the finger, and it goes away on release. Real touch events
// through CDP, on a phone viewport: what jsdom cannot prove is where the loupe lands on screen.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function makePhotoBytes(page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2a2622';
    ctx.fillRect(0, 0, 900, 1200);
    ctx.translate(450, 600);
    ctx.rotate((6 * Math.PI) / 180);
    ctx.fillStyle = '#f1efe8';
    ctx.fillRect(-300, -420, 600, 840);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  return Buffer.from(bytes);
}

// The first photos scroll the result into view (smoothly): a drag measured mid-scroll is off by the scroll.
async function waitForScrollToSettle(page) {
  await expect.poll(async () => {
    const a = await page.evaluate(() => window.scrollY);
    // Time on purpose: the sampling interval between two scroll reads.
    await page.waitForTimeout(120);
    return a === await page.evaluate(() => window.scrollY);
  }, { timeout: 5_000 }).toBe(true);
}

const center = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

test('a touch drag on a corner shows a loupe away from the finger, gone on release', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch events are dispatched through CDP');
  await page.goto('/scan-to-pdf/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await page.locator('input[type=file]:not([capture])').first().setInputFiles({
    name: 'desk-photo.jpg', mimeType: 'image/jpeg', buffer: await makePhotoBytes(page),
  });
  await waitForScrollToSettle(page);
  // A new photo opens in the corners view, to approve or adjust first.
  const handle = page.getByRole('button', { name: 'Top-left corner' });
  await expect(handle).toBeVisible({ timeout: 20_000 });
  await handle.scrollIntoViewIfNeeded();
  const loupe = page.locator('[data-loupe]');
  await expect(loupe).toBeHidden();

  const cdp = await page.context().newCDPSession(page);
  const from = center(await handle.boundingBox());
  const touch = async (type, at) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: at.x, y: at.y }],
  });
  await touch('touchStart', from);
  const to = { x: from.x + 24, y: from.y + 18 };
  for (let i = 1; i <= 4; i += 1) {
    await touch('touchMove', { x: from.x + (to.x - from.x) * (i / 4), y: from.y + (to.y - from.y) * (i / 4) });
  }

  await expect(loupe).toBeVisible();
  const box = await loupe.boundingBox();
  // On screen, and clear of the fingertip.
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  const dx = Math.max(box.x - to.x, 0, to.x - (box.x + box.width));
  const dy = Math.max(box.y - to.y, 0, to.y - (box.y + box.height));
  expect(Math.hypot(dx, dy)).toBeGreaterThan(40);

  await touch('touchEnd', to);
  await expect(loupe).toBeHidden();
});
