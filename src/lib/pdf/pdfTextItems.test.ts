/**
 * Pins `readTextItems` to draining `streamTextContent()` with a reader, never
 * `getTextContent()` - see the module docstring for why (WebKit bug 194379).
 */
import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pointAtLegacyWorker } from '../../test/support/realPdfjs';
import { readTextItems } from './pdfTextItems.ts';

pointAtLegacyWorker(pdfjs);

// A real PDF with many lines of text, so pdf.js streams its text in more than one chunk.
async function openPage(lines: number) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([600, 4000]);
  for (let i = 0; i < lines; i++) page.drawText(`line ${i}`, { x: 20, y: 3900 - i * 12, size: 10, font });
  const doc = await pdfjs.getDocument({ data: await pdf.save() }).promise;
  return doc.getPage(1);
}

describe('readTextItems', () => {
  it('concatenates items from every chunk in order', async () => {
    const page = await openPage(300);
    // Live control: the stream really gives more than one chunk.
    const reader = page.streamTextContent().getReader();
    let chunks = 0;
    for (let c = await reader.read(); !c.done; c = await reader.read()) chunks += 1;
    expect(chunks).toBeGreaterThan(1);

    const getTextContent = vi.spyOn(page, 'getTextContent');
    const items = (await readTextItems(page)) as { str: string }[];
    const text = items.map((i) => i.str).filter((s) => s.trim());
    expect(text).toEqual(Array.from({ length: 300 }, (_, i) => `line ${i}`));
    expect(getTextContent).not.toHaveBeenCalled();
  });
});
