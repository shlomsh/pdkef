import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber } from '@cantoo/pdf-lib';
import { serializeHighlight } from './highlightPdf.ts';
import type { HighlightElement } from '../model/editorModel.ts';

const element: HighlightElement = {
  id: 'h', type: 'highlight', pageIndex: 0, left: 10, top: 10, width: 50, height: 10, color: '#FFF34D',
  bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};

describe('serializeHighlight', () => {
  it('without a page geometry, places the quad in editor space as is', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 100]);
    serializeHighlight(element, { pdfDoc, page, pdfWidth: 200, pdfHeight: 100, pdfX: 20, pdfY: 90, loadCustomFont: async () => null, baselineOffset: () => 0 });
    const annot = pdfDoc.context.lookup(page.node.Annots()!.get(0)) as PDFDict;
    const quad = (annot.lookup(PDFName.of('QuadPoints'), PDFArray)).asArray().map((n) => (n as PDFNumber).asNumber());
    expect(quad).toEqual([20, 90, 120, 90, 20, 80, 120, 80]);
  });
});
