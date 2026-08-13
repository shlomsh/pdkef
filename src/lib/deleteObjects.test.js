import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { extractPageObjects, getPageContentBytes } from './pdfObjects.js';
import { deleteObjectsFromPdf, spliceOut, listDeletableObjects } from './deleteObjects.js';

// A real, valid 1x1 transparent PNG (67 bytes).
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const decode = (bytes) => new TextDecoder().decode(bytes);

/**
 * Builds a one-page PDF with three text runs and one image, at known positions.
 * A constructed document keeps the expectations legible and avoids committing a
 * binary fixture for behaviour that is really about content-stream shape.
 */
async function buildSample() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText('KEEP ME', { x: 20, y: 160, size: 12, font });
  page.drawText('123456789', { x: 20, y: 120, size: 12, font, color: rgb(0, 0, 0) });
  page.drawText('ALSO KEEP', { x: 20, y: 80, size: 12, font });

  const png = await doc.embedPng(
    Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0)),
  );
  page.drawImage(png, { x: 300, y: 40, width: 50, height: 50 });

  return new Uint8Array(await doc.save());
}

async function objectsOf(bytes) {
  const doc = await PDFDocument.load(bytes);
  return extractPageObjects(doc.getPage(0), 0);
}

async function textOf(bytes) {
  const doc = await PDFDocument.load(bytes);
  return decode(getPageContentBytes(doc.getPage(0)));
}

