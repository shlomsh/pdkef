import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// A photo-bearing PDF (a blank page has nothing to download). ARCH-41: on a phone the sticky bar's quiet
// Download is on the first screen; on a desktop the rail's Download element is.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const buffer = fs.readFileSync(path.join(HERE, '..', '__fixtures__', 'mixed.pdf'));

async function loadMixedPdf(page) {
  await page.goto('/compress/');
  await page.locator('astro-island[client="load"]:not([ssr]) [data-empty-state]').first().waitFor();
  await page.locator('[data-empty-state] input[type="file"]').first().setInputFiles({ name: 'mixed.pdf', mimeType: 'application/pdf', buffer });
  await expect(page.locator('[data-compress-status="done"]')).toBeVisible({ timeout: 30_000 });
}

test.describe('phone', () => {
  test.use({ viewport: { width: 393, height: 852 } });

  test('the bar\'s quiet Download is inside the viewport without scrolling', async ({ page }) => {
    await loadMixedPdf(page);
    const button = page.locator('[data-quiet-download]');
    await expect(button).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const box = await button.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(852);
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the Download element is inside the viewport without scrolling', async ({ page }) => {
    await loadMixedPdf(page);
    const element = page.locator('[data-result-action] a[data-state]');
    await expect(element).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const box = await element.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(800);
  });
});
