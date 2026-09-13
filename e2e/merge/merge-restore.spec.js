import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

/* MERGE-13: a merge survives a crash. `useMergeDraft.ts` and
   `MergeDraftPersistence.tsx` were wired into PdfMergeTool.tsx by another
   lane partway through this same wave (they were not yet imported when this
   spec was first drafted); re-run against the rebuilt app confirmed the
   "Draft saved" chip and restore now work, so this is the real guard, not a
   `test.fixme`. Fetches more than one dynamically-served asset across the
   reload, so service workers are blocked (docs/troubleshooting.md).

   Direction A (2026-09-13): the page grid is `ul[class*="grid"]` (not
   `strip`), its cells are `li[data-key]` (unchanged), and there is no
   `[data-tool-shell]` on Merge any more (`hideIdentity`) - the identity
   check below reads the document heading instead, which is what survives a
   restore in its place. */
test.use({ serviceWorkers: 'block' });

async function makePdfBuffer(label) {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  document.addPage([612, 792]);
  document.setTitle(label);
  return Buffer.from(await document.save());
}

test('a file set and a page rotation survive closing and reopening the tab', async ({ page, context }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const files = await Promise.all(['one.pdf', 'two.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);

  const grid = page.locator('ul[class*="grid"]');
  const firstCard = grid.locator('> li[data-key]').first();
  await expect(firstCard).toBeVisible({ timeout: 10_000 });
  await firstCard.hover();
  await firstCard.getByRole('button', { name: /^Rotate page/ }).click({ force: true });
  await expect(firstCard).toHaveAttribute('data-rotation', '90');

  // "Draft saved" renders twice at this (desktop) viewport: the rail's own
  // draft chip (`[class*="draft-chip"]`) and, CSS-hidden but still in the
  // DOM, the phone chip row's twin. Scope to the rail's, which is what is
  // actually on screen here.
  await expect(page.locator('[class*="draft-chip"]', { hasText: 'Draft saved' })).toBeVisible({ timeout: 10_000 });

  const headingBefore = await page.locator('#merge-pages-heading').innerText();

  await page.close();
  const restored = await context.newPage();
  await restored.goto('/merge/');
  await restored.locator('astro-island[client="load"]:not([ssr])').waitFor();

  await expect(restored.locator('ul[class*="file-list"] > li[class*="file-row"]')).toHaveCount(2);
  const restoredGrid = restored.locator('ul[class*="grid"]');
  const restoredFirstCard = restoredGrid.locator('> li[data-key]').first();
  await expect(restoredFirstCard).toHaveAttribute('data-rotation', '90');
  // "Your merged PDF · 2 pages" - the same document heading, not the
  // rotation-carrying card count, so this only proves the restore re-mounted
  // the same shape of document, not that the rotation is unique to it.
  await expect(restored.locator('#merge-pages-heading')).toContainText(headingBefore.split('·')[0].trim());
});
