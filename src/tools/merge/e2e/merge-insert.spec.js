import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

/* Direction A (2026-09-13): MERGE-07's insertion line still paints, on the
   rail's file rows, at 1024px and up. The rail's file list is now a plain
   `<ul>` (MergeRail.module.css's `.file-list`) of `<li class="file-row"
   data-id>` rows, not the old `ul[class*="file-list"]` from before the
   rail existed as its own surface - same class name, new context (a 320px
   sticky rail beside the document, not a full-width card). The window-level
   `dragover`/`drop` handling in PdfMergeTool.tsx that paints
   `data-insert-before` is unchanged. Synthesized here with an in-page
   DataTransfer per docs/troubleshooting.md's drag-and-drop guidance. */

async function makePdfBuffer(label) {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  document.setTitle(label);
  return Buffer.from(await document.save());
}

function rows(page) {
  return page.locator('ul[class*="file-list"] > li[class*="file-row"]');
}

test('a file dropped between two rail rows inserts there, with an insertion line first', async ({ page }) => {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();

  const files = await Promise.all(['a.pdf', 'b.pdf', 'c.pdf'].map(async (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(name),
  })));
  await page.locator('input[type="file"]').setInputFiles(files);
  await expect(rows(page)).toHaveCount(3);

  const row1Box = await rows(page).nth(0).boundingBox();
  const row2Box = await rows(page).nth(1).boundingBox();
  if (!row1Box || !row2Box) throw new Error('File rows have no bounding box');
  // Just inside row 2's top: past row 1's own midpoint threshold, still
  // within row 2's - the boundary between rows 1 and 2.
  const clientX = row2Box.x + row2Box.width / 2;
  const clientY = row2Box.y + 1;

  const buffer = await makePdfBuffer('d.pdf');
  const base64 = buffer.toString('base64');
  const dataTransfer = await page.evaluateHandle(async (b64) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], 'd.pdf', { type: 'application/pdf' });
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt;
  }, base64);

  await page.dispatchEvent('#app > astro-island > div', 'dragover', {
    dataTransfer,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
  });

  // Row 2 (originally b.pdf) is where the insertion would land.
  await expect(rows(page).nth(1)).toHaveAttribute('data-insert-before', '');

  await page.dispatchEvent('#app > astro-island > div', 'drop', {
    dataTransfer,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
  });

  await expect(rows(page)).toHaveCount(4);
  // d.pdf is now row 2: [a, d, b, c].
  await expect(rows(page).nth(1)).toContainText('d.pdf');
  await expect(rows(page).nth(0)).toContainText('a.pdf');
  await expect(rows(page).nth(2)).toContainText('b.pdf');
  await expect(rows(page).nth(3)).toContainText('c.pdf');
});
