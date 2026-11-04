import { describe, expect, it, vi } from 'vitest';

const page = { rotate: 90, getViewport: ({ rotation }: { rotation: number }) => ({ width: rotation % 180 ? 500 : 1000, height: rotation % 180 ? 1000 : 500 }),
  getTextContent: async () => ({ items: [{ str: 'שלום' }, { type: 'beginMarkedContent' }] }) };
const destroy = vi.fn(async () => {});
const render = vi.fn(async (_page: unknown, { scale, rotation }: { scale: number; rotation: number }) => ({
  width: Math.round(1000 * scale), height: 10, rotation,
  getContext: () => ({ getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(200) }) }),
  toBlob: (cb: (b: Blob) => void) => cb(new Blob(['j'], { type: 'image/jpeg' })),
}));
vi.mock('#lib/pdf/loadPdfjs.js', () => ({ getPdfjs: async () => ({ getDocument: () => ({ promise: Promise.resolve({ numPages: 2, getPage: async () => page }), destroy }) }) }));
vi.mock('#lib/pdf/renderPage.js', () => ({ renderPageToCanvas: render }));

describe('openPdfSheetReader', () => {
  it('counts pages, reads the script, and draws with the page rotation plus the extra turns', async () => {
    const { openPdfSheetReader } = await import('./pdfSheetReader.ts');
    const reader = await openPdfSheetReader(new File(['%PDF'], 'b.pdf'));
    expect(reader.pageCount).toBe(2);
    expect(await reader.rightToLeft(1)).toBe(true);
    const gray = await reader.grayOf(1, 1000, 1);
    expect(render).toHaveBeenLastCalledWith(page, expect.objectContaining({ rotation: 180 }));
    expect(gray.data.length).toBe(gray.width * gray.height);
    const jpeg = await reader.jpegOf(1, 3200, 0);
    expect(jpeg.blob.type).toBe('image/jpeg');
    reader.close();
    expect(destroy).toHaveBeenCalled();
  });
});
