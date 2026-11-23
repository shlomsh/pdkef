import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import { renderPageToCanvas } from '#lib/pdf/renderPage.js';
import { openPdfSheetReader } from './pdfSheetReader.ts';

vi.mock('#lib/pdf/renderPage.js', { spy: true });

/** A two-page PDF: page 2 is rotated 90 and carries a Hebrew word. */
async function twoPagePdf() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await (await fetch('/fonts/Heebo-Regular.ttf')).arrayBuffer());
  doc.addPage([1000, 500]);
  const second = doc.addPage([1000, 500]);
  second.setRotation(degrees(90));
  second.drawText('שלום', { x: 100, y: 100, size: 40, font });
  return new File([await doc.save()], 'b.pdf', { type: 'application/pdf' });
}

describe('openPdfSheetReader', () => {
  it('counts pages, reads the script, and draws with the page rotation plus the extra turns', async () => {
    const pdf = await twoPagePdf();
    const { getDocument } = await getPdfjs();
    const loadingTask = getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
    await loadingTask.destroy();
    const destroy = vi.spyOn(Object.getPrototypeOf(loadingTask), 'destroy');
    const reader = await openPdfSheetReader(pdf);
    const drawn = () => vi.mocked(renderPageToCanvas).mock.calls.at(-1)!;
    expect(reader.pageCount).toBe(2);
    expect(await reader.rightToLeft(2)).toBe(true);
    expect(await reader.rightToLeft(1)).toBe(null);
    const gray = await reader.grayOf(2, 1000, 1);
    expect(drawn()[1]).toMatchObject({ rotation: 180 });
    expect(drawn()[0].pageNumber).toBe(2);
    expect(drawn()[0].rotate).toBe(90);
    expect(gray.data.length).toBe(gray.width * gray.height);
    const jpeg = await reader.jpegOf(2, 3200, 0, { left: 0, top: 0, right: 0, bottom: 0 });
    expect(jpeg.blob.type).toBe('image/jpeg');
    expect([jpeg.width, jpeg.height]).toEqual([1600, 3200]);
    expect(drawn()[1]).toMatchObject({ rotation: 90 });
    expect(drawn()[0].pageNumber).toBe(2);
    reader.close();
    expect(destroy).toHaveBeenCalled();
    await destroy.mock.results[0].value;
  });
});
