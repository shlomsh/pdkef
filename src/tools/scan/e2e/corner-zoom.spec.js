import { test, expect } from '@playwright/test';
import { waitForIsland } from '../../../../e2e/support/tool.js';

// SCAN-75 - what jsdom cannot prove about zooming the corner editor: Fit is the layout without zoom
// (no scrollbar, the frame inside its area), Ctrl+= grows the frame and makes the area scroll, the
// pointer's photo point stays put under Ctrl+wheel, a corner drag still lands under the pointer on a
// scrolled photo, and no edge of the page is out of reach.

// The same fixture photo as corner-drag.spec.js: dark desk, a lighter page turned about 6 degrees.
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

const center = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

async function openCorners(page) {
  await page.goto('/scan-to-pdf/');
  await waitForIsland(page);
  await page.locator('input[type=file]:not([capture])').first().setInputFiles({
    name: 'desk-photo.jpg',
    mimeType: 'image/jpeg',
    buffer: await makePhotoBytes(page),
  });
  await page.locator('[data-table-page]').first().click();
  await page.getByRole('button', { name: 'Edges', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Top-left corner' })).toBeVisible({ timeout: 20_000 });
  const frame = page.locator('[data-corner-frame]');
  // The photo area is the frame's parent: the box the zoom scrolls.
  const area = frame.locator('xpath=..');
  return { frame, area };
}

const scrollMetrics = (area) => area.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));

test.describe('scan - corner zoom', () => {
  test('at Fit the photo area does not scroll and the frame lies inside it', async ({ page }) => {
    const { frame, area } = await openCorners(page);
    const m = await scrollMetrics(area);
    expect(m.sw).toBe(m.cw);
    expect(m.sh).toBe(m.ch);
    const f = await frame.boundingBox();
    const a = await area.boundingBox();
    expect(f.x).toBeGreaterThanOrEqual(a.x - 0.5);
    expect(f.y).toBeGreaterThanOrEqual(a.y - 0.5);
    expect(f.x + f.width).toBeLessThanOrEqual(a.x + a.width + 0.5);
    expect(f.y + f.height).toBeLessThanOrEqual(a.y + a.height + 0.5);
  });

  test('Ctrl+= makes the frame about 1.5 times wider and the area scrollable, and Ctrl+0 brings back the start', async ({ page }) => {
    const { frame, area } = await openCorners(page);
    const start = await frame.boundingBox();
    await page.keyboard.press('Control+=');
    await expect.poll(async () => (await frame.boundingBox()).width / start.width).toBeGreaterThan(1.4);
    const zoomed = await frame.boundingBox();
    expect(zoomed.width / start.width).toBeLessThan(1.6);
    const m = await scrollMetrics(area);
    expect(m.sw > m.cw || m.sh > m.ch).toBe(true);
    await page.keyboard.press('Control+0');
    await expect.poll(async () => JSON.stringify(await frame.boundingBox())).toBe(JSON.stringify(start));
  });

  test('the Fit page chip shows while zoomed in, returns the frame to its fit width, and goes away', async ({ page }) => {
    const { frame } = await openCorners(page);
    const chip = page.locator('[data-fit-page]');
    await expect(chip).toHaveCount(0);
    const start = await frame.boundingBox();
    await page.keyboard.press('Control+=');
    await expect(chip).toBeVisible();
    expect((await frame.boundingBox()).width).toBeGreaterThan(start.width + 1);
    await chip.click();
    await expect.poll(async () => Math.abs((await frame.boundingBox()).width - start.width)).toBeLessThanOrEqual(1);
    await expect(chip).toHaveCount(0);
  });

  test('Ctrl+wheel keeps the photo point under the pointer', async ({ page }) => {
    const { frame } = await openCorners(page);
    const f0 = await frame.boundingBox();
    // A wheel event carries whole-pixel coordinates, and the zoom holds exactly that point: at six times the size a
    // fraction of a pixel in the pointer would read as several pixels of drift.
    const pointer = { x: Math.round(f0.x + f0.width * 0.7), y: Math.round(f0.y + f0.height * 0.3) };
    const spot = { x: (pointer.x - f0.x) / f0.width, y: (pointer.y - f0.y) / f0.height };
    await page.mouse.move(pointer.x, pointer.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await frame.boundingBox()).width / f0.width).toBeGreaterThan(1.1);
    // Let the wheel burst end and the zoom commit; then read the photo point under the pointer.
    await expect(page.locator('[data-fit-page]')).toBeVisible();
    const f1 = await frame.boundingBox();
    const under = { x: (pointer.x - f1.x) / f1.width, y: (pointer.y - f1.y) / f1.height };
    expect(Math.abs(under.x - spot.x) * f1.width).toBeLessThan(3);
    expect(Math.abs(under.y - spot.y) * f1.height).toBeLessThan(3);
  });

  test('zoomed in and scrolled, a dragged corner lands under the pointer', async ({ page }) => {
    const { frame, area } = await openCorners(page);
    await page.keyboard.press('Control+=');
    await page.keyboard.press('Control+=');
    // The far corner is out of view at this zoom: bringing it in scrolls the photo area both ways.
    const handle = page.getByRole('button', { name: 'Bottom-right corner' });
    await handle.scrollIntoViewIfNeeded();
    const scrolled = await area.evaluate((el) => el.scrollLeft + el.scrollTop);
    expect(scrolled, 'the photo area is scrolled').toBeGreaterThan(0);
    const from = center(await handle.boundingBox());
    const target = { x: from.x - 12, y: from.y - 9 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 5 });
    const f = await frame.boundingBox();
    const index = 2; // bottom right
    const points = (await frame.locator('[data-outline] line').evaluateAll((ls) => ls.map((l) => [l.getAttribute('x1'), l.getAttribute('y1')]))).map((p) => p.map((v) => parseFloat(v) / 100));
    const at = { x: f.x + points[index][0] * f.width, y: f.y + points[index][1] * f.height };
    expect(Math.hypot(at.x - target.x, at.y - target.y)).toBeLessThan(2);
    await page.mouse.up();
  });

  test('at zoom 1.5 every edge of the frame can be scrolled into view', async ({ page }) => {
    const { frame, area } = await openCorners(page);
    await page.keyboard.press('Control+=');
    await expect.poll(async () => (await scrollMetrics(area)).sw > 0 && (await frame.boundingBox()).width).toBeGreaterThan(0);
    const a = await area.boundingBox();
    // The frame fits its area at Fit, so a zoomed frame is larger on at least the width; per axis,
    // scroll to each end and the matching edge must lie inside the area.
    await area.evaluate((el) => el.scrollTo(0, 0));
    let f = await frame.boundingBox();
    expect(f.x).toBeGreaterThanOrEqual(a.x - 1);
    expect(f.y).toBeGreaterThanOrEqual(a.y - 1);
    await area.evaluate((el) => el.scrollTo(el.scrollWidth, el.scrollHeight));
    f = await frame.boundingBox();
    expect(f.x + f.width).toBeLessThanOrEqual(a.x + a.width + 1);
    expect(f.y + f.height).toBeLessThanOrEqual(a.y + a.height + 1);
  });
});
