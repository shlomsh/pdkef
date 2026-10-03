import { describe, expect, it, vi } from 'vitest';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFName,
  PDFString,
  PDFStream,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';
import { extractPageObjects, getPageContentBytes } from './pdfObjects.js';
import { withPreviews } from './objectPreviews.test-helper.js';
import {
  deleteObjectsFromPdf,
  spliceOut,
  listDeletableObjects,
  buildDeletePreviewPage,
} from './deleteObjects.js';

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

// Objects with the preview Delete shows (RED-16: read through pdf.js, not by
// the parser), so a test can find a run by what it says.
async function objectsOf(bytes) {
  const doc = await PDFDocument.load(bytes);
  const found = extractPageObjects(doc.getPage(0), 0);
  return { ...found, objects: await withPreviews(bytes, found.objects) };
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

  it('takes the AFM glyph widths when a standard-14 font omits /Widths', async () => {
    // The standard 14 fonts may leave their metrics implicit, as pdf-lib does here.
    const { objects } = await objectsOf(await buildSample());
    const run = objects.find((o) => o.preview === '123456789');
    expect(run.bbox.width).toBeCloseTo(9 * 12 * 0.556, 5);
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

  it('writes a replacement between newlines instead of the lone newline (RED-54)', () => {
    const out = spliceOut(bytes('AAABBBCCC'), [{ start: 3, end: 6, replacement: '[-5] TJ' }]);
    expect(decode(out)).toBe('AAA\n[-5] TJ\nCCC');
  });

  it('lets the outer range win, with its own replacement, when ranges nest', () => {
    const inner = { start: 4, end: 6, replacement: '[-1] TJ' };
    expect(decode(spliceOut(bytes('0123456789'), [inner, { start: 2, end: 8 }]))).toBe('01\n89');
    const outer = { start: 2, end: 8, replacement: '[-9] TJ' };
    expect(decode(spliceOut(bytes('0123456789'), [inner, outer]))).toBe('01\n[-9] TJ\n89');
  });

  it('keeps both replacements when ranges only touch (review of RED-54)', () => {
    const out = spliceOut(bytes('AABBCC'), [{ start: 0, end: 2, replacement: 'X' }, { start: 2, end: 4, replacement: 'Y' }]);
    expect(decode(out)).toBe('\nX\n\nY\nCC');
  });

  it('drops the replacements of partially overlapping ranges', () => {
    const out = spliceOut(bytes('0123456789'), [
      { start: 2, end: 6, replacement: 'X' },
      { start: 4, end: 8, replacement: 'Y' },
    ]);
    expect(decode(out)).toBe('01\n89');
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

// RED-54: a text unit is one show-text operation, and deleting it keeps what follows in place.
const ROW_STREAM = [
  'BT /F1 14 Tf 14 0 0 14 510 790 Tm (o)Tj ( )Tj',
  '/F2 10 Tf 1 0 0 1 532 792 Tm (1)Tj',
  '/F2 12 Tf 1 0 0 1 429 791 Tm (row text)Tj',
  '0 -14 Td (second line)Tj ET',
  'BT /F2 12 Tf 1 0 0 1 50 700 Tm [(AB) -200 (CD)] TJ 1 0 0 1 200 700 Tm (EF) Tj ET',
].join('\n');

async function buildRowFixture(stream = ROW_STREAM) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const { context } = doc;
  const fonts = context.obj({
    F1: context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: StandardFonts.ZapfDingbats }),
    F2: context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: StandardFonts.Helvetica }),
  });
  page.node.set(PDFName.of('Resources'), context.obj({ Font: fonts }));
  page.node.set(PDFName.of('Contents'), context.register(context.flateStream(stream)));
  return new Uint8Array(await doc.save());
}

const textUnits = async (bytes) => (await objectsOf(bytes)).objects.filter((o) => o.kind === 'text');
const contentOf = async (blob) => textOf(new Uint8Array(await blob.arrayBuffer()));