describe('extractPageObjects', () => {
  it('finds each text run and each image placement', async () => {
    const { objects } = await objectsOf(await buildSample());
    expect(objects.filter((o) => o.kind === 'text')).toHaveLength(3);
    expect(objects.filter((o) => o.kind === 'image')).toHaveLength(1);
  });

  it('previews what a run says, so the user can check before deleting', async () => {
    const { objects } = await objectsOf(await buildSample());
    expect(objects.filter((o) => o.kind === 'text').map((o) => o.preview)).toEqual([
      'KEEP ME',
      '123456789',
      'ALSO KEEP',
    ]);
  });

  it('boxes a run at the position and size it was drawn', async () => {
    const { objects } = await objectsOf(await buildSample());
    const run = objects.find((o) => o.preview === '123456789');
    expect(run.bbox.x).toBeCloseTo(20, 0);
    // The box spans the font's ascent to descent, so it contains the baseline.
    expect(run.bbox.y).toBeLessThan(120);
    expect(run.bbox.y + run.bbox.height).toBeGreaterThan(120);
    // Nine glyphs of 12pt type land in a plausible range whichever metrics the
    // font supplies; the exact figure is pinned by the fallback test below.
    expect(run.bbox.width).toBeGreaterThan(40);
    expect(run.bbox.width).toBeLessThan(80);
  });

  it('falls back to an average glyph width when the font omits /Widths', async () => {
    // The standard 14 fonts may leave their metrics implicit, as pdf-lib does
    // here. The box is then approximate: 0.5 em per glyph rather than the real
    // 0.556 em of a Helvetica digit, so it reads about 8% narrow. Deletion is
    // unaffected because it removes the whole run, but hover hit-testing on
    // such a file is correspondingly loose.
    const { objects } = await objectsOf(await buildSample());
    const run = objects.find((o) => o.preview === '123456789');
    expect(run.bbox.width).toBeCloseTo(9 * 12 * 0.5, 5);
  });

  it('boxes an image at its placement rectangle', async () => {
    const { objects } = await objectsOf(await buildSample());
    const image = objects.find((o) => o.kind === 'image');
    expect(image.bbox.x).toBeCloseTo(300);
    expect(image.bbox.y).toBeCloseTo(40);
    expect(image.bbox.width).toBeCloseTo(50);
    expect(image.bbox.height).toBeCloseTo(50);
  });

  it('reports a top-left percentage rect for the editor to position against', async () => {
    const { objects } = await objectsOf(await buildSample());
    const image = objects.find((o) => o.kind === 'image');
    expect(image.rect.left).toBeCloseTo(75); // 300 of 400
    expect(image.rect.width).toBeCloseTo(12.5); // 50 of 400
    // PDF y=40..90 on a 200-tall page is 110..160 from the top.
    expect(image.rect.top).toBeCloseTo(55);
    expect(image.rect.height).toBeCloseTo(25);
  });

  it('gives every object a stable id', async () => {
    const { objects } = await objectsOf(await buildSample());
    const ids = objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('spliceOut', () => {
  const bytes = (s) => new TextEncoder().encode(s);

  it('removes the given range', () => {
    expect(decode(spliceOut(bytes('AAABBBCCC'), [{ start: 3, end: 6 }]))).toBe('AAA\nCCC');
  });

  it('removes several ranges without earlier cuts shifting later ones', () => {
    const out = spliceOut(bytes('0123456789'), [
      { start: 0, end: 2 },
      { start: 8, end: 10 },
    ]);
    expect(decode(out)).toBe('\n234567\n');
  });

  it('merges overlapping ranges instead of cutting twice', () => {
    const out = spliceOut(bytes('0123456789'), [
      { start: 2, end: 6 },
      { start: 4, end: 8 },
    ]);
    expect(decode(out)).toBe('01\n89');
  });

  it('separates the surviving neighbours so two tokens cannot fuse', () => {
    // Without the inserted newline this would read as the single operator `BTET`.
    const out = spliceOut(bytes('BT (x) Tj ET'), [{ start: 2, end: 9 }]);
    expect(decode(out)).toBe('BT\n ET');
  });

  it('clamps ranges that run past the end', () => {
    expect(decode(spliceOut(bytes('ABC'), [{ start: 1, end: 99 }]))).toBe('A\n');
  });

  it('returns the input unchanged when there is nothing to remove', () => {
    expect(decode(spliceOut(bytes('ABC'), []))).toBe('ABC');
  });
});

describe('deleteObjectsFromPdf', () => {
  it('removes the chosen run and leaves the others', async () => {
    const source = await buildSample();
    const { objects } = await objectsOf(source);
    const target = objects.find((o) => o.preview === '123456789');

    const blob = await deleteObjectsFromPdf(source, [target]);
    const out = new Uint8Array(await blob.arrayBuffer());

    const after = (await objectsOf(out)).objects;
    expect(after.map((o) => o.preview).filter(Boolean)).toEqual(['KEEP ME', 'ALSO KEEP']);
  });

  it('removes the run from the file bytes, not just from view', async () => {
    // Text is stored hex-encoded, so search for the codes rather than the
    // characters. A drawn-over box would leave these behind; deletion must not.
    const source = await buildSample();
    const { objects } = await objectsOf(source);
    const target = objects.find((o) => o.preview === '123456789');

    const hex = '313233343536373839';
    expect(await textOf(source)).toContain(hex);

    const blob = await deleteObjectsFromPdf(source, [target]);
    expect(await textOf(new Uint8Array(await blob.arrayBuffer()))).not.toContain(hex);
  });

  it('leaves the surviving runs at their original positions', async () => {
    const source = await buildSample();
    const before = (await objectsOf(source)).objects;
    const target = before.find((o) => o.preview === '123456789');

    const blob = await deleteObjectsFromPdf(source, [target]);
    const after = (await objectsOf(new Uint8Array(await blob.arrayBuffer()))).objects;

    const survivor = after.find((o) => o.preview === 'ALSO KEEP');
    const original = before.find((o) => o.preview === 'ALSO KEEP');
    expect(survivor.bbox.x).toBeCloseTo(original.bbox.x);
    expect(survivor.bbox.y).toBeCloseTo(original.bbox.y);
    expect(survivor.bbox.width).toBeCloseTo(original.bbox.width);
  });

  it('removes an image placement', async () => {
    const source = await buildSample();
    const { objects } = await objectsOf(source);
    const image = objects.find((o) => o.kind === 'image');

    const blob = await deleteObjectsFromPdf(source, [image]);
    const after = (await objectsOf(new Uint8Array(await blob.arrayBuffer()))).objects;

    expect(after.filter((o) => o.kind === 'image')).toHaveLength(0);
    expect(after.filter((o) => o.kind === 'text')).toHaveLength(3);
  });

  it('removes a mix of text and image in one pass', async () => {
    const source = await buildSample();
    const { objects } = await objectsOf(source);
    const targets = [
      objects.find((o) => o.preview === '123456789'),
      objects.find((o) => o.kind === 'image'),
    ];

    const blob = await deleteObjectsFromPdf(source, targets);
    const after = (await objectsOf(new Uint8Array(await blob.arrayBuffer()))).objects;

    expect(after.map((o) => o.preview ?? o.kind)).toEqual(['KEEP ME', 'ALSO KEEP']);
  });

  it('keeps the page count and page size', async () => {
    const source = await buildSample();
    const { objects } = await objectsOf(source);
    const blob = await deleteObjectsFromPdf(source, [objects[0]]);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));

    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBe(400);
    expect(doc.getPage(0).getHeight()).toBe(200);
  });

  it('produces a readable PDF when asked to delete nothing', async () => {
    const source = await buildSample();
    const blob = await deleteObjectsFromPdf(source, []);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(1);
  });

  it('reports progress once per affected page', async () => {
    const source = await buildSample();
    const { objects } = await objectsOf(source);
    const calls = [];
    await deleteObjectsFromPdf(source, [objects[0]], (p) => calls.push(p));
    expect(calls).toEqual([1]);
  });
});

describe('listDeletableObjects', () => {
  it('tags each object with the page it came from', async () => {
    const doc = await PDFDocument.load(await buildSample());
    const [copied] = await doc.copyPages(doc, [0]);
    doc.addPage(copied);
    const source = new Uint8Array(await doc.save());

    const objects = await listDeletableObjects(source);
    expect(new Set(objects.map((o) => o.pageIndex))).toEqual(new Set([0, 1]));
    expect(objects.filter((o) => o.pageIndex === 1)).toHaveLength(4);
  });
});
