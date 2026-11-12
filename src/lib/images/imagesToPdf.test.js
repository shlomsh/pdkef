import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { imagesToPdf, UnsupportedImageError } from './imagesToPdf.js';
import { redrawPng } from './pngRedraw.ts';

vi.mock('./pngRedraw.ts', () => ({ redrawPng: vi.fn() }));

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

  it('takes an untyped .png by its extension', async () => {
    const bytes = Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0));
    const blob = await imagesToPdf([new File([bytes], 'photo.png')]);
    const doc = await PDFDocument.load(await blob.arrayBuffer());
    expect(doc.getPageCount()).toBe(1);
  });

  it('stops with an AbortError when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(imagesToPdf([pngFile('a.png')], undefined, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('stops between images when the signal aborts mid-run', async () => {
    const controller = new AbortController();
    const calls = [];
    const run = imagesToPdf([pngFile('a.png'), pngFile('b.png'), pngFile('c.png')], (p) => {
      calls.push(p);
      controller.abort();
    }, controller.signal);
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(1);
  });

  describe('a damaged PNG (DEBT-75)', () => {
    // The 40x80 photo-2.png with its compressed data cut in half: pdf-lib throws "unexpected EOF" on it.
    const TRUNCATED_PNG_BASE64 =
      'iVBORw0KGgoAAAANSUhEUgAAACgAAABQCAIAAADk7aCWAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAANUlEQVRoge3YwQkAIBADQXtKT6k2RVmGDwf8C6IOtyfdk3VsXEcdl2ueU30g8WUOEsXisFgsBovDYvqGJhEAAAAASUVORK5CYII=';
    const fixtureFile = (name) => new File([Uint8Array.from(atob(TRUNCATED_PNG_BASE64), (c) => c.charCodeAt(0))], name, { type: 'image/png' });
    const goodPng = () => Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0));
    beforeEach(() => { vi.mocked(redrawPng).mockReset(); });

    it('still builds the PDF with every picture when the browser can redraw it', async () => {
      vi.mocked(redrawPng).mockResolvedValue(goodPng());
      const blob = await imagesToPdf([pngFile('a.png'), fixtureFile('photo-truncated.png'), pngFile('c.png')]);
      const pdf = await PDFDocument.load(await blob.arrayBuffer());
      expect(pdf.getPageCount()).toBe(3);
    });

    it('throws UnreadableImageError when every picture is left out, rather than saving a PDF with no pages', async () => {
      vi.mocked(redrawPng).mockImplementation(async () => { throw new Error('The source image could not be decoded.'); });
      await expect(imagesToPdf([fixtureFile('photo-truncated.png')])).rejects.toMatchObject({ name: 'UnreadableImageError', fileName: 'photo-truncated.png' });
    });

    it('leaves out a picture the browser cannot read either, names it, and builds from the rest', async () => {
      vi.mocked(redrawPng).mockImplementation(async () => { throw new Error('The source image could not be decoded.'); });
      const skipped = [];
      const progress = [];
      const blob = await imagesToPdf([pngFile('a.png'), fixtureFile('photo-truncated.png'), pngFile('c.png')], (p) => progress.push(p), undefined, {
        onSkip: (name) => skipped.push(name),
      });
      const pdf = await PDFDocument.load(await blob.arrayBuffer());
      expect(pdf.getPageCount()).toBe(2);
      expect(skipped).toEqual(['photo-truncated.png']);
      expect(progress.at(-1)).toBe(1);
    });
  });
});
