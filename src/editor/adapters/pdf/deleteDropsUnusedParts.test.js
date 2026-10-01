// RED-49: a Delete save carries nothing unreachable, including leftovers the
// SOURCE file already had (an old revision, an orphaned stream).
import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFHexString, PDFString, PDFStream, StandardFonts, decodePDFRawStream } from '@cantoo/pdf-lib';
import { deleteObjectsFromPdf, listDeletableObjects, buildDeletePreviewPage } from './deleteObjects.js';
import { unreachableRefs } from './reachability.js';

const decoder = new TextDecoder();

async function buildSource() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('GoneWord', { x: 72, y: 700, size: 12, font });
  page.drawText('KeepWord', { x: 72, y: 680, size: 12, font });
  doc.context.register(doc.context.stream('BT /F1 12 Tf (LeftoverSecret) Tj ET'));
  doc.context.register(doc.context.obj({ Contents: PDFString.of('LeftoverNote') }));
  return doc.save({ useObjectStreams: false });
}

/** Every decoded stream and every string value of the saved file. */
async function everyText(bytes) {
  const doc = await PDFDocument.load(bytes);
  const out = [];
  const visit = (v) => {
    if (v instanceof PDFString || v instanceof PDFHexString) out.push(v.decodeText());
    else if (v?.entries) for (const [, e] of v.entries()) visit(e);
    else if (v?.asArray) v.asArray().forEach(visit);
  };
  for (const [, o] of doc.context.enumerateIndirectObjects()) {
    if (o instanceof PDFStream) {
      try {
        out.push(decoder.decode(decodePDFRawStream(o).decode()));
      } catch { /* not decodable */ }
      visit(o.dict);
    } else visit(o);
  }
  return out.join('\n');
}

describe('delete drops unused parts of the source', () => {
  it('seeds the leftovers into the source', async () => {
    const source = await buildSource();
    expect(unreachableRefs(await PDFDocument.load(source)).length).toBe(2);
    expect(new TextDecoder('latin1').decode(source)).toContain('LeftoverNote');
  });

  it('export leaves neither leftover and nothing unreachable', async () => {
    const source = await buildSource();
    const target = (await listDeletableObjects(source)).find((o) => o.preview?.includes('GoneWord'));
    const out = new Uint8Array(await (await deleteObjectsFromPdf(source, [target])).arrayBuffer());
    const text = await everyText(out);
    expect(text).not.toContain('LeftoverSecret');
    expect(text).not.toContain('LeftoverNote');
    expect(text).not.toContain('GoneWord');
    expect(unreachableRefs(await PDFDocument.load(out))).toEqual([]);
  });

  it('the preview page leaves no leftover either', async () => {
    const source = await buildSource();
    const target = (await listDeletableObjects(source)).find((o) => o.preview?.includes('GoneWord'));
    const sourceDoc = await PDFDocument.load(source);
    const out = await buildDeletePreviewPage(sourceDoc, 0, [target]);
    const text = await everyText(out);
    expect(text).not.toContain('LeftoverSecret');
    expect(unreachableRefs(await PDFDocument.load(out))).toEqual([]);
  });
});
