import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

/* ENC-08: a PDF that needs a password is a precondition in Compress too. One quiet state, "Unlock it"
   parks the file as a hand-off and opens /unlock/ with it loaded, and Unlock leads with "Continue in
   Compress", which hands the unlocked file back. Same shape as encrypted-roundtrip.spec.js (Redact); it
   visits two tools' routes, so it lives here (module-boundaries rule 7). Fixtures: src/lib/__fixtures__/
   encrypted/ (AES-256, password "u" for needs-password). */

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

test('a file that needs a password goes to Unlock from Compress and comes back unlocked', async ({ page }) => {
  const reports = watchReports(page);
  await page.addInitScript(() => localStorage.clear());
  await openTool(page, '/compress/');

  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: 'needs-password.pdf', mimeType: 'application/pdf', buffer: fixture('needs-password') });

  await expect(page.getByRole('heading', { name: 'This PDF has a password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compress PDF' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock it' }).click();

  await page.waitForURL(/\/unlock\/?(?:\?.*)?$/);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const password = page.getByLabel('PDF password');
  await expect(password).toBeVisible({ timeout: 10_000 });
  await password.fill('u');
  await page.getByRole('button', { name: 'Unlock PDF' }).click();
  await expect(page.getByRole('link', { name: /Download unlocked PDF/ })).toHaveAttribute('href', /^blob:/, { timeout: 10_000 });

  await page.getByRole('button', { name: 'Continue in Compress' }).click();
  await page.waitForURL(/\/compress\/?(?:\?.*)?$/);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(page.locator('[data-tool-shell]')).toContainText('needs-password_unlocked.pdf', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Compress PDF' })).toBeVisible();

  expect(reports.filter((body) => /EncryptedPDFError/.test(body))).toEqual([]);
});
