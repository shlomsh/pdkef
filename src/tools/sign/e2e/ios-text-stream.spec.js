import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * Field detection must not depend on async iteration of a ReadableStream.
 *
 * pdf.js `getTextContent()` ends in `for await (const value of readableStream)`,
 * and iOS Safari has no async iterator on ReadableStream (WebKit bug 194379), so
 * on 2026-09-20 Sign found zero fields on every iPhone. The fix drains the stream
 * with a reader instead (readTextItems in src/lib/pdfTextItems.ts, commit
 * 3840457a). Playwright's WebKit build DOES have the feature, so no local test
 * ever reproduced it; this guard deletes it in an init script to match iOS.
 *
 * See backlog/tasks/DEBT-27.md and src/lib/pdfTextItems.ts.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const PRACTICE_FORM = path.resolve(here, '..', '..', '..', '..', 'public', 'images', 'redaction-guide', 'sample.pdf');

test.skip(({ browserName }) => browserName !== 'webkit', 'guards an iOS Safari (WebKit) missing feature');

test('field detection finds fields when ReadableStream has no async iteration (iOS, 2026-09-20)', async ({ page }) => {
  await page.addInitScript(() => {
    delete ReadableStream.prototype[Symbol.asyncIterator];
    delete ReadableStream.prototype.values;
  });
  await page.goto('/sign/?next=1');
  expect(await page.evaluate(() => typeof ReadableStream.prototype[Symbol.asyncIterator])).toBe('undefined');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({
    name: 'practice-form.pdf',
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(PRACTICE_FORM),
  });
  await expect(page.locator('[data-fill-input]').first()).toBeVisible();
  expect(await page.locator('[data-fill-input]').count()).toBeGreaterThan(0);
});
