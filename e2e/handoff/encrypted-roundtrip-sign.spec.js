import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

/* ENC-07: the same detour as encrypted-roundtrip.spec.js, from Sign. A protected PDF is a precondition,
   not a failure: Sign shows one quiet state, "Unlock it" opens /unlock/ with the file, and Unlock leads
   with "Continue in Sign", which hands the unlocked file back. It visits two tools' routes, so it lives
   here and not under a tool folder (module-boundaries rule 7). Fixture: src/lib/__fixtures__/encrypted/. */

const fixture = (name) => readFileSync(new URL(`../../src/lib/__fixtures__/encrypted/${name}.pdf`, import.meta.url));

// Anything the page tells the maintenance endpoint: a failed-operation count or an error report is
// exactly what a protected file used to cause.
function watchReports(page) {
  const sent = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/report')) sent.push(request.postData() || '');
  });
  return sent;
}

async function openTool(page, path) {
  await page.goto(path);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
}

test('an owner-only file in Sign goes to Unlock with no prompt and comes back to Sign', async ({ page }) => {
  const reports = watchReports(page);
  await page.addInitScript(() => localStorage.clear());
  await openTool(page, '/sign/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: 'owner-only.pdf', mimeType: 'application/pdf', buffer: fixture('owner-only') });

  await expect(page.getByRole('heading', { name: 'This PDF is protected' })).toBeVisible();
  await expect(page.locator('[class*="page-overlay"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock it' }).click();

  await page.waitForURL(/\/unlock\/?(?:\?.*)?$/);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(page.getByText('No password needed. The protection is off.')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Continue in Sign' }).click();
  await page.waitForURL(/\/sign\/?(?:\?.*)?$/);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(page.locator('[class*="page-overlay"]').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-tool-shell]')).toContainText('owner-only_unlocked.pdf');

  expect(reports.filter((body) => /tool_operation_failed|EncryptedPDFError/.test(body))).toEqual([]);
});