describe('deleting one show-text operation (RED-54)', () => {
  it('offers one unit per show operation, not one per BT..ET', async () => {
    const units = await textUnits(await buildRowFixture());
    // The checkbox box (with the space right after it), the number, the row text, the second line,
    // and the two ops of the second BT that sit far apart.
    expect(units).toHaveLength(6);
    expect(units[1].bbox.x).toBeCloseTo(532, 4);
    expect(units[2].bbox.x).toBeCloseTo(429, 4);
    expect(units[2].bbox.width).toBeCloseTo(3.501 * 12, 4); // Helvetica AFM widths of 'row text'
  });

  it('keeps every other unit at the same bbox after deleting the checkbox glyph', async () => {
    const source = await buildRowFixture();
    const before = await textUnits(source);
    const out = await deleteObjectsFromPdf(source, [before[0]]);
    const after = await textUnits(new Uint8Array(await out.arrayBuffer()));
    expect(after).toHaveLength(before.length - 1);
    after.forEach((unit, i) => {
      const was = before[i + 1].bbox;
      for (const key of ['x', 'y', 'width', 'height']) expect(unit.bbox[key]).toBeCloseTo(was[key], 2);
    });
    expect(await contentOf(out)).not.toContain('(o)');
  });

  it('keeps a following Tj in place after deleting the first op of a TJ + Tj pair', async () => {
    const source = await buildRowFixture();
    const before = await textUnits(source);
    const ef = before[before.length - 1];
    const out = await deleteObjectsFromPdf(source, [before[before.length - 2]]);
    const after = await textUnits(new Uint8Array(await out.arrayBuffer()));
    expect(after[after.length - 1].bbox.x).toBeCloseTo(ef.bbox.x, 2);
    const content = await contentOf(out);
    expect(content).not.toContain('(AB)');
    expect(content).not.toContain('(CD)');
  });

  it('writes an advance-only TJ, with T* first for a quote operator', async () => {
    const source = await buildRowFixture(
      'BT /F2 10 Tf 12 TL 1 0 0 1 50 700 Tm (A) Tj (B) \' (C) Tj ET',
    );
    const [first, second] = await textUnits(source);
    expect(first.replacement).toBe('[-667] TJ');
    expect(second.parts[0].replacement).toBe('T* [-667] TJ'); // (B)' and (C)Tj share a line, so they join
    const content = await contentOf(await deleteObjectsFromPdf(source, [second]));
    expect(content).toContain('T* [-667] TJ');
    expect(content).not.toContain('(B)');
  });

  it('keeps later text in place in a stream with no space between ops', async () => {
    const source = await buildRowFixture('BT /F2 10 Tf 1 0 0 1 50 700 Tm (AAAA)Tj(BBBB)Tj/F2 12 Tf(tail)Tj ET');
    const before = await textUnits(source);
    const out = await deleteObjectsFromPdf(source, [before[0]]);
    const after = await textUnits(new Uint8Array(await out.arrayBuffer()));
    expect(after[after.length - 1].bbox.x).toBeCloseTo(before[before.length - 1].bbox.x, 2);
  });

  it('writes Tw and Tc without exponent notation', async () => {
    const source = await buildRowFixture('BT /F2 10 Tf 12 TL 1 0 0 1 50 700 Tm 0.0000001 0.00000001 (A) " ET');
    const [first] = await textUnits(source);
    expect(first.replacement).not.toMatch(/e-/);
  });

  it('keeps Tw and Tc for the double-quote operator', async () => {
    const source = await buildRowFixture('BT /F2 10 Tf 12 TL 1 0 0 1 50 700 Tm 2 1 (A B) " (C) Tj ET');
    const [first] = await textUnits(source);
    expect(first.parts[0].replacement.startsWith('2 Tw 1 Tc T* [')).toBe(true);
    const content = await contentOf(await deleteObjectsFromPdf(source, [first]));
    expect(content).not.toContain('(A B)');
  });

  it('joins one-glyph-per-op placement into a single unit, and deleting it keeps the Tm operators (RED-54)', async () => {
    const glyphs = [['0', 100], ['3', 106.67], ['/', 113.34], ['1', 120.01], ['0', 126.68]];
    const stream = `BT /F2 12 Tf ${glyphs.map(([c, x]) => `1 0 0 1 ${x} 700 Tm (${c})Tj`).join(' ')} ET`;
    const source = await buildRowFixture(stream);
    const units = await textUnits(source);
    expect(units).toHaveLength(1);
    expect(units[0].parts).toHaveLength(5);
    expect(units[0].bbox.x).toBeCloseTo(100, 4);
    expect(units[0].bbox.width).toBeCloseTo(26.68 + 0.556 * 12, 2);

    const out = await deleteObjectsFromPdf(source, units);
    const content = await contentOf(out);
    for (const [c] of glyphs) expect(content).not.toContain(`(${c})`);
    expect(content.match(/ Tm/g)).toHaveLength(5);
    expect(await textUnits(new Uint8Array(await out.arrayBuffer()))).toHaveLength(0);
    const doc = await PDFDocument.load(source);
    const preview = await buildDeletePreviewPage(doc, 0, units);
    expect(await textOf(preview)).toBe(content);
  });

  it('keeps two words a wide gap apart as two units (RED-54)', async () => {
    const source = await buildRowFixture('BT /F2 12 Tf 1 0 0 1 100 700 Tm (ab)Tj 1 0 0 1 136 700 Tm (cd)Tj ET');
    expect(await textUnits(source)).toHaveLength(2);
  });

  it('keeps ops on a second baseline apart (RED-54)', async () => {
    const source = await buildRowFixture('BT /F2 12 Tf 1 0 0 1 100 700 Tm (ab)Tj 0 -14 Td (cd)Tj ET');
    expect(await textUnits(source)).toHaveLength(2);
  });

  it('keeps a font or size change apart (RED-54)', async () => {
    const source = await buildRowFixture('BT /F2 12 Tf 1 0 0 1 100 700 Tm (ab)Tj /F2 10 Tf (cd)Tj /F1 10 Tf (e)Tj ET');
    expect(await textUnits(source)).toHaveLength(3);
  });

  it('still honours a legacy deletion spanning a whole BT..ET block', async () => {
    const source = await buildRowFixture();
    const doc = await PDFDocument.load(source);
    const { blocks, bytes } = extractPageObjects(doc.getPage(0), 0);
    expect(blocks).toHaveLength(2);
    const legacy = { pageIndex: 0, start: blocks[0].start, end: blocks[0].end, formPath: [] };
    const content = await contentOf(await deleteObjectsFromPdf(source, [legacy]));
    expect(content).not.toContain('row text');
    expect(content).not.toContain('(1)');
    expect(content).toContain('(EF)');
    expect(decode(bytes).slice(legacy.start, legacy.start + 2)).toBe('BT');
    // The preview path agrees with the export for the same legacy span.
    const preview = await buildDeletePreviewPage(doc, 0, [legacy]);
    expect(await textOf(preview)).toBe(content);
  });

  it('previews a unit deletion exactly as the export writes it', async () => {
    const source = await buildRowFixture();
    const [target] = (await textUnits(source)).slice(2);
    const doc = await PDFDocument.load(source);
    const preview = await buildDeletePreviewPage(doc, 0, [target]);
    expect(await textOf(preview)).toBe(await contentOf(await deleteObjectsFromPdf(source, [target])));
  });
});

