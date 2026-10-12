import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { addImagePage, jpegOrientation, UnsupportedImageError } from './imagePage.js';

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

// A minimal JPEG whose APP1 Exif segment carries one orientation tag.
function jpegWithOrientation(value, littleEndian) {
  const u16 = (n) => (littleEndian ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n) => (littleEndian ? [n, 0, 0, 0] : [0, 0, 0, n]);
  const tiff = [
    ...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8),
    ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(value), 0, 0, ...u32(0),
  ];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = body.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...body, 0xff, 0xd9]);
}

describe('jpegOrientation', () => {
  it.each([1, 3, 6, 8])('reads orientation %i in both byte orders', (value) => {
    expect(jpegOrientation(jpegWithOrientation(value, false))).toBe(value);
    expect(jpegOrientation(jpegWithOrientation(value, true))).toBe(value);
  });

  it('reads the exif-6 fixture', () => {
    expect(jpegOrientation(fixture('photo-exif-6.jpg'))).toBe(6);
  });

  it('is 1 with no Exif, for a PNG, and for garbage', () => {
    expect(jpegOrientation(fixture('photo-1.jpg'))).toBe(1);
    expect(jpegOrientation(fixture('photo-2.png'))).toBe(1);
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 4, 1]))).toBe(1);
    expect(jpegOrientation(new Uint8Array(0))).toBe(1);
    expect(jpegOrientation(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]))).toBe(1);
  });

  it('is 1 for an out-of-range value', () => {
    expect(jpegOrientation(jpegWithOrientation(9, false))).toBe(1);
  });
});

describe('addImagePage rotation', () => {
  it('sets /Rotate 90 for an orientation-6 photo and keeps the stored pixel size', async () => {
    const doc = await PDFDocument.create();
    const page = await addImagePage(doc, fixture('photo-exif-6.jpg'), 'image/jpeg');
    expect(page.getRotation().angle).toBe(90);
    expect(page.getSize()).toEqual({ width: 60, height: 40 });
  });

  it('leaves a photo without Exif and a PNG unrotated', async () => {
    const doc = await PDFDocument.create();
    expect((await addImagePage(doc, fixture('photo-1.jpg'), 'image/jpeg')).getRotation().angle).toBe(0);
    expect((await addImagePage(doc, fixture('photo-2.png'), 'image/png')).getRotation().angle).toBe(0);
  });
});
