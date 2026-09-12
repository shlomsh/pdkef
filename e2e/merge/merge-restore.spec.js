import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

/* MERGE-13: a merge survives a crash. `useMergeDraft.ts` and
   `MergeDraftPersistence.tsx` were wired into PdfMergeTool.tsx by another
   lane partway through this same wave (they were not yet imported when this
   spec was first drafted); re-run against the rebuilt app confirmed the
   "Draft saved" chip and restore now work, so this is the real guard, not a
   `test.fixme`. Fetches more than one dynamically-served asset across the
   reload, so service workers are blocked (docs/troubleshooting.md). */
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

  const strip = page.locator('ul[class*="strip"]');
  const firstCard = strip.locator('> li[data-key]').first();
  await expect(firstCard).toBeVisible({ timeout: 10_000 });
  await firstCard.hover();
  await firstCard.getByRole('button', { name: /^Rotate page/ }).click({ force: true });
  await expect(firstCard).toHaveAttribute('data-rotation', '90');

  await expect(page.getByText('Draft saved', { exact: true })).toBeVisible({ timeout: 10_000 });

  const identityBefore = await page.locator('[data-tool-shell]').innerText();

  await page.close();
  const restored = await context.newPage();
  await restored.goto('/merge/');
  await restored.locator('astro-island[client="load"]:not([ssr])').waitFor();

  await expect(restored.locator('ul[class*="file-list"] > li')).toHaveCount(2);
  const restoredStrip = restored.locator('ul[class*="strip"]');
  const restoredFirstCard = restoredStrip.locator('> li[data-key]').first();
  await expect(restoredFirstCard).toHaveAttribute('data-rotation', '90');
  await expect(restored.locator('[data-tool-shell]')).toContainText(identityBefore.split('\n')[0]);
});