describe('buildDeletePreviewPage', () => {
  it('matches what deleteObjectsFromPdf writes for the same page and spans', async () => {
    const source = await buildSample();
    const { objects } = await objectsOf(source);
    const target = objects.find((o) => o.preview === '123456789');

    const doc = await PDFDocument.load(source);
    const previewBytes = await buildDeletePreviewPage(doc, 0, [target]);

    const blob = await deleteObjectsFromPdf(source, [target]);
    const exported = new Uint8Array(await blob.arrayBuffer());

    expect(await textOf(previewBytes)).toBe(await textOf(exported));
  });

  it('produces exactly one page with the source page rotation and size', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 300]);
    page.setRotation({ type: 'degrees', angle: 90 });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('KEEP', { x: 20, y: 100, size: 12, font });
    const source = new Uint8Array(await doc.save());

    const loaded = await PDFDocument.load(source);
    const previewBytes = await buildDeletePreviewPage(loaded, 0, []);
    const previewDoc = await PDFDocument.load(previewBytes);

    expect(previewDoc.getPageCount()).toBe(1);
    const previewPage = previewDoc.getPage(0);
    expect(previewPage.getWidth()).toBe(500);
    expect(previewPage.getHeight()).toBe(300);
    expect(previewPage.getRotation().angle).toBe(90);
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

  it('skips a page the extractor cannot parse instead of failing the whole file', async () => {
    const doc = await PDFDocument.load(await buildSample());
    const [copied] = await doc.copyPages(doc, [0]);
    doc.addPage(copied);
    const source = new Uint8Array(await doc.save());

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pdfObjects = await import('./pdfObjects.js');
    const realExtract = pdfObjects.extractPageObjects;
    const extractSpy = vi
      .spyOn(pdfObjects, 'extractPageObjects')
      .mockImplementation((page, pageIndex) => {
        if (pageIndex === 1) throw new Error('unsupported operator');
        return realExtract(page, pageIndex);
      });

    const objects = await listDeletableObjects(source);
    expect(objects.every((o) => o.pageIndex === 0)).toBe(true);
    expect(objects.length).toBeGreaterThan(0);
    expect(consoleSpy).toHaveBeenCalled();

    extractSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

/** Every dict/array/stream header and every decompressed stream, lowercased, as one haystack. */
async function decompressedObjectText(doc) {
  let haystack = '';
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const header = obj?.toString?.();
    if (typeof header === 'string') haystack += `${header}\n`;
    if (obj instanceof PDFStream) {
      try {
        const decoded = decodePDFRawStream(obj).decode();
        haystack += `${new TextDecoder('latin1').decode(decoded)}\n`;
      } catch {
        // Binary (e.g. image) stream data that isn't a PDF filter - can't hold text anyway.
      }
    }
  }
  return haystack.toLowerCase();
}

/** Subtypes of the annotations left on a page, in order. */
function annotSubtypes(page) {
  const annots = page.node.Annots();
  if (!annots) return [];
  const subtypes = [];
  for (let i = 0; i < annots.size(); i += 1) {
    const annot = page.doc.context.lookup(annots.get(i));
    subtypes.push(annot?.get?.(PDFName.of('Subtype'))?.asString?.());
  }
  return subtypes;
}

/**
 * A page with an image, a Link over the image (to be dropped with it), a
 * Link elsewhere (to survive), and a Widget over the image (to survive: form
 * fields are never touched, only /Link).
 */
async function buildFixtureWithAnnotations() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);

  const png = await doc.embedPng(
    Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0)),
  );
  page.drawImage(png, { x: 300, y: 40, width: 50, height: 50 });

  const trackerAction = doc.context.obj({
    Type: 'Action',
    S: 'URI',
    URI: PDFString.of('https://tracker.example.com/pixel'),
  });
  const linkOverImage = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [300, 40, 350, 90],
    Border: [0, 0, 0],
    A: trackerAction,
  });
  page.node.addAnnot(doc.context.register(linkOverImage));

  const elsewhereAction = doc.context.obj({
    Type: 'Action',
    S: 'URI',
    URI: PDFString.of('https://example.com/kept'),
  });
  const linkElsewhere = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [0, 0, 10, 10],
    Border: [0, 0, 0],
    A: elsewhereAction,
  });
  page.node.addAnnot(doc.context.register(linkElsewhere));

  const widgetOverImage = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    Rect: [300, 40, 350, 90],
    FT: 'Tx',
    T: PDFString.of('field1'),
  });
  page.node.addAnnot(doc.context.register(widgetOverImage));

  return new Uint8Array(await doc.save());
}

