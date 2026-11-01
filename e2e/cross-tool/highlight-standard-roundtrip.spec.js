import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFName, PDFArray, PDFDict } from '@cantoo/pdf-lib';
import { openTool } from '../support/tool.js';
import { makePdfBuffer } from '../support/pdf.js';

/* READ-01 R44 to R46: Highlight PDF and Sign share the PDF standard. A reader swipes one body line, downloads,
   and the file carries a standard /Highlight with /QuadPoints that both tools read back as an editable mark.
   jsdom cannot swipe over rendered text or hand back the real downloaded file, so this runs in a browser. */

test.use({ serviceWorkers: 'block' });

const LINE = 'A line of text a student would highlight';

async function openWithBytes(page, route, bytes, overlaySelector) {
  await openTool(page, route, { file: { name: 'standard.pdf', buffer: bytes }, overlaySelector });
}

// Letter page, baseline y=700 of 792 with an 18pt font: the line centre sits near 693pt.
async function swipeTheLine(page) {
  const box = await page.locator('[data-page-overlay]').first().boundingBox();
  const y = box.y + box.height * ((792 - 694) / 792);
  await page.mouse.move(box.x + box.width * (72 / 612), y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (330 / 612), y, { steps: 8 });
  await page.mouse.up();
}

test('a highlight made in Highlight PDF downloads as a standard /Highlight and reopens editable in both tools', async ({ browser }) => {
  const source = await makePdfBuffer(null, { title: false, lines: [{ text: LINE, y: 700 }] });

  // Highlight PDF: swipe one line, one highlight appears.
  const first = await browser.newPage();
  await openWithBytes(first, '/highlight-pdf/', source, '[data-page-overlay]');
  await swipeTheLine(first);
  await expect(first.locator('[data-page-overlay] [data-element-id]')).toHaveCount(1);

  // Download, and read the file back in node.
  const [file] = await Promise.all([
    first.waitForEvent('download'),
    first.getByRole('button', { name: 'Download', exact: true }).first().click(),
  ]);
  const bytes = await readFile(await file.path());
  await first.close();

  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);
  const annots = pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).asArray().map((ref) => pdf.context.lookup(ref, PDFDict));
  const highlights = annots.filter((a) => a.lookup(PDFName.of('Subtype'))?.asString() === '/Highlight');
  expect(highlights, 'one /Highlight annotation on page 1').toHaveLength(1);
  expect(highlights[0].lookup(PDFName.of('QuadPoints'), PDFArray).size()).toBeGreaterThanOrEqual(8);

  // A fresh Highlight PDF page reads it back as an editable mark, not part of the page image.
  const again = await browser.newPage();
  await openWithBytes(again, '/highlight-pdf/', bytes, '[data-page-overlay]');
  await expect(again.locator('[data-page-overlay] [data-element-id]')).toHaveCount(1);
  await again.close();

  // Sign shows the same highlight.
  const sign = await browser.newPage();
  await openWithBytes(sign, '/sign/?next=0', bytes, '[class*="page-overlay"]');
  await expect(sign.locator('[data-editor-element]')).toHaveCount(1);
  await sign.close();
});
