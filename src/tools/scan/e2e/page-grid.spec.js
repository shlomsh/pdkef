import { test, expect } from '@playwright/test';
import { waitForIsland } from '../../../../e2e/support/tool.js';

// SCAN-51 - what jsdom cannot prove about the desktop grid: the hover cluster shows above a tile that clips
// its own overflow, a real drag reorders without opening the page, and a click fills the window.

async function pagePhotos(page, count) {
  const photos = await page.evaluate(async (total) => {
    const made = [];
    for (let n = 1; n <= total; n += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f4f2ec';
      ctx.fillRect(0, 0, 900, 1200);
      ctx.fillStyle = '#222222';
      for (let row = 0; row < 14; row += 1) ctx.fillRect(100, 120 + row * 70, 700 - (row % 3) * 90, 18);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      made.push(Array.from(new Uint8Array(await blob.arrayBuffer())));
    }
    return made;
  }, count);
  return photos.map((bytes, i) => ({ name: `page-${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(bytes) }));
}

const order = (page) => page.$$eval('li[data-id]', (cells) => cells.map((cell) => cell.dataset.id));

test.use({ viewport: { width: 1440, height: 900 } });

test('a page is dragged, removed and opened from the grid', async ({ page }) => {
  await page.goto('/scan-to-pdf/');
  await waitForIsland(page);
  await page.locator('input[type="file"][multiple]').first().setInputFiles(await pagePhotos(page, 4));
  const tiles = page.locator('[data-table-page]');
  await expect(tiles).toHaveCount(4, { timeout: 15_000 });
  await expect(page.locator('[data-paper-image]')).toHaveCount(4, { timeout: 30_000 });

  await tiles.nth(1).hover();
  const remove = page.getByRole('button', { name: 'Remove page 2' });
  await expect(remove).toBeVisible();
  const box = await remove.boundingBox();
  const cell = await page.locator('li[data-id]').nth(1).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(cell.x);
  expect(box.x + box.width).toBeLessThanOrEqual(cell.x + cell.width);

  const before = await order(page);
  await tiles.nth(0).dragTo(tiles.nth(2));
  await expect.poll(() => order(page)).toEqual([before[1], before[2], before[0], before[3]]);
  await expect(page.locator('[data-page-viewer]')).toHaveCount(0);

  // The pages slide into place after a drop, and a slide carries a page out from under a still pointer.
  for (const cell of await page.locator('li[data-id]').all()) await expect(cell).toHaveCSS('transform', 'none');
  await tiles.nth(1).hover();
  await page.getByRole('button', { name: 'Remove page 2' }).click();
  await expect(tiles).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(tiles).toHaveCount(4);
  await expect.poll(() => order(page)).toEqual([before[1], before[2], before[0], before[3]]);

  await tiles.nth(0).click();
  const viewer = page.locator('[data-page-viewer]');
  await expect(viewer).toBeVisible();
  const shown = await viewer.boundingBox();
  expect(shown.width).toBe(1440);
  expect(shown.height).toBe(900);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-page-heading]')).toHaveText('Page 2 of 4');
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(tiles.nth(1)).toBeFocused();
});
