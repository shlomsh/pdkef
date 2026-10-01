import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName, PDFString, degrees } from '@cantoo/pdf-lib';
import { FormFlattenError, appearanceToRectMatrix, flattenPdf } from './flatten.js';
import { getPageContentBytes } from './pdfObjects.js';

vi.mock('./pdfjsLoader.js', () => ({
  getPdfjs: async () => ({
    getDocument: () => ({
      promise: Promise.resolve({ numPages: 2, getPage: async (n) => ({ n }) }),
      destroy: async () => {},
    }),
  }),
}));
vi.mock('./rasterPage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  rasterizePageToJpeg: vi.fn(async () => ({ jpeg: TINY_JPEG, width: 120, height: 80 })),
}));

// A 1x1 JPEG, enough for pdf-lib to embed.
const TINY_JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='), (c) => c.charCodeAt(0));

const text = (bytes) => new TextDecoder().decode(bytes);

/** Adds an annotation of `subtype` whose normal appearance paints `paint` inside `bbox`. */
function addAnnot(doc, page, { subtype, rect, bbox = [0, 0, 100, 50], paint = '0 0 100 50 re f', flags = 4 }) {
  const { context } = doc;
  const ap = context.register(context.stream(paint, {
    Type: 'XObject', Subtype: 'Form', BBox: bbox,
  }));
  const annot = context.register(context.obj({
    Type: 'Annot', Subtype: subtype, Rect: rect, F: flags, AP: { N: ap },
  }));
  const annots = page.node.Annots() ?? context.obj([]);
  annots.push(annot);
  page.node.set(PDFName.of('Annots'), annots);
  return annot;
}

const annotCount = (doc, index = 0) => doc.getPage(index).node.Annots()?.size() ?? 0;

