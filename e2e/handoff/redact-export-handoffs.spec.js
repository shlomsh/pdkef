import { test, expect } from '@playwright/test';
import { waitForIsland } from '../support/tool.js';
import { makePdfBuffer } from '../support/pdf.js';

/* Shlomi 2026-10-21: "Compress it" and "Sign it" show under Redact's finish
   pair as soon as there is something to export. A tap makes the redacted file
   itself (no browser download) and carries it on. */

const makeFixture = () => makePdfBuffer(null, { title: false, lines: [{ text: 'Redact hand-off fixture', gray: null }] });

test('Sign it exports the redacted file without a download and carries it on', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/redact?next=0');
  await waitForIsland(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: 'handoff.pdf', mimeType: 'application/pdf', buffer: await makeFixture() });
  await expect(page.locator('[class*="page-wrapper"]').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compress it' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign it' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Blackout', exact: true }).click();
  const overlay = page.locator('.redact-draw-area').first();
  await overlay.scrollIntoViewIfNeeded();
  const area = await overlay.boundingBox();
  await page.mouse.move(area.x + area.width * 0.3, area.y + area.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * 0.6, area.y + area.height * 0.36, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[class*="redact-box"]')).toHaveCount(1);

  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await expect(page.getByRole('button', { name: 'Compress it' })).toBeVisible();
  const sign = page.getByRole('button', { name: 'Sign it' });
  await expect(sign).toBeVisible();

  await sign.click();
  await page.waitForURL(/\/sign\/$/);
  await expect(page.locator('[class*="page-wrapper"]').first()).toBeVisible();
  await expect(page.getByText(/^redacted_/).first()).toBeVisible();
  expect(downloads).toBe(0);
});
