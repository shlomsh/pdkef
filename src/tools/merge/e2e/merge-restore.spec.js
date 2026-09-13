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

  // The rail's draft status line, its own end-aligned row since the
  // 2026-09-13 rail reorder (previously beside Add files / Clear all in
  // `.quiet-row`, before that a `.draft-chip`).
  await expect(page.locator('[class*="draft-status-row"]', { hasText: 'Draft saved' })).toBeVisible({ timeout: 10_000 });

  // MERGE-11 (Shlomi's WYSIWYG rebuild): the heading's name is its own
  // element now (the editable output file name, class `name` since the
  // bordered-input rebuild dropped `name-text`/`name-button`), so this
  // compares that directly rather than slicing the whole heading's innerText
  // on "·" - the heading is a flex row of several elements now, and
  // innerText inserts a line break between flex items.
  const nameBefore = await page.locator('#merge-pages-heading [class*="name"]').first().innerText();

  await page.close();
  const restored = await context.newPage();
  await restored.goto('/merge/');
  await restored.locator('astro-island[client="load"]:not([ssr])').waitFor();

  await expect(restored.locator('ul[class*="file-list"] > li[class*="file-row"]')).toHaveCount(2);
  const restoredGrid = restored.locator('ul[class*="grid"]');
  const restoredFirstCard = restoredGrid.locator('> li[data-key]').first();
  await expect(restoredFirstCard).toHaveAttribute('data-rotation', '90');
  // "merged_one" - the same automatic output name, not the rotation-
  // carrying card count, so this only proves the restore re-mounted the same
  // shape of document, not that the rotation is unique to it.
  await expect(restored.locator('#merge-pages-heading [class*="name"]').first()).toHaveText(nameBefore);
});

test('a renamed output name survives closing and reopening the tab', async ({ page, context }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const files = await Promise.all(['one.pdf', 'two.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);

  const name = page.locator('#merge-pages-heading [class*="name"]').first();
  await expect(name).toBeVisible({ timeout: 10_000 });
  await expect(name).toHaveText('merged_one');

  // Keyboard activation (focus, then Enter) rather than a click: it selects
  // the whole name so typing replaces it outright, the same behaviour the
  // old input gave for free on focus - a click intentionally does NOT do
  // this (see merge-layout.spec.js's caret-placement guard), so a keyboard
  // rename is the reliable, platform-independent way to replace the whole
  // name in one go (a real click can be simulated too, but "select all
  // then type" is a keyboard binding whose OS mapping is not the same
  // Control+A everywhere - macOS Chromium binds it to "move to line start"
  // in a text field, not select-all).
  await name.focus();
  await page.keyboard.press('Enter');
  await expect(name).toHaveAttribute('contenteditable', /plaintext-only|true/);
  await page.keyboard.type('March invoices');
  await page.keyboard.press('Enter');
  await expect(name).toHaveAttribute('contenteditable', 'false');
  await expect(name).toHaveText('March invoices');

  await expect(page.locator('[class*="draft-status-row"]', { hasText: 'Draft saved' })).toBeVisible({ timeout: 10_000 });

  await page.close();
  const restored = await context.newPage();
  await restored.goto('/merge/');
  await restored.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const restoredName = restored.locator('#merge-pages-heading [class*="name"]').first();
  await expect(restoredName).toHaveText('March invoices');
  const downloadLink = restored.getByRole('link', { name: /Download merged PDF/ });
  await expect(downloadLink).toHaveAttribute('download', 'March invoices.pdf', { timeout: 10_000 });
});

/* MERGE-11: below 768px the name wraps onto a second line rather than
   truncating with an ellipsis - a real layout fact, jsdom cannot lay out
   text at all. */
test('a long output name wraps at 375px instead of truncating', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const files = await Promise.all(['A rather long invoice file name for the wrap check.pdf', 'second.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);

  const name = page.locator('#merge-pages-heading [class*="name"]').first();
  await expect(name).toBeVisible({ timeout: 10_000 });
  const lineCount = await name.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getClientRects().length;
  });
  expect(lineCount).toBeGreaterThan(1);
  await expect(name).toHaveCSS('white-space', 'normal');
});
