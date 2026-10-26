import { test, expect } from '@playwright/test';

// SCAN-01 - what jsdom cannot prove about the corner editor: a real pointer
// drag moves the handle while it is held, the handle stays where it was dropped,
// the dropped corners reprocess the page (new strip thumbnail), and a drag
// across the opposite corner (a bow tie) snaps the handle back.

// A phone-like photo: dark desk, a lighter page turned about 6 degrees, dark text bars.
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
    ctx.fillStyle = '#2b2b2b';
    for (let i = 0; i < 12; i += 1) ctx.fillRect(-240, -340 + i * 50, 480 - (i % 3) * 70, 16);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  return Buffer.from(bytes);
}

// The first photos scroll the result into view (smoothly): a drag measured mid-scroll is off by the scroll.
async function waitForScrollToSettle(page) {
  await expect.poll(async () => {
    const a = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(120);
    return a === await page.evaluate(() => window.scrollY);
  }, { timeout: 5_000 }).toBe(true);
}

const center = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

test.describe('scan - corner drag', () => {
  test('a dragged corner follows the pointer, stays where dropped, reprocesses the page, and a bow tie snaps back', async ({ page }) => {
    await page.goto('/scan-to-pdf/');
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();

    await page.locator('input[type=file]:not([capture])').first().setInputFiles({
      name: 'desk-photo.jpg',
      mimeType: 'image/jpeg',
      buffer: await makePhotoBytes(page),
    });

    await waitForScrollToSettle(page);
    // A new photo opens in the corners view, to approve or adjust first.
    const group = page.getByRole('group', { name: 'Page corners' });
    // The group div has no box of its own (its handles are absolutely placed), so wait on a handle.
    const handle = group.getByRole('button', { name: 'Top-left corner' });
    await expect(handle).toBeVisible({ timeout: 20_000 });
    const frame = page.locator('[data-corner-frame]');
    const thumb = page.locator('ul[aria-label="Pages"] img').first();
    await expect(thumb).toBeVisible({ timeout: 20_000 });

    // The edge guess has moved the top-left corner off the photo's own corner.
    await expect.poll(async () => {
      const f = await frame.boundingBox();
      const h = center((await handle.boundingBox()));
      return Math.hypot(h.x - f.x, h.y - f.y);
    }, { timeout: 20_000 }).toBeGreaterThan(8);

    const srcBefore = await thumb.getAttribute('src');
    const from = center(await handle.boundingBox());
    const target = { x: from.x + 40, y: from.y + 30 };

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i += 1) {
      await page.mouse.move(from.x + ((target.x - from.x) * i) / 6, from.y + ((target.y - from.y) * i) / 6);
    }
    // Still held: the handle has already moved.
    const during = center(await handle.boundingBox());
    expect(Math.hypot(during.x - target.x, during.y - target.y)).toBeLessThan(3);
    await page.mouse.up();

    const dropped = center(await handle.boundingBox());
    expect(Math.hypot(dropped.x - target.x, dropped.y - target.y)).toBeLessThan(3);

    // The page was reprocessed for the new corners.
    await expect.poll(() => thumb.getAttribute('src'), { timeout: 20_000 }).not.toBe(srcBefore);
    const settled = center(await handle.boundingBox());
    expect(Math.hypot(settled.x - target.x, settled.y - target.y)).toBeLessThan(3);

    // A bow tie: drag the corner past the opposite (bottom-right) corner.
    const f = await frame.boundingBox();
    await page.mouse.move(settled.x, settled.y);
    await page.mouse.down();
    await page.mouse.move(f.x + f.width * 0.5, f.y + f.height * 0.5, { steps: 4 });
    await page.mouse.move(f.x + f.width * 0.98, f.y + f.height * 0.98, { steps: 4 });
    await page.mouse.up();

    const snapped = center(await handle.boundingBox());
    expect(Math.hypot(snapped.x - settled.x, snapped.y - settled.y)).toBeLessThan(3);
  });
});
