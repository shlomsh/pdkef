import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { imagesToPdf, UnsupportedImageError } from './imageToPdf.js';

// A real, valid 1x1 transparent PNG (67 bytes).
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function pngFile(name = 'pixel.png') {
  const bytes = Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: 'image/png' });
}

describe('imagesToPdf', () => {
  it('creates one page per image, sized to the image dimensions', async () => {
    const blob = await imagesToPdf([pngFile('a.png'), pngFile('b.png')]);
    const pdf = await PDFDocument.load(await blob.arrayBuffer());
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getWidth()).toBe(1);
    expect(pdf.getPage(0).getHeight()).toBe(1);
  });

  it('reports progress as each image is processed', async () => {
    const calls = [];
    await imagesToPdf([pngFile('a.png'), pngFile('b.png')], (p) => calls.push(p));
    expect(calls).toEqual([0.5, 1]);
  });

  it('rejects unsupported file types', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'doc.gif', { type: 'image/gif' });
    await expect(imagesToPdf([file])).rejects.toBeInstanceOf(UnsupportedImageError);
  });
});
