import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

async function makePdfBuffer() {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return Buffer.from(await document.save());
}

test('asks before clearing an active Unlock PDF', async ({ page }) => {
  await page.goto('/unlock');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'reset-confirmation.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(),
  });
  await expect(page.getByText('Set Password', { exact: true })).toBeVisible();

  const startOver = page.getByRole('button', { name: 'Start over', exact: true });
  await startOver.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('This clears the current PDF and password from this tool.');

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('reset-confirmation.pdf', { exact: true })).toBeVisible();

  await startOver.click();
  await dialog.getByRole('button', { name: 'Discard & start over', exact: true }).click();
  await expect(page.getByText('Drop PDF here to unlock', { exact: true })).toBeVisible();
});
