import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { addImagePage } from '#lib/images/imagePage.js';
import { imagesToPdf } from '#lib/images/imagesToPdf.js';
import { mergePdfs } from '../../tools/merge/lib/merge.js';
import numTwoUrl from '#lib/__fixtures__/num-2.pdf?url';
import photoTwoUrl from '#lib/__fixtures__/photo-2.png?url';
import truncatedUrl from '#lib/__fixtures__/photo-truncated.png?url';

// DEBT-75: pdf-lib's PNG decoder throws on a file cut short that the browser still shows, so the page
// is built from a redraw through the browser's own decoder. Node and jsdom have no image decoder.
const bytesOf = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());
const fileOf = (bytes: Uint8Array, name: string) => new File([bytes as BlobPart], name, { type: 'image/png' });

// A PNG signature and nothing a decoder can read: pdf-lib throws on it and so does the browser.
const unreadableBytes = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);

describe('a PNG pdf-lib cannot decode, in a real browser', () => {
  it('is redrawn and takes its page when the browser can read it, and is named and left out when it cannot, in Image to PDF, Merge and addImagePage', async () => {
    const cut = await bytesOf(truncatedUrl);
    const good = await bytesOf(photoTwoUrl);

    const doc = await PDFDocument.create();
    await expect(addImagePage(doc, cut, 'image/png', 'cut.png').then((page) => page.getSize())).resolves.toEqual({ width: 40, height: 80 });
    expect(doc.getPageCount()).toBe(1);

    const pages = async (blob: Promise<Blob>) => (await PDFDocument.load(await (await blob).arrayBuffer())).getPages().map((p) => p.getSize());
    await expect(pages(imagesToPdf([fileOf(good, 'a.png'), fileOf(cut, 'photo-truncated.png'), fileOf(good, 'c.png')]))).resolves.toEqual([
      { width: 40, height: 80 },
      { width: 40, height: 80 },
      { width: 40, height: 80 },
    ]);

    const pdf = new File([await bytesOf(numTwoUrl)], 'num-2.pdf', { type: 'application/pdf' });
    await expect(pages(mergePdfs([pdf, fileOf(cut, 'photo-truncated.png')]))).resolves.toHaveLength(2);

    // the browser cannot decode this one either
    const unreadableDoc = await PDFDocument.create();
    await expect(addImagePage(unreadableDoc, unreadableBytes(), 'image/png', 'cut.png')).rejects.toMatchObject({
      name: 'UnreadableImageError',
      fileName: 'cut.png',
    });
    expect(unreadableDoc.getPageCount(), 'unreadable: no page added').toBe(0);

    const skipped: string[] = [];
    const progress: number[] = [];
    const blob = await imagesToPdf(
      [fileOf(good, 'a.png'), fileOf(unreadableBytes(), 'photo-truncated.png'), fileOf(good, 'c.png')],
      (p) => progress.push(p),
      undefined,
      { onSkip: (name: string) => skipped.push(name) },
    );
    expect((await PDFDocument.load(await blob.arrayBuffer())).getPageCount()).toBe(2);
    expect(skipped).toEqual(['photo-truncated.png']);
    expect(progress.at(-1)).toBe(1);

    await expect(imagesToPdf([fileOf(unreadableBytes(), 'photo-truncated.png')])).rejects.toMatchObject({
      name: 'UnreadableImageError',
      fileName: 'photo-truncated.png',
    });

    await expect(mergePdfs([pdf, fileOf(unreadableBytes(), 'photo-truncated.png')])).rejects.toMatchObject({
      name: 'MergeFileError',
      fileIndex: 1,
      reason: 'unreadable',
    });
  });
});
