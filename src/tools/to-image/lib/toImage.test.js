import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import '../../../test/support/realPdfjs.ts';
import { convertPdfToImages } from './toImage.js';

describe('convertPdfToImages library integration with real fixtures', () => {
  function getFixtureFile(name) {
    const filePath = path.resolve(__dirname, '../../../lib/__fixtures__', name);
    const buffer = fs.readFileSync(filePath);
    return new File([buffer], name, { type: 'application/pdf' });
  }

  it('converts single page num-4.pdf into 1 image blob', async () => {
    const file = getFixtureFile('num-4.pdf');
    const images = await convertPdfToImages(file, { format: 'image/png' });

    expect(images.length).toBe(1);
    expect(images[0].pageNumber).toBe(1);
    expect(images[0].blob).toBeInstanceOf(Blob);
    expect(images[0].filename).toBe('num-4.png');
  });

  it('converts 5-page num-5.pdf into 5 image blobs', async () => {
    const file = getFixtureFile('num-5.pdf');
    const images = await convertPdfToImages(file, { format: 'image/jpeg', layout: 'separate' });

    expect(images.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(images[i].pageNumber).toBe(i + 1);
      expect(images[i].blob).toBeInstanceOf(Blob);
      expect(images[i].filename).toBe(`num-5-page-${i + 1}.jpg`);
    }
  });

  it('concatenates 5-page num-5.pdf into a single image blob', async () => {
    const file = getFixtureFile('num-5.pdf');
    const images = await convertPdfToImages(file, { format: 'image/png', layout: 'concatenated' });

    expect(images.length).toBe(1);
    expect(images[0].pageNumber).toBe(1);
    expect(images[0].blob).toBeInstanceOf(Blob);
    expect(images[0].filename).toBe('num-5.png');
  });

  // DEBT-23: parsePageSelector is shared with Split now, so PDF to Image
  // accepts the same open-ended ranges Split always did.
  it('accepts an open-ended end range like "3-" (page 3 to the end)', async () => {
    const file = getFixtureFile('num-5.pdf');
    const images = await convertPdfToImages(file, { format: 'image/png', pages: '3-' });

    expect(images.map((image) => image.pageNumber)).toEqual([3, 4, 5]);
  });

  it('accepts an open-ended start range like "-2" (the start through page 2)', async () => {
    const file = getFixtureFile('num-5.pdf');
    const images = await convertPdfToImages(file, { format: 'image/png', pages: '-2' });

    expect(images.map((image) => image.pageNumber)).toEqual([1, 2]);
  });

  it('encodes each page right after rendering it and drops its canvas before the next', async () => {
    const file = getFixtureFile('num-5.pdf');
    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
    const setWidth = vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set');
    try {
      const images = await convertPdfToImages(file, { format: 'image/png', layout: 'separate' });
      expect(images.map((image) => image.pageNumber)).toEqual([1, 2, 3, 4, 5]);
      const seen = encode.mock.contexts;
      expect(seen.length).toBe(5);
      expect(new Set(seen).size).toBe(5);
      // Before each canvas is encoded, every earlier one has already been shrunk to nothing.
      encode.mock.invocationCallOrder.forEach((encodedAt, index) => {
        seen.slice(0, index).forEach((earlier) => {
          const shrunkAt = setWidth.mock.calls.flatMap((call, at) => (setWidth.mock.contexts[at] === earlier && call[0] === 0 ? [setWidth.mock.invocationCallOrder[at]] : []));
          expect(shrunkAt.length).toBeGreaterThan(0);
          expect(Math.min(...shrunkAt)).toBeLessThan(encodedAt);
        });
      });
      expect(seen[0].width).toBe(0);
    } finally {
      encode.mockRestore();
      setWidth.mockRestore();
    }
  });

  it('stops between pages with an AbortError when its signal fires', async () => {
    const file = getFixtureFile('num-5.pdf');
    const controller = new AbortController();
    const run = convertPdfToImages(file, {
      format: 'image/png',
      signal: controller.signal,
      onProgress: (value) => { if (value >= 2 / 5) controller.abort(); },
    });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  });

  // GRID-06: a page turned in the grid is exported turned, on top of any turn the file already has.
  describe('rotation', () => {
    async function pagedFile(rotate, count = 1) {
      const doc = await PDFDocument.create();
      for (let i = 0; i < count; i += 1) {
        const page = doc.addPage([100, 200]);
        if (rotate) page.setRotation(degrees(rotate));
      }
      return new File([await doc.save()], 'turned.pdf', { type: 'application/pdf' });
    }

    // The size of each image made, read from its PNG header.
    async function sizesOf(file, options) {
      const images = await convertPdfToImages(file, { scale: 1, format: 'image/png', ...options });
      return Promise.all(images.map(async ({ blob }) => {
        const header = new DataView(await blob.arrayBuffer());
        return [header.getUint32(16), header.getUint32(20)];
      }));
    }

    it('leaves a page as it is without a rotation', async () => {
      expect(await sizesOf(await pagedFile(0), {})).toEqual([[100, 200]]);
    });

    it('swaps the width and height of a page turned 90 degrees', async () => {
      expect(await sizesOf(await pagedFile(0), { rotations: { 1: 90 } })).toEqual([[200, 100]]);
    });

    it('adds the turn to the one the file already has, and wraps at 360', async () => {
      const turned = await pagedFile(90);
      expect(await sizesOf(turned, {})).toEqual([[200, 100]]);
      expect(await sizesOf(turned, { rotations: { 1: 90 } })).toEqual([[100, 200]]);
      expect(await sizesOf(await pagedFile(270), { rotations: { 1: 270 } })).toEqual([[100, 200]]);
    });

    it('turns only the pages named', async () => {
      expect(await sizesOf(await pagedFile(0, 2), { rotations: { 2: 90 } })).toEqual([[100, 200], [200, 100]]);
    });

    it('stacks the turned sizes into the one tall image', async () => {
      const file = await pagedFile(0, 2);
      expect(await sizesOf(file, { layout: 'concatenated', rotations: { 2: 90 } })).toEqual([[200, 300]]);
    });
  });
});
