import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, StandardFonts } from '@cantoo/pdf-lib';
import { extractPageObjects, getPageContentBytes } from './pdfObjects.js';
import { deleteObjectsFromPdf } from './deleteObjects.js';

const decode = (bytes) => new TextDecoder().decode(bytes);

/** One page with Helvetica as /F1 and, when `forms` names any, Form XObjects (each also gets /F1). */
async function build(content, forms = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { context } = doc;
  const page = doc.addPage([600, 800]);
  const xobjects = {};
  for (const [name, stream] of Object.entries(forms)) {
    xobjects[name] = context.register(context.stream(stream, {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 600, 800], Resources: { Font: { F1: font.ref } },
    }));
  }
  page.node.set(PDFName.of('Resources'), context.obj({ Font: { F1: font.ref }, XObject: xobjects }));
  page.node.set(PDFName.of('Contents'), context.register(context.flateStream(content)));
  return new Uint8Array(await doc.save({ useObjectStreams: false }));
}

const objectsOf = async (bytes) => extractPageObjects((await PDFDocument.load(bytes)).getPage(0), 0).objects;

const contentAfterDelete = async (bytes, target) => {
  const saved = new Uint8Array(await (await deleteObjectsFromPdf(bytes, [target])).arrayBuffer());
  const doc = await PDFDocument.load(saved);
  return { text: decode(getPageContentBytes(doc.getPage(0))), objects: extractPageObjects(doc.getPage(0), 0).objects };
};

describe('text in an enclosing marked-content dict (RED-55)', () => {
  it('deleting the text also empties the ActualText it sits in', async () => {
    const bytes = await build('q /Span <</ActualText (SECRETNAME)>> BDC BT /F1 12 Tf 1 0 0 1 50 700 Tm (S) Tj (E) Tj ET EMC Q');
    const [unit] = (await objectsOf(bytes)).filter((o) => o.kind === 'text');
    const { text, objects } = await contentAfterDelete(bytes, unit);
    expect(text).not.toContain('SECRETNAME');
    expect(objects.filter((o) => o.kind === 'text')).toEqual([]);
  });

  it('keeps the other text object of the same BDC, with its glyphs, while the dict goes', async () => {
    const bytes = await build('/Span <</ActualText (SECRETNAME)>> BDC BT /F1 12 Tf 1 0 0 1 50 700 Tm (gone) Tj ET BT /F1 12 Tf 1 0 0 1 50 600 Tm (kept) Tj ET EMC');
    const units = (await objectsOf(bytes)).filter((o) => o.kind === 'text');
    expect(units).toHaveLength(2);
    const { text, objects } = await contentAfterDelete(bytes, units[0]);
    expect(text).not.toContain('SECRETNAME');
    expect(text).toContain('(kept)');
    expect(text).not.toContain('(gone)');
    expect(objects.filter((o) => o.kind === 'text')).toHaveLength(1);
  });
});

describe('mark state across streams (RED-55)', () => {
  const text = (at, s) => `BT /F1 12 Tf 1 0 0 1 50 ${at} Tm (${s}) Tj ET`;
  const offered = (objects) => objects.filter((o) => o.kind === 'text');

  it('an EMC inside a Form cannot close a page-level mark, and both texts stay normal units', async () => {
    const bytes = await build(`/PDkef BMC /Fm1 Do EMC ${text(700, 'after')}`, { Fm1: `0 0 10 10 re f EMC ${text(100, 'formtext')}` });
    const objects = await objectsOf(bytes);
    expect(objects.filter((o) => o.kind === 'mark')).toEqual([]);
    expect(offered(objects)).toHaveLength(2);
    // The page's unit reads `after` in the page stream, the Form's keeps its own offsets.
    expect(offered(objects).map((o) => o.formPath.length).sort()).toEqual([0, 1]);
  });

  it('a mark never closed in its stream offers its text as normal units', async () => {
    const bytes = await build(`/PDkef BMC ${text(700, 'open')} ${text(600, 'also')}`);
    const objects = await objectsOf(bytes);
    expect(objects.filter((o) => o.kind === 'mark')).toEqual([]);
    expect(offered(objects)).toHaveLength(2);
  });

  it('a mark that draws a Form is not a mark; the Form text is a normal unit', async () => {
    const bytes = await build('/PDkef BMC /Fm1 Do EMC', { Fm1: text(100, 'formtext') });
    const objects = await objectsOf(bytes);
    expect(objects.map((o) => o.kind)).toEqual(['text']);
    expect(objects[0].formPath).toHaveLength(1);
  });
});
