import { test } from '@playwright/test';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';
import { waitForIsland } from '../../../../e2e/support/tool.js';
import { expectControlsSized } from '../../../../e2e/support/layout.js';

// Scan's option rows on the phone, whose cells are the narrowest of any tool. A cell takes its taps across the whole
// track, which only a hit test can see; the other tools' check is e2e/cross-tool/option-row.spec.js.

test('every option on the phone takes a tap across its 44px track', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/scan-to-pdf/');
  await waitForIsland(page);
  await page.locator('input[type=file]:not([capture])').first().setInputFiles({
    name: 'sample.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer('Option row', { pages: 1 }),
  });
  await page.getByRole('radiogroup', { name: 'Size limit' }).waitFor({ timeout: 30_000 });
  await page.locator('[data-page-size]').click();
  await page.getByRole('radiogroup', { name: 'Page size' }).waitFor();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 640 });
    await expectControlsSized(page.locator('main'), { selector: '[role="radio"]', minWidth: 44, minHeight: 44, hitArea: true });
  }
});
