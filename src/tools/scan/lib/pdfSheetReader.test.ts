import { describe, expect, it, vi, type MockInstance } from 'vitest';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'node:fs';
import type { PDFPageProxy } from 'pdfjs-dist';

// EDGE: drawing a page needs a canvas with real pixels, which node and jsdom do not have. The spy lets
// everything else run for real; only the painted canvas is supplied (forced, below).
vi.mock('#lib/pdf/renderPage.js', { spy: true });
import { renderPageToCanvas } from '#lib/pdf/renderPage.js';

// EDGE: the shipped loader points pdf.js at a browser Worker, which node does not have. Forced: the
// same pdf.js, its node (legacy) build, so the PDF is still parsed and read for real.
vi.mock('#lib/pdf/loadPdfjs.js', { spy: true });
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';

/** A two-page PDF: page 2 is rotated 90 and carries a Hebrew word. */
async function twoPagePdf(): Promise<File> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFileSync('public/fonts/Heebo-Regular.ttf'));
  doc.addPage([1000, 500]);
  const second = doc.addPage([1000, 500]);
  second.setRotation(degrees(90));
  second.drawText('שלום', { x: 100, y: 100, size: 40, font });
  return new File([await doc.save()], 'b.pdf', { type: 'application/pdf' });
}

describe('openPdfSheetReader', () => {
  it('counts pages, reads the script, and draws with the page rotation plus the extra turns', async () => {
    const legacy = await import('pdfjs-dist/legacy/build/pdf.mjs');
    let destroy: MockInstance | undefined;
    vi.mocked(getPdfjs).mockResolvedValue({
      ...legacy,
      getDocument: (...args: Parameters<typeof legacy.getDocument>) => {
        const task = legacy.getDocument(...args);
        destroy = vi.spyOn(task, 'destroy');
        return task;
      },
    } as never);
    const drawn: Array<{ page: PDFPageProxy; scale: number; rotation: number }> = [];
    vi.mocked(renderPageToCanvas).mockImplementation(async (page, { scale, rotation }) => {
      drawn.push({ page, scale, rotation: rotation ?? 0 });
      return {
        width: Math.round(1000 * scale), height: 10,
        getContext: () => ({ getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(200) }) }),
        toBlob: (cb: (b: Blob) => void) => cb(new Blob(['j'], { type: 'image/jpeg' })),
      } as unknown as HTMLCanvasElement;
    });
    const { openPdfSheetReader } = await import('./pdfSheetReader.ts');
    const reader = await openPdfSheetReader(await twoPagePdf());
    expect(reader.pageCount).toBe(2);
    expect(await reader.rightToLeft(2)).toBe(true);
    expect(await reader.rightToLeft(1)).toBe(null);
    const gray = await reader.grayOf(2, 1000, 1);
    expect(drawn.at(-1)).toMatchObject({ rotation: 180 });
    expect(drawn.at(-1)?.page.pageNumber).toBe(2);
    expect(drawn.at(-1)?.page.rotate).toBe(90);
    expect(gray.data.length).toBe(gray.width * gray.height);
    const jpeg = await reader.jpegOf(2, 3200, 0, { left: 0, top: 0, right: 0, bottom: 0 });
    expect(jpeg.blob.type).toBe('image/jpeg');
    expect(drawn.at(-1)).toMatchObject({ rotation: 90 });
    expect(drawn.at(-1)?.page.pageNumber).toBe(2);
    reader.close();
    expect(destroy).toHaveBeenCalled();
  });
});
