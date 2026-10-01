// RED-26: one image drawn on every page (a watermark) can be deleted on one
// page or everywhere, and "everywhere" removes the image object from the file.
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFStream } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPageObjects } from './pdfObjects.js';
import {
  deleteObjectsFromPdf,
  listDeletableObjects,
} from './deleteObjects.js';

// A real, valid 1x1 transparent PNG, as in deleteObjects.test.js.
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const FIXTURE = path.resolve(process.cwd(), 'spikes/red-18/corpus/shared-header-image-full.pdf');
const source = () => new Uint8Array(fs.readFileSync(FIXTURE));
const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

/** The page indexes that still draw an image, by reading each page's resources and content. */
async function pagesStillDrawingImages(bytes) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().flatMap((page, i) => {
    const { objects } = extractPageObjects(page, i);
    return objects.some((o) => o.kind === 'image') ? [i] : [];
  });
}

async function pageTexts(bytes) {
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true });
  const pdf = await task.promise;
  const texts = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const content = await (await pdf.getPage(n)).getTextContent();
    texts.push(content.items.map((item) => item.str).join(' '));
  }
  await task.destroy();
  return texts;
}

const imageStreams = async (bytes) => {
  const doc = await PDFDocument.load(bytes);
  return [...doc.context.enumerateIndirectObjects()].filter(
    ([, o]) => o instanceof PDFStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image',
  );
};

describe('shared image: imageRef', () => {
  it('reports the same imageRef for the logo on every page', async () => {
    const objects = await listDeletableObjects(source());
    const images = objects.filter((o) => o.kind === 'image');
    expect(images).toHaveLength(5);
    expect(new Set(images.map((o) => o.imageRef))).toEqual(new Set(['5 0 R']));
    expect(images.map((o) => o.pageIndex)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('deleteObjectsFromPdf: a shared image', () => {
  it('deleting it on page 1 changes only page 1 and keeps the image object', async () => {
    const objects = await listDeletableObjects(source());
    const logo = objects.find((o) => o.kind === 'image' && o.pageIndex === 0);
    const out = await bytesOf(await deleteObjectsFromPdf(source(), [logo]));

    expect(await pagesStillDrawingImages(out)).toEqual([1, 2, 3, 4]);
    expect(await imageStreams(out)).toHaveLength(1);
    expect(await pageTexts(out)).toEqual(await pageTexts(source()));
  });

  it('deleting it on every page removes the object from the saved file and keeps all text', async () => {
    const objects = await listDeletableObjects(source());
    const all = objects.filter((o) => o.imageRef === '5 0 R');
    const out = await bytesOf(await deleteObjectsFromPdf(source(), all));

    expect(await pagesStillDrawingImages(out)).toEqual([]);
    expect(await imageStreams(out)).toHaveLength(0);
    const reloaded = await PDFDocument.load(out);
    for (const page of reloaded.getPages()) {
      const xobjects = page.node.Resources()?.get(PDFName.of('XObject'));
      expect(reloaded.context.lookup(xobjects)?.keys?.().length ?? 0).toBe(0);
    }
    const before = await pageTexts(source());
    expect(before.every((text) => text.includes('body text'))).toBe(true);
    expect(await pageTexts(out)).toEqual(before);
  });

  it('keeps an image that the same page draws a second time', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const png = await doc.embedPng(Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0)));
    page.drawImage(png, { x: 10, y: 10, width: 20, height: 20 });
    page.drawImage(png, { x: 100, y: 100, width: 20, height: 20 });
    const bytes = new Uint8Array(await doc.save());

    const objects = await listDeletableObjects(bytes);
    expect(objects).toHaveLength(2);
    expect(objects[0].imageRef).toBe(objects[1].imageRef);
    const out = await bytesOf(await deleteObjectsFromPdf(bytes, [objects[0]]));

    expect(await pagesStillDrawingImages(out)).toEqual([0]);
    expect(await imageStreams(out)).toHaveLength(1);
  });
});