describe('deleteObjectsFromPdf: links over a deleted object', () => {
  it('removes a Link over the deleted image, with no trace of its URI in the saved bytes', async () => {
    const source = await buildFixtureWithAnnotations();
    const { objects } = await objectsOf(source);
    const image = objects.find((o) => o.kind === 'image');

    const blob = await deleteObjectsFromPdf(source, [image]);
    const outBytes = new Uint8Array(await blob.arrayBuffer());
    const outDoc = await PDFDocument.load(outBytes);

    // The elsewhere Link survives, so /Link itself is still present - only the
    // tracking URI and the annotation that carried it must be gone.
    expect(annotSubtypes(outDoc.getPage(0)).filter((s) => s === '/Link')).toHaveLength(1);
    expect(await decompressedObjectText(outDoc)).not.toContain('tracker.example.com');
  });

  it('keeps a Link annotation elsewhere on the page', async () => {
    const source = await buildFixtureWithAnnotations();
    const { objects } = await objectsOf(source);
    const image = objects.find((o) => o.kind === 'image');

    const blob = await deleteObjectsFromPdf(source, [image]);
    const outBytes = new Uint8Array(await blob.arrayBuffer());
    const outDoc = await PDFDocument.load(outBytes);

    expect(await decompressedObjectText(outDoc)).toContain('example.com/kept');
  });

  it('keeps a Widget over the deleted image', async () => {
    const source = await buildFixtureWithAnnotations();
    const { objects } = await objectsOf(source);
    const image = objects.find((o) => o.kind === 'image');

    const blob = await deleteObjectsFromPdf(source, [image]);
    const outBytes = new Uint8Array(await blob.arrayBuffer());
    const outDoc = await PDFDocument.load(outBytes);

    expect(annotSubtypes(outDoc.getPage(0))).toContain('/Widget');
  });
});

