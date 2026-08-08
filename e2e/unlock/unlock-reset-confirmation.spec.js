import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

async function makePdfBuffer() {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return Buffer.from(await document.save());
}

// Unlock used to show two controls that both meant "give me a different file":
// Start over above the form and Start over again under the result. There is one
// now, Replace file, and it still has to ask before it throws anything away.
test('asks before a replacement discards the Unlock password', async ({ page }) => {
  await page.goto('/unlock');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'reset-confirmation.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(),
  });
  await expect(page.getByText('Set Password', { exact: true })).toBeVisible();
  await page.locator('#security-password').fill('hunter2');

  // Scoped to the identity line: the confirmation quotes both filenames too, so
  // an unscoped text match is ambiguous while the dialog is in the DOM.
  const identity = page.locator('[class*="_identity_"]');
  const replace = page.getByRole('button', { name: 'Replace file', exact: true });
  const chooseReplacement = async () => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await replace.click();
    await (await fileChooserPromise).setFiles({
      name: 'replacement.pdf',
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(),
    });
  };

  await chooseReplacement();

  const dialog = page.getByRole('dialog', { name: 'Replace this file?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('discards the password you entered');
  await expect(dialog).toContainText('replacement.pdf');

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(identity).toContainText('reset-confirmation.pdf');
  await expect(page.locator('#security-password')).toHaveValue('hunter2');

  await chooseReplacement();
  await dialog.getByRole('button', { name: 'Replace file', exact: true }).click();
  await expect(identity).toContainText('replacement.pdf');
  await expect(page.locator('#security-password')).toHaveValue('');
});
