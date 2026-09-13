import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

/* MERGE-14: the quiet hand-off row under Download. "Compress it" saves the
   merged blob as a hand-off (draftStore.saveHandoff) and navigates to
   /compress/, which reads it back on mount via useHandoffIntake. Confirmed
   present in this build (both PdfMergeTool.tsx's hand-off controls and
   PdfCompressTool.tsx's useHandoffIntake('compress', ...) call already
   exist), so this is the real guard rather than a test.skip placeholder.

   Direction A (2026-09-13): the row lives in the rail's pinned footer
   (MergeRail.module.css's `.handoff-row`, `.handoff-button`), under the
   Download element, alongside Share (when available) - "Compress it" and
   "Sign it" are BUTTONS (role button), not links; they navigate via
   `navigate()` (window.location.href) after saving the hand-off, just
   without an <a href> to assert against - and "Split it" was dropped
   entirely on Shlomi's decision, so it is not covered here. */

async function makePdfBuffer(label) {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  document.setTitle(label);
  return Buffer.from(await document.save());
}

test('Compress it hands the merged file to Compress with the identity row naming it', async ({ page }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const files = await Promise.all(['first.pdf', 'second.pdf', 'third.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);

  const downloadLink = page.getByRole('link', { name: /Download merged PDF/ });
  await expect(downloadLink).toHaveAttribute('href', /^blob:/, { timeout: 10_000 });

  const compressButton = page.getByRole('button', { name: 'Compress it', exact: true });
  await expect(compressButton).toBeVisible();
  await compressButton.click();

  await page.waitForURL(/\/compress\/?(?:\?.*)?$/);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();

  // "first.pdf" first -> the hand-off's fileName merged_first.pdf, and Compress's identity
  // row (ToolShell) reads it back verbatim as fileLabel.
  await expect(page.locator('[data-tool-shell]')).toContainText('merged_first.pdf', { timeout: 10_000 });
});
