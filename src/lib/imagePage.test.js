import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { addImagePage, UnsupportedImageError } from './imagePage.js';

const fixture = (name) => new Uint8Array(fs.readFileSync(path.resolve(__dirname, '__fixtures__', name)));

describe('addImagePage', () => {
  it('adds one page sized to a JPEG pixel for pixel (60x40 photo)', async () => {
    const doc = await PDFDocument.create();
    const page = await addImagePage(doc, fixture('photo-1.jpg'), 'image/jpeg');
    expect(doc.getPageCount()).toBe(1);
    expect(page.getSize()).toEqual({ width: 60, height: 40 });
  });

  it('adds one page sized to a PNG pixel for pixel (40x80 photo)', async () => {
    const doc = await PDFDocument.create();
    const page = await addImagePage(doc, fixture('photo-2.png'), 'image/png');
    expect(page.getSize()).toEqual({ width: 40, height: 80 });
  });

  it('throws UnsupportedImageError for any other type', async () => {
    const doc = await PDFDocument.create();
    await expect(addImagePage(doc, new Uint8Array(4), 'image/gif')).rejects.toBeInstanceOf(UnsupportedImageError);
    expect(doc.getPageCount()).toBe(0);
  });
});
