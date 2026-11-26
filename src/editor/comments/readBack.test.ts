import { describe, expect, it, vi } from 'vitest';
import { PDFArray, PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { serializeHighlight } from '../registry/highlightPdf.ts';
import { importStandardAnnotations } from './importAnnotations.ts';
import { readBackAnnotations } from './readBack.ts';

// Spy-through: the real reader runs on a real file; the one forced line below is a reader chunk that cannot load.
vi.mock('./importAnnotations.ts', { spy: true });

const toBuffer = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const annotCount = async (bytes: ArrayBuffer) => (await PDFDocument.load(bytes)).getPage(0).node.lookupMaybe(PDFName.of('Annots'), PDFArray)?.size() ?? 0;

describe('readBackAnnotations', () => {
  it('hands back what the reader found', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 100]);
    await serializeHighlight(
      { id: 'h', type: 'highlight', pageIndex: 0, left: 10, top: 10, width: 50, height: 10, color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }] },
      { pdfDoc: doc, page, pdfWidth: 200, pdfHeight: 100, pdfX: 20, pdfY: 90, loadCustomFont: async () => null, baselineOffset: () => 0 } as never,
    );
    const bytes = toBuffer(await doc.save());
    expect(await annotCount(bytes)).toBe(1);

    const found = await readBackAnnotations(bytes);
    expect(importStandardAnnotations).toHaveBeenCalledWith(bytes);
    expect(found.elements).toHaveLength(1);
    expect(found.elements[0]).toMatchObject({ id: 'h', type: 'highlight', color: '#FFF34D' });
    expect(found.bytes).not.toBe(bytes);
    expect(await annotCount(found.bytes)).toBe(0);
  });

  it('opens the file untouched when reading fails', async () => {
    const bytes = new ArrayBuffer(1);
    // Forced: the real importer never throws (it catches every read error itself), so only a chunk that cannot load reaches the catch.
    vi.mocked(importStandardAnnotations).mockRejectedValueOnce(new Error('chunk failed'));
    expect(await readBackAnnotations(bytes)).toEqual({ bytes, elements: [] });
  });
});
