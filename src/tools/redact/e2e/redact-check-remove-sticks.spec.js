import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { PDFDocument, PDFName, PDFString, StandardFonts } from '@cantoo/pdf-lib';

// RED-60: "Remove it" in the saved-file check rewrites the saved copy, but the
// next Download is made again from the original file and the work in the
// editor, so a removal has to be part of that work or it comes back. Only a
// browser runs the whole chain (real export, real check, real removal, real
// second export), so this is the one guard for it. The comment is the kind
// RED-59's "every download drops document details and attachments" does not
// cover; the attachment is the case seen on 2026-10-08.

const NOTE = 'note-secret-777';
const ATTACHMENT = 'original-unredacted.pdf';

async function makeFixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('KEEP ME', { x: 40, y: 320, size: 20, font });
  page.drawText('SECRET 123', { x: 40, y: 80, size: 20, font });
  page.node.addAnnot(doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Text', Rect: [250, 360, 270, 380], Contents: PDFString.of(NOTE),
  })));
  await doc.attach(new TextEncoder().encode('%PDF-1.7 the unredacted original'), ATTACHMENT, { mimeType: 'application/pdf' });
  return Buffer.from(await doc.save());
}

async function savedPdf(download) {
  const savedPath = await download.path();
  if (!savedPath) throw new Error('Playwright did not retain the downloaded PDF');
  return PDFDocument.load(fs.readFileSync(savedPath), { updateMetadata: false });
}
const hasNote = (doc) => {
  const annots = doc.getPage(0).node.Annots();
  return !!annots && annots.asArray().some((ref) => doc.context.lookup(ref).lookup(PDFName.of('Contents'))?.decodeText?.() === NOTE);
};
const hasAttachment = (doc) => {
  const names = doc.catalog.lookup(PDFName.of('Names'));
  return !!names?.lookup(PDFName.of('EmbeddedFiles'));
};

test('a place removed from the saved file stays removed on the next Download', async ({ page }) => {
  await page.goto('/redact');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: 'remove-sticks.pdf', mimeType: 'application/pdf', buffer: await makeFixture() });
  await expect(page.locator('[class*="page-wrapper"]').first()).toBeVisible();

  const toolbar = page.getByRole('toolbar', { name: 'PDF redaction' });
  await toolbar.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.locator('[class*="delete-candidate"][title*="SECRET 123"]').click();
  const download = () => toolbar.getByRole('button', { name: 'Download', exact: true }).click();

  const [first] = await Promise.all([page.waitForEvent('download'), download()]);
  const firstDoc = await savedPdf(first);
  expect(hasNote(firstDoc), 'the first download still carries the comment').toBe(true);
  // RED-59: every export drops attached files unless the person keeps one.
  expect(hasAttachment(firstDoc), 'the first download carries an attachment nobody kept').toBe(false);

  const check = page.locator('[data-saved-file-check]');
  const removeVia = async (term) => {
    await check.getByLabel('Look for something else in the saved file').fill(term);
    await check.getByRole('button', { name: 'Search', exact: true }).click();
    const [removed] = await Promise.all([
      page.waitForEvent('download'),
      check.locator(`[data-check-term="${term}"]`).getByRole('button', { name: 'Remove it', exact: true }).click(),
    ]);
    await expect(check.locator('[data-check-removed]')).toContainText('Saved again and downloaded.');
    return savedPdf(removed);
  };

  const afterNote = await removeVia(NOTE);
  expect(hasNote(afterNote), 'Remove it took the comment out').toBe(false);

  const [again] = await Promise.all([page.waitForEvent('download'), download()]);
  const againDoc = await savedPdf(again);
  expect.soft(hasNote(againDoc), 'the removed comment came back on the next Download').toBe(false);
  expect.soft(hasAttachment(againDoc), 'an attachment came back on the next Download').toBe(false);

  // RED-60: the removal is part of the saved work, so it survives a reload too.
  await expect(page.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(page.getByText('1 deletion').first()).toBeVisible({ timeout: 10_000 });
  const [afterReload] = await Promise.all([page.waitForEvent('download'), download()]);
  const reloadedDoc = await savedPdf(afterReload);
  expect(hasNote(reloadedDoc), 'the removed comment came back after a reload').toBe(false);
});
