import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from '@cantoo/pdf-lib';
import { serializeHighlight } from './highlightPdf.ts';
import { createPageGeometry } from '../geometry/coords.ts';
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

  it("writes the comment's own date as /M", async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 100]);
    const at = Date.UTC(2026, 9, 31, 18, 5, 9);
    serializeHighlight({ ...element, comment: 'x', commentedAt: at }, { pdfDoc, page, pdfWidth: 200, pdfHeight: 100, pdfX: 20, pdfY: 90, loadCustomFont: async () => null, baselineOffset: () => 0 });
    const annot = pdfDoc.context.lookup(page.node.Annots()!.get(0)) as PDFDict;
    expect((annot.lookup(PDFName.of('M')) as PDFString).asString()).toBe('D:20261031180509Z');
  });

  it('draws the comment number upright on a turned page', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 100]);
    page.setRotation({ type: 'degrees' as any, angle: 90 } as any);
    const pageGeometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 200, height: 100 }, rotation: 90 });
    serializeHighlight(element, { pdfDoc, page, pdfWidth: pageGeometry.width, pdfHeight: pageGeometry.height, pdfX: 0, pdfY: pageGeometry.height, pageGeometry, commentNumber: 1, loadCustomFont: async () => null, baselineOffset: () => 0 });
    const badge = pdfDoc.context.lookup(page.node.Annots()!.get(1)) as PDFDict;
    const rect = (badge.lookup(PDFName.of('Rect'), PDFArray)).asArray().map((n) => (n as PDFNumber).asNumber());
    const ap = (badge.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N')) as any);
    const nums = (key: string) => ((ap.dict ?? ap).lookup(PDFName.of(key), PDFArray)).asArray().map((n: any) => n.asNumber());
    const [a, b, c, d] = nums('Matrix');
    const [ea, eb] = pageGeometry.editorToPdf;
    expect([a, b]).toEqual([ea, eb]);
    expect([a, b]).not.toEqual([1, 0]);
    const [x0, y0, x1, y1] = nums('BBox');
    const xs = [x0, x1].flatMap((x) => [y0, y1].map((y) => a * x + c * y));
    const ys = [x0, x1].flatMap((x) => [y0, y1].map((y) => b * x + d * y));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(rect[2] - rect[0], 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(rect[3] - rect[1], 3);
  });
});
