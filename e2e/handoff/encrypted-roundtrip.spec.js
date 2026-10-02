import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

/* ENC-05: a protected PDF is a precondition, not a failure. Redact shows one quiet state, "Unlock it"
   parks the file as a hand-off and opens /unlock/ with it loaded, and Unlock's "Redact it" hands the
   unlocked file back. It visits two tools' routes, so it lives here and not under a tool folder
   (module-boundaries rule 7). Fixtures: src/lib/__fixtures__/encrypted/ (AES-256, password "u" for
   needs-password; owner-only has an empty user password). */

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

async function chooseInRedact(page, name, buffer) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name, mimeType: 'application/pdf', buffer });
}

test('an owner-only file in Redact goes to Unlock with no prompt and comes back to Redact', async ({ page }) => {
  const reports = watchReports(page);
  await page.addInitScript(() => localStorage.clear());
  await openTool(page, '/redact/');
  await chooseInRedact(page, 'owner-only.pdf', fixture('owner-only'));

  await expect(page.getByText('This PDF is protected')).toBeVisible();
  await expect(page.locator('.redact-draw-area')).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock it' }).click();

  await page.waitForURL(/\/unlock\/?(?:\?.*)?$/);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(page.getByText('No password needed. This takes the protection off.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: /Download Unlocked PDF/ })).toHaveAttribute('href', /^blob:/, { timeout: 10_000 });

  await page.getByRole('button', { name: 'Redact it' }).click();
  await page.waitForURL(/\/redact\/?(?:\?.*)?$/);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(page.locator('.redact-draw-area').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-tool-shell]')).toContainText('owner-only_unlocked.pdf');

  expect(reports.filter((body) => /tool_operation_failed|EncryptedPDFError/.test(body))).toEqual([]);
});

test('a file that needs a password asks for it in Unlock, refuses a wrong one, and returns to Redact', async ({ page }) => {
  const reports = watchReports(page);
  await page.addInitScript(() => localStorage.clear());
  await openTool(page, '/redact/');
  await chooseInRedact(page, 'needs-password.pdf', fixture('needs-password'));

  await expect(page.getByText('This PDF has a password')).toBeVisible();
  await page.getByRole('button', { name: 'Unlock it' }).click();

  await page.waitForURL(/\/unlock\/?(?:\?.*)?$/);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const password = page.getByLabel('PDF password');
  await expect(password).toBeVisible({ timeout: 10_000 });

  await password.fill('not-it');
  await page.getByRole('button', { name: 'Unlock PDF' }).click();
  await expect(page.getByText('The password may be incorrect.')).toBeVisible();

  await password.fill('u');
  await page.getByRole('button', { name: 'Unlock PDF' }).click();
  await expect(page.getByRole('link', { name: /Download Unlocked PDF/ })).toHaveAttribute('href', /^blob:/, { timeout: 10_000 });

  await page.getByRole('button', { name: 'Redact it' }).click();
  await page.waitForURL(/\/redact\/?(?:\?.*)?$/);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(page.locator('.redact-draw-area').first()).toBeVisible({ timeout: 10_000 });

  expect(reports.filter((body) => /EncryptedPDFError/.test(body))).toEqual([]);
});