describe('flattenPdf keep-text', () => {
  it('bakes a stamp into the page and removes it and a sticky-note comment', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    addAnnot(doc, page, { subtype: 'Stamp', rect: [10, 10, 210, 110], paint: '1 0 0 rg 0 0 100 50 re f' });
    addAnnot(doc, page, { subtype: 'Text', rect: [250, 250, 270, 270], bbox: [0, 0, 20, 20], paint: '0 0 20 20 re f' });
    addAnnot(doc, page, { subtype: 'Popup', rect: [0, 0, 10, 10] });

    const out = await PDFDocument.load(await flattenPdf(await doc.save()));

    // The popup has no appearance of its own and is left alone; both visible annots are gone.
    expect(annotCount(out)).toBe(1);
    const subtype = out.context.lookup(out.getPage(0).node.Annots().get(0)).get(PDFName.of('Subtype'));
    expect(subtype).toBe(PDFName.of('Popup'));
    const content = text(getPageContentBytes(out.getPage(0)));
    expect(content).toContain('2 0 0 2 10 10 cm');
    expect(content).toContain('Do');
    const xobjects = out.context.lookup(out.getPage(0).node.Resources().get(PDFName.of('XObject')));
    const painted = xobjects.keys().map((key) => text(out.context.lookup(xobjects.get(key)).getContents()));
    expect(painted.some((c) => c.includes('1 0 0 rg 0 0 100 50 re f'))).toBe(true);
  });

  it('places a form field appearance inside its /Rect on a rotated page', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 500]);
    page.setRotation(degrees(90));
    const field = doc.getForm().createTextField('name');
    field.setText('Jane');
    field.addToPage(page, { x: 40, y: 420, width: 200, height: 30 });

    const out = await PDFDocument.load(await flattenPdf(await doc.save()));

    expect(annotCount(out)).toBe(0);
    expect(out.catalog.getAcroForm().getFields()).toHaveLength(0);
    expect(out.getPage(0).getRotation().angle).toBe(90);
    const content = text(getPageContentBytes(out.getPage(0)));
    const [, a, b, c, d, e, f] = /([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) cm\s+\/FlatAnnot/.exec(content).map(Number);
    expect([a, b, c, d]).toEqual([1, 0, 0, 1]);
    // pdf-lib pads the widget /Rect by half the border width, hence the tolerance.
    expect(Math.abs(e - 40)).toBeLessThan(1);
    expect(Math.abs(f - 420)).toBeLessThan(1);
  });

  it('refuses the whole document when a widget appearance cannot be drawn, naming the count', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const form = doc.getForm();
    form.createTextField('a').addToPage(page, { x: 10, y: 10, width: 100, height: 20 });
    form.createTextField('b').addToPage(page, { x: 10, y: 50, width: 100, height: 20 });
    const reloaded = await PDFDocument.load(await doc.save());
    // Undrawable: the /AP /N stream exists (so nothing regenerates it) but has no /BBox.
    const widget = reloaded.context.lookup(reloaded.getPage(0).node.Annots().get(1));
    const normal = reloaded.context.lookup(reloaded.context.lookup(widget.get(PDFName.of('AP'))).get(PDFName.of('N')));
    normal.dict.delete(PDFName.of('BBox'));

    const error = await flattenPdf(await reloaded.save()).catch((e) => e);
    expect(error).toBeInstanceOf(FormFlattenError);
    expect(error.message).toContain('1 of 2');
  });

  it('regenerates a missing appearance for a text field that has a value, then draws it', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const field = doc.getForm().createTextField('name');
    field.setText('Jane');
    field.addToPage(page, { x: 10, y: 10, width: 100, height: 20 });
    const reloaded = await PDFDocument.load(await doc.save());
    reloaded.context.lookup(reloaded.getPage(0).node.Annots().get(0)).delete(PDFName.of('AP'));

    const out = await PDFDocument.load(await flattenPdf(await reloaded.save()));
    expect(annotCount(out)).toBe(0);
    const content = text(getPageContentBytes(out.getPage(0)));
    expect(content).toContain('cm');
    expect(content).toContain('Do');
  });

  it('removes a blank signature widget that has no appearance without failing', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const { context } = doc;
    const sig = context.register(context.obj({
      Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PDFString.of('sig'), Rect: [10, 10, 110, 60], F: 4,
    }));
    page.node.set(PDFName.of('Annots'), context.obj([sig]));
    doc.catalog.set(PDFName.of('AcroForm'), context.obj({ Fields: [sig], SigFlags: 0 }));

    const out = await PDFDocument.load(await flattenPdf(await doc.save()));
    expect(annotCount(out)).toBe(0);
    expect(text(getPageContentBytes(out.getPage(0)))).not.toContain('Do');
  });

  it('skips Hidden annotations without drawing them', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    addAnnot(doc, page, { subtype: 'Stamp', rect: [10, 10, 110, 60], flags: 2 });
    addAnnot(doc, page, { subtype: 'Stamp', rect: [10, 100, 110, 150], flags: 32 });

    const out = await PDFDocument.load(await flattenPdf(await doc.save()));
    expect(text(getPageContentBytes(out.getPage(0)))).not.toContain('Do');
  });

  it('returns a document with nothing to flatten byte for byte', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const bytes = await doc.save();
    expect(await flattenPdf(bytes)).toEqual(bytes);
  });

  it('image mode makes one picture page per source page, with no text or annotations', async () => {
    const source = await PDFDocument.create();
    source.addPage([200, 200]);
    source.addPage([200, 200]);
    const out = await PDFDocument.load(await flattenPdf(await source.save(), { mode: 'image' }));
    expect(out.getPageCount()).toBe(2);
    expect(out.getPage(0).getSize()).toEqual({ width: 120, height: 80 });
    expect(out.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
  });

  it('rejects an unknown mode', async () => {
    await expect(flattenPdf(new Uint8Array(), { mode: 'sepia' })).rejects.toThrow('Unknown flatten mode');
  });
});

describe('appearanceToRectMatrix', () => {
  it('maps the matrix-transformed BBox onto the rect', () => {
    expect(appearanceToRectMatrix([0, 0, 100, 50], [1, 0, 0, 1, 0, 0], [10, 10, 210, 110])).toEqual([2, 0, 0, 2, 10, 10]);
    // A 90 degree appearance matrix swaps the box extents before scaling.
    const m = appearanceToRectMatrix([0, 0, 100, 50], [0, 1, -1, 0, 0, 0], [0, 0, 50, 100]);
    expect(m).toEqual([1, 0, 0, 1, 50, 0]);
  });
});
