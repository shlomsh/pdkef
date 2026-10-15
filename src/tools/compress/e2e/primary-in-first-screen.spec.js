import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// A photo-bearing PDF (a blank page has nothing to download) on a phone: the Download link must be on the first screen, not 450px below the fold.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const buffer = fs.readFileSync(path.join(HERE, '..', '__fixtures__', 'mixed.pdf'));

test.use({ viewport: { width: 393, height: 852 } });

test('the Download link is inside the viewport without scrolling', async ({ page }) => {
  await page.goto('/compress/');
  await page.locator('astro-island[client="load"]:not([ssr]) [data-empty-state]').first().waitFor();
  await page.locator('[data-empty-state] input[type="file"]').first().setInputFiles({ name: 'mixed.pdf', mimeType: 'application/pdf', buffer });
  await expect(page.locator('[data-compress-status="done"]')).toBeVisible({ timeout: 30_000 });
  const button = page.getByRole('link', { name: /^Download Compressed PDF/ });
  await expect(button).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const box = await button.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(852);
});