describe('deleteObjectsFromPdf: a link over a deleted text run', () => {
  it('drops the link over the deleted run and keeps the one over a run that stays', async () => {
    const doc = await PDFDocument.load(await buildSample());
    const page = doc.getPage(0);
    const runs = extractPageObjects(page, 0).objects.filter((o) => o.kind === 'text');
    const [kept, deleted] = runs;
    const linkOver = (run, uri) => {
      const { x, y, width, height } = run.bbox;
      const action = doc.context.obj({ Type: 'Action', S: 'URI', URI: PDFString.of(uri) });
      page.node.addAnnot(doc.context.register(doc.context.obj({
        Type: 'Annot', Subtype: 'Link', Rect: [x, y, x + width, y + height], A: doc.context.register(action),
      })));
    };
    linkOver(kept, 'https://example.com/stays');
    linkOver(deleted, 'https://example.com/goes');
    const source = new Uint8Array(await doc.save());
    // Byte spans are read from the saved file, the one being edited.
    const target = (await objectsOf(source)).objects.filter((o) => o.kind === 'text')[runs.indexOf(deleted)];

    const blob = await deleteObjectsFromPdf(source, [target]);
    const outDoc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    const text = await decompressedObjectText(outDoc);

    expect(text).toContain('example.com/stays');
    expect(text).not.toContain('example.com/goes');
  });
});

describe('clearDocumentDetails via deleteObjectsFromPdf', () => {
  it('drops Info title/author and any XMP Metadata stream from the saved file', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    doc.setTitle('Secret Title');
    doc.setAuthor('Secret Author');

    const xmpBytes = new TextEncoder().encode('<x:xmpmeta>Secret Author XMP</x:xmpmeta>');
    const metadataStream = doc.context.flateStream(xmpBytes, { Type: 'Metadata', Subtype: 'XML' });
    doc.catalog.set(PDFName.of('Metadata'), doc.context.register(metadataStream));

    const source = new Uint8Array(await doc.save());
    const blob = await deleteObjectsFromPdf(source, []);
    const outBytes = new Uint8Array(await blob.arrayBuffer());
    const outDoc = await PDFDocument.load(outBytes);

    expect(outDoc.getTitle()).toBeUndefined();
    expect(outDoc.getAuthor()).toBeUndefined();
    expect(outDoc.catalog.get(PDFName.of('Metadata'))).toBeUndefined();
    expect(await decompressedObjectText(outDoc)).not.toContain('secret author');
  });
});

