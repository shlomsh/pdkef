import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// A phone with a PDF loaded: the primary button must be on the first screen, not 450px below the fold.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const buffer = fs.readFileSync(path.join(HERE, '..', '..', '..', 'lib', '__fixtures__', 'num-1.pdf'));

test.use({ viewport: { width: 393, height: 852 } });

test('the Compress button is inside the viewport without scrolling', async ({ page }) => {
  await page.goto('/compress/');
  await page.locator('astro-island[client="load"]:not([ssr]) [data-empty-state]').first().waitFor();
  await page.locator('[data-empty-state] input[type="file"]').first().setInputFiles({ name: 'num-1.pdf', mimeType: 'application/pdf', buffer });
  await expect(page.getByRole('radiogroup')).toBeVisible();
  const button = page.getByRole('button', { name: /^Compress PDF/ });
  await expect(button).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const box = await button.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(852);
});
