import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName, StandardFonts } from '@cantoo/pdf-lib';
import { extractPageObjects } from './pdfObjects.js';
import { listDeletableObjects } from './deleteObjects.js';
import { buildFormXObjectPdf } from './formXObjectFixture.test-helper.js';
import { withPreviews } from './objectPreviews.test-helper.js';

const PAGE_W = 612;
const PAGE_H = 792;

/** The objects of every page of a built fixture, with the form refs it used. */
async function extractAll(options) {
  const bytes = await buildFormXObjectPdf(options);
  const doc = await PDFDocument.load(bytes);
  const all = await withPreviews(bytes, doc.getPages().flatMap((page, i) => extractPageObjects(page, i).objects));
  return doc.getPages().map((_, i) => all.filter((o) => o.pageIndex === i));
}

const text = (objects, preview) => objects.find((o) => o.kind === 'text' && o.preview === preview);

describe('extractPageObjects inside Form XObjects (RED-29)', () => {
  it('reports the runs and the image a page draws only through a Form, with the form on formPath', async () => {
    const pages = await extractAll({ pages: 3 });
    pages.forEach((objects, i) => {
      expect(objects).toHaveLength(3);
      expect(objects.map((o) => o.kind).sort()).toEqual(['image', 'text', 'text']);
      for (const object of objects) {
        expect(object.pageIndex).toBe(i);
        expect(object.formPath).toHaveLength(1);
        expect(object.formPath[0]).toMatch(/^\d+ \d+ R$/);
      }
      expect(text(objects, `Secret ${i}`)).toBeDefined();
      expect(text(objects, `Keep ${i}`)).toBeDefined();
    });
    // Each page owns its own Form here.
    expect(new Set(pages.map((objects) => objects[0].formPath[0])).size).toBe(3);
  });

  it('puts each object at the page position the Form stream draws it', async () => {
    const [objects] = await extractAll({ pages: 1 });
    const secret = text(objects, 'Secret 0');
    const keep = text(objects, 'Keep 0');
    const image = objects.find((o) => o.kind === 'image');

    expect(secret.rect.left).toBeCloseTo((72 / PAGE_W) * 100, 3);
    expect(keep.rect.left).toBeCloseTo((72 / PAGE_W) * 100, 3);
    // 12pt Helvetica, no descriptor: fallback ascent .75 / descent -.25 => 12pt tall box, baseline at y.
    expect(secret.bbox.y).toBeCloseTo(700 - 3, 3);
    expect(secret.bbox.height).toBeCloseTo(12, 3);
    expect(keep.bbox.y).toBeCloseTo(680 - 3, 3);
    expect(secret.rect.top).toBeCloseTo(((PAGE_H - 697 - 12) / PAGE_H) * 100, 3);

    expect(image.imageRef).toMatch(/^\d+ \d+ R$/);
    expect(image.rect.left).toBeCloseTo((72 / PAGE_W) * 100, 3);
    expect(image.rect.top).toBeCloseTo(((PAGE_H - 600 - 50) / PAGE_H) * 100, 3);
    expect(image.rect.width).toBeCloseTo((100 / PAGE_W) * 100, 3);
    expect(image.rect.height).toBeCloseTo((50 / PAGE_H) * 100, 3);
  });

  it('keeps start/end inside the Form stream, with the span rules of a page-level object', async () => {
    const source = await buildFormXObjectPdf({ pages: 1 });
    const doc = await PDFDocument.load(source);
    const { objects: found, bytes } = extractPageObjects(doc.getPage(0), 0);
    const objects = await withPreviews(source, found);
    // The page's own content is only `q /Xf1 Do Q`; no span points into it.
    expect(bytes.length).toBeLessThan(20);
    const secret = text(objects, 'Secret 0');
    const stream = [...doc.context.enumerateIndirectObjects()]
      .find(([ref]) => ref.tag === secret.formPath[0])[1];
    const content = new TextDecoder().decode(stream.getContents());
    expect(content.slice(secret.start, secret.end)).toBe('(Secret 0) Tj');
  });

  it('reports a shared Form on every page under the same formPath', async () => {
    const pages = await extractAll({ pages: 3, shared: true });
    const paths = pages.map((objects) => objects[0].formPath);
    expect(pages.every((objects) => objects.length === 3)).toBe(true);
    expect(paths[1]).toEqual(paths[0]);
    expect(paths[2]).toEqual(paths[0]);
    // Every page reads the same runs, because it is the same stream.
    expect(pages.every((objects) => text(objects, 'Secret 0'))).toBe(true);
  });

  it('follows a Form drawn inside a Form, outermost first', async () => {
    const pages = await extractAll({ pages: 3, nested: true });
    pages.forEach((objects, i) => {
      expect(objects).toHaveLength(4);
      const nested = text(objects, `Nested ${i}`);
      expect(nested.formPath).toHaveLength(2);
      expect(nested.formPath[0]).toBe(text(objects, `Secret ${i}`).formPath[0]);
      expect(nested.formPath[1]).not.toBe(nested.formPath[0]);
      expect(nested.rect.left).toBeCloseTo((72 / PAGE_W) * 100, 3);
      expect(nested.bbox.y).toBeCloseTo(500 - 3, 3);
    });
  });

  it('gives every object on a page a distinct id', async () => {
    for (const options of [{ pages: 2 }, { pages: 2, nested: true }, { pages: 2, shared: true }]) {
      for (const objects of await extractAll(options)) {
        const ids = objects.map((o) => o.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it('keeps page-level objects on formPath [] beside a Form', async () => {
    const doc = await PDFDocument.load(await buildFormXObjectPdf({ pages: 1 }));
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.getPage(0).drawText('On the page', { x: 50, y: 100, font });
    const saved = await doc.save({ useObjectStreams: false });
    const reloaded = await PDFDocument.load(saved);
    const objects = await withPreviews(saved, extractPageObjects(reloaded.getPage(0), 0).objects);
    const own = text(objects, 'On the page');
    expect(own.formPath).toEqual([]);
    expect(own.id).toMatch(/^obj-0-\d+$/);
    expect(objects.filter((o) => o.formPath.length === 1)).toHaveLength(3);
  });
});

describe('Form XObject transform and guards', () => {
  /** One page drawing /Xf1 under `pageContent`; the Form holds `formContent` and `extra` dict entries. */
  async function pageWithForm(pageContent, formContent, extra = {}) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const { context } = doc;
    const form = context.register(context.stream(formContent, {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 612, 792], Resources: { Font: { F1: font.ref } }, ...extra,
    }));
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.node.set(PDFName.of('Resources'), context.obj({ XObject: { Xf1: form, Xf2: form } }));
    page.node.set(PDFName.of('Contents'), context.register(context.stream(pageContent)));
    const reloaded = await PDFDocument.load(await doc.save({ useObjectStreams: false }));
    return reloaded.getPage(0);
  }

  it('applies page CTM at the Do, the Form /Matrix, then the Form own cm', async () => {
    // Page: translate by (100, 50). Form: /Matrix scales x2. Form content: cm translate (10, 20), run at 5,5.
    const page = await pageWithForm(
      'q 1 0 0 1 100 50 cm /Xf1 Do Q',
      'q 1 0 0 1 10 20 cm BT /F1 10 Tf 5 5 Td (A) Tj ET Q',
      { Matrix: [2, 0, 0, 2, 0, 0] },
    );
    const [object] = extractPageObjects(page, 0).objects;
    // point = ((5+10, 5+20) * Matrix) * pageCTM = (2*15 + 100, 2*25 + 50)
    expect(object.bbox.x).toBeCloseTo(130, 3);
    // Glyph box is 10pt tall under the 2x matrix => 20pt; baseline at 100, descent -.25*10*2.
    expect(object.bbox.y).toBeCloseTo(100 - 5, 3);
    expect(object.bbox.height).toBeCloseTo(20, 3);
  });

  it('reports a Form drawn twice for its first Do only', async () => {
    const page = await pageWithForm('/Xf1 Do /Xf2 Do', 'BT /F1 10 Tf 5 5 Td (A) Tj ET');
    expect(extractPageObjects(page, 0).objects).toHaveLength(1);
  });

  it('stops at a Form that draws itself', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const { context } = doc;
    const form = context.nextRef();
    context.assign(form, context.stream('BT /F1 10 Tf 5 5 Td (A) Tj ET /Self Do', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10],
      Resources: { Font: { F1: font.ref }, XObject: { Self: form } },
    }));
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.node.set(PDFName.of('Resources'), context.obj({ XObject: { Xf1: form } }));
    page.node.set(PDFName.of('Contents'), context.register(context.stream('/Xf1 Do')));
    const reloaded = await PDFDocument.load(await doc.save({ useObjectStreams: false }));
    expect(extractPageObjects(reloaded.getPage(0), 0).objects).toHaveLength(1);
  });

  it('falls back to the page resources when the Form has none', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const { context } = doc;
    const form = context.register(context.stream('BT /F1 10 Tf 5 5 Td (A) Tj ET', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 612, 792],
    }));
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.node.set(PDFName.of('Resources'), context.obj({ Font: { F1: font.ref }, XObject: { Xf1: form } }));
    page.node.set(PDFName.of('Contents'), context.register(context.stream('/Xf1 Do')));
    const bytes = await doc.save({ useObjectStreams: false });
    const reloaded = await PDFDocument.load(bytes);
    const [object] = await withPreviews(bytes, extractPageObjects(reloaded.getPage(0), 0).objects);
    expect(object.preview).toBe('A');
  });

  it('keeps the page objects when a Form cannot be read', async () => {
    const page = await pageWithForm('BT /F1 10 Tf 50 50 Td (Page) Tj ET /Xf1 Do', 'BT (A) Tj ET');
    const form = [...page.doc.context.enumerateIndirectObjects()]
      .map(([, object]) => object)
      .find((object) => object.dict?.get(PDFName.of('Subtype'))?.asString?.() === '/Form');
    form.dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode')); // content is not flate data
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { objects } = extractPageObjects(page, 0);
    error.mockRestore();
    expect(objects.map((o) => o.formPath)).toEqual([[]]);
  });
});

describe('listDeletableObjects with Form XObjects', () => {
  it('offers the 9 objects of a 3-page Form fixture, 12 when each also nests a Form', async () => {
    expect(await listDeletableObjects(await buildFormXObjectPdf({ pages: 3 }))).toHaveLength(9);
    expect(await listDeletableObjects(await buildFormXObjectPdf({ pages: 3, nested: true }))).toHaveLength(12);
  });
});