describe('glyph widths behind an advance-only TJ (RED-54)', () => {
  async function buildWithFont(stream, makeFont) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const { context } = doc;
    page.node.set(PDFName.of('Resources'), context.obj({ Font: context.obj({ F1: makeFont(context) }) }));
    page.node.set(PDFName.of('Contents'), context.register(context.flateStream(stream)));
    return new Uint8Array(await doc.save());
  }
  const SHOW = 'BT /F1 10 Tf 1 0 0 1 50 700 Tm (AAAA) Tj ET';

  it('uses the AFM widths of a standard-14 font with no /Widths', async () => {
    const source = await buildWithFont(SHOW, (c) =>
      c.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'ABCDEF+Helvetica' }));
    const [unit] = await textUnits(source);
    expect(unit.replacement).toBe('[-2668] TJ');
    expect(unit.bbox.width).toBeCloseTo(26.68, 2);
  });

  it('reads Symbol widths by the font\'s own code table', async () => {
    const source = await buildWithFont('BT /F1 10 Tf 1 0 0 1 50 700 Tm (a) Tj ET', (c) =>
      c.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Symbol' }));
    const [unit] = await textUnits(source);
    expect(unit.replacement).toBe('[-631] TJ'); // alpha
  });

  it('scales a Type3 font by its FontMatrix', async () => {
    const source = await buildWithFont(SHOW, (c) =>
      c.obj({
        Type: 'Font', Subtype: 'Type3', FontMatrix: [0.01, 0, 0, 0.01, 0, 0],
        FirstChar: 65, LastChar: 65, Widths: [100],
      }));
    const [unit] = await textUnits(source);
    expect(unit.replacement).toBe('[-4000] TJ');
  });

  it('gives a code past the /Widths array no advance when there is no MissingWidth', async () => {
    const source = await buildWithFont('BT /F1 10 Tf 1 0 0 1 50 700 Tm (AB) Tj ET', (c) =>
      c.obj({
        Type: 'Font', Subtype: 'Type1', BaseFont: 'Foo', FirstChar: 65, LastChar: 65, Widths: [600],
      }));
    const [unit] = await textUnits(source);
    expect(unit.replacement).toBe('[-600] TJ');
  });

  it('keeps 500 for a simple font with neither /Widths nor a standard name', async () => {
    const source = await buildWithFont('BT /F1 10 Tf 1 0 0 1 50 700 Tm (A) Tj ET', (c) =>
      c.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Foo' }));
    const [unit] = await textUnits(source);
    expect(unit.replacement).toBe('[-500] TJ');
  });

  it('treats a Type0 font with an embedded /WMode 1 CMap as vertical, one whole-block unit', async () => {
    const stream = 'BT /F1 10 Tf 1 0 0 1 50 700 Tm <00410042> Tj 1 0 0 1 50 650 Tm <00430044> Tj ET';
    const source = await buildWithFont(stream, (c) => {
      const cmap = c.register(
        c.stream('/CIDInit /ProcSet findresource begin\n/WMode 1 def\nendcmap', { Type: 'CMap', CMapName: 'Custom-V' }),
      );
      const descendant = c.obj({ Type: 'Font', Subtype: 'CIDFontType2', BaseFont: 'Foo', DW: 1000 });
      return c.obj({
        Type: 'Font', Subtype: 'Type0', BaseFont: 'Foo', Encoding: cmap, DescendantFonts: [descendant],
      });
    });
    expect(await textUnits(source)).toHaveLength(1);
  });
});
