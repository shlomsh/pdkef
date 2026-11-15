import { test, expect } from '@playwright/test';
import { waitForIsland } from '../../../../e2e/support/tool.js';

// SCAN-75 - what jsdom cannot prove about the Edges editor's traced border: the page worker traces the
// whole border (64 points inside the frame), a real drag on the border pins one point (the trace is
// rewritten while the pointer is held, the pin appears on release and the settled trace passes through
// the drop point), and Undo, Redo and a tap on the pin step that pin out and in.

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

/** The trace's points as shares of the photo, read from the start of each line of the trace group (x1/y1, in percent). */
const tracePoints = (lines) => lines.map(([x, y]) => ({ x: parseFloat(x) / 100, y: parseFloat(y) / 100 }));
const readTrace = (trace) => trace.locator('line').evaluateAll((ls) => ls.map((l) => [l.getAttribute('x1'), l.getAttribute('y1'), l.getAttribute('x2'), l.getAttribute('y2')]));

async function openEdges(page) {
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
  const trace = page.locator('g[data-trace]');
  // By default the editor draws straight lines between the corners: no traced border until Fine-tune edges is on.
  await expect(trace).toHaveCount(0);
  const fine = page.getByRole('button', { name: 'Fine-tune edges', exact: true });
  await expect(fine).toHaveAttribute('aria-pressed', 'false');
  await fine.click();
  await expect(fine).toHaveAttribute('aria-pressed', 'true');
  await expect(trace).toBeAttached({ timeout: 20_000 });
  return { trace, frame: page.locator('[data-corner-frame]') };
}

test.describe('scan - corner pin', () => {
  test("the page's border is traced", async ({ page }) => {
    const { trace } = await openEdges(page);
    const points = tracePoints(await readTrace(trace));
    expect(points).toHaveLength(64);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  test('a border point is pinned by a drag, shown while dragging, and undone, redone and removed', async ({ page }) => {
    const { trace, frame } = await openEdges(page);
    const pin = page.getByRole('button', { name: "Pinned point of the page's edge" });
    await expect(pin).toHaveCount(0);

    const d0 = JSON.stringify(await readTrace(trace));
    const f = await frame.boundingBox();
    const screen = (p) => ({ x: f.x + p.x * f.width, y: f.y + p.y * f.height });
    // A mid-side point of the first side (a side is its corner then 15 traced points).
    const start = screen(tracePoints(JSON.parse(d0))[8]);
    // Inward: toward the middle of the frame, 60 px, further than the trace reaches by itself: a pin stays where it is dropped.
    const mid = { x: f.x + f.width / 2, y: f.y + f.height / 2 };
    const len = Math.hypot(mid.x - start.x, mid.y - start.y);
    const drop = { x: start.x + ((mid.x - start.x) * 60) / len, y: start.y + ((mid.y - start.y) * 60) / len };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= 5; i += 1) {
      await page.mouse.move(start.x + ((drop.x - start.x) * i) / 5, start.y + ((drop.y - start.y) * i) / 5);
    }
    // Still held: the gesture has already rewritten the trace, and no pin exists yet.
    expect(JSON.stringify(await readTrace(trace))).not.toBe(d0);
    await expect(pin).toHaveCount(0);
    await page.mouse.up();

    await expect(pin).toHaveCount(1);
    // The settled trace passes through the drop point.
    await expect.poll(async () => {
      const pts = tracePoints(await readTrace(trace)).map(screen);
      return Math.min(...pts.map((p) => Math.hypot(p.x - drop.x, p.y - drop.y)));
    }).toBeLessThan(2);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(pin).toHaveCount(0);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(pin).toHaveCount(1);

    // A tap on the pin, without moving, removes it.
    await pin.click();
    await expect(pin).toHaveCount(0);
  });
});
