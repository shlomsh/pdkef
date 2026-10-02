import { test, expect } from '@playwright/test';
import { PDFDocument, PDFInvalidObject } from '@cantoo/pdf-lib';

/* DEBT-34: Unlock threw `ReferenceError: Buffer is not defined` in production (reported 2026-10-02,
   action trail add_files, export, download, add_files, export). Our pdf-lib patch called Node's `Buffer`
   for any document holding an object pdf-lib could not parse. Vitest runs on Node, where `Buffer` exists,
   so only a real browser against the built bundle can see it. The failure follows the file, not the run:
   a clean file unlocks, is downloaded, and the next file in the same tab (one with an unparseable object)
   must unlock just as well, and nothing may be reported to the maintenance endpoint. */

const PASSWORD = 'pw';

async function protectedPdf({ unparseableObject }) {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  if (unparseableObject) {
    doc.context.assign(doc.context.nextRef(), PDFInvalidObject.of(new TextEncoder().encode('<< /Foo [ ) >>')));
  }
  doc.encrypt({ userPassword: PASSWORD, ownerPassword: PASSWORD });
  return Buffer.from(await doc.save());
}

const pdf = (name, buffer) => ({ name, mimeType: 'application/pdf', buffer });

async function unlock(page, file, { replace }) {
  const chooser = page.waitForEvent('filechooser');
  if (replace) {
    await page.getByRole('button', { name: 'Replace file' }).click();
    await page.getByRole('button', { name: 'Choose a file' }).click();
  } else {
    await page.getByText('Choose file', { exact: true }).click();
  }
  await (await chooser).setFiles(file);
  await page.getByLabel('PDF password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock PDF' }).click();
}

test('two files unlocked one after the other in one tab, the second holding an unparseable object', async ({ page }) => {
  const reports = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/report')) reports.push(request.postData() || '');
  });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/unlock/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();

  const download = page.getByRole('link', { name: /Download unlocked PDF/i });

  await unlock(page, pdf('clean.pdf', await protectedPdf({ unparseableObject: false })), { replace: false });
  await expect(download).toHaveAttribute('href', /^blob:/, { timeout: 15_000 });
  const saved = page.waitForEvent('download');
  await download.click();
  await saved;

  await unlock(page, pdf('odd.pdf', await protectedPdf({ unparseableObject: true })), { replace: true });
  await expect(download).toHaveAttribute('href', /^blob:/, { timeout: 15_000 });
  await expect(page.getByText(/could not be unlocked/i)).toHaveCount(0);

  expect(reports.filter((body) => /tool_operation_failed|"area":"pdf_tool_run"|ReferenceError/.test(body))).toEqual([]);
});
