import { describe, expect, it, vi } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from '@cantoo/pdf-lib';
import { serializeHighlight, textCorners } from './highlightPdf.ts';
import type { HighlightElement } from '../model/editorModel.ts';

// READ-11: known ops, one M, one C, one Z per band, so the exact stream is assertable.
vi.mock('../geometry/sketchStroke.ts', () => {
  const ops = (bands: { x: number; y: number; w: number; h: number }[]) => bands.flatMap((b) => [
    ['M', b.x, b.y], ['C', b.x + 1, b.y, b.x + b.w, b.y - 5, b.x + b.w, b.y + b.h], ['Z'],
  ]);
  return { strokeSeed: () => 7, sketchBands: (bands: any[]) => ops(bands), sketchUnderline: (bands: any[]) => ops(bands) };
});

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
    serializeHighlight(element, { pdfDoc, page, pdfWidth: 200, pdfHeight: 100, pdfX: 20, pdfY: 90, comment: { text: 'x', commentedAt: at }, loadCustomFont: async () => null, baselineOffset: () => 0 });
    const annot = pdfDoc.context.lookup(page.node.Annots()!.get(0)) as PDFDict;
    expect((annot.lookup(PDFName.of('M')) as PDFString).asString()).toBe('D:20261031180509Z');
  });

  it('ignores a comment stored on the element: only the context carries it', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 100]);
    serializeHighlight({ ...element, comment: 'old' } as typeof element, { pdfDoc, page, pdfWidth: 200, pdfHeight: 100, pdfX: 20, pdfY: 90, loadCustomFont: async () => null, baselineOffset: () => 0 });
    const annot = pdfDoc.context.lookup(page.node.Annots()!.get(0)) as PDFDict;
    expect(annot.has(PDFName.of('Contents'))).toBe(false);
    expect(annot.has(PDFName.of('Popup'))).toBe(false);
  });

  it('writes /Contents and a /Popup with F 24 from the context comment, and no badge', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 100]);
    serializeHighlight(element, { pdfDoc, page, pdfWidth: 200, pdfHeight: 100, pdfX: 20, pdfY: 90, comment: { text: 'note' }, loadCustomFont: async () => null, baselineOffset: () => 0 });
    const annots = page.node.Annots()!;
    expect(annots.size()).toBe(2);
    const annot = pdfDoc.context.lookup(annots.get(0)) as PDFDict;
    expect(annot.has(PDFName.of('Contents'))).toBe(true);
    expect(annot.get(PDFName.of('F'))).toEqual(PDFNumber.of(4));
    const popup = pdfDoc.context.lookup(annots.get(1)) as PDFDict;
    expect(popup.get(PDFName.of('F'))).toEqual(PDFNumber.of(24));
  });
});

describe('serializeHighlight: opacity and underline', () => {
  const ctx = (pdfDoc: PDFDocument, page: any, extra: Record<string, unknown> = {}) =>
    ({ pdfDoc, page, pdfWidth: 200, pdfHeight: 100, pdfX: 20, pdfY: 90, loadCustomFont: async () => null, baselineOffset: () => 0, ...extra }) as any;
  const numsOf = (pdfDoc: PDFDocument, array: unknown) =>
    (array as PDFArray).asArray().map((n) => (pdfDoc.context.lookup(n) as PDFNumber).asNumber());
  async function write(el: HighlightElement, extra: Record<string, unknown> = {}) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 100]);
    serializeHighlight(el, ctx(pdfDoc, page, extra));
    const annots = page.node.Annots()!;
    const annot = pdfDoc.context.lookup(annots.get(0)) as PDFDict;
    const ap = pdfDoc.context.lookup(annot.get(PDFName.of('AP'))) as PDFDict;
    const stream = pdfDoc.context.lookup(ap.get(PDFName.of('N'))) as any;
    const content = new TextDecoder().decode(stream.getContents());
    return { pdfDoc, page, annot, annots, content, stream };
  }

  it('writes /CA and the appearance at the highlight opacity', async () => {
    const { annot, stream, pdfDoc } = await write({ ...element, opacity: 0.5 });
    expect((annot.get(PDFName.of('Subtype')) as PDFName).toString()).toBe('/Highlight');
    expect((annot.get(PDFName.of('CA')) as PDFNumber).asNumber()).toBe(0.5);
    const resources = pdfDoc.context.lookup(stream.dict.get(PDFName.of('Resources'))) as PDFDict;
    const states = pdfDoc.context.lookup(resources.get(PDFName.of('ExtGState'))) as PDFDict;
    const state = pdfDoc.context.lookup(states.get(states.keys()[0])) as PDFDict;
    expect((state.get(PDFName.of('ca')) as PDFNumber).asNumber()).toBe(0.5);
    expect((state.get(PDFName.of('BM')) as PDFName).toString()).toBe('/Multiply');
  });

  it('writes /CA 1 when there is no opacity', async () => {
    const { annot } = await write(element);
    expect((annot.get(PDFName.of('CA')) as PDFNumber).asNumber()).toBe(1);
  });

  it('writes an /Underline with the same quads and color, and a 3 pt line lifted 1 pt above each band bottom in a deeper ink', async () => {
    const two: HighlightElement = { ...element, style: 'underline', bands: [{ left: 0, top: 0, width: 100, height: 40 }, { left: 0, top: 60, width: 50, height: 40 }] };
    const { annot, pdfDoc, content } = await write(two);
    expect((annot.get(PDFName.of('Subtype')) as PDFName).toString()).toBe('/Underline');
    expect(numsOf(pdfDoc, annot.get(PDFName.of('QuadPoints')))).toEqual([20, 90, 120, 90, 20, 86, 120, 86, 20, 84, 70, 84, 20, 80, 70, 80]);
    expect(numsOf(pdfDoc, annot.get(PDFName.of('C'))).map((v) => Math.round(v * 255))).toEqual([255, 243, 77]);
    expect((annot.get(PDFName.of('CA')) as PDFNumber).asNumber()).toBe(1);
    expect(content).toContain('3 w');
    // ink = band color x 0.72 = #B8AF37
    expect(content).toContain('0.722 0.686 0.216 RG');
    // the line's bottom sits 1 pt above each band's bottom edge, so its center is 1 + 1.5 above it
    expect(content).toContain('20 88.5 m 120 88.5 l S');
    expect(content).toContain('20 82.5 m 70 82.5 l S');
    expect(content).not.toMatch(/\bf\b/);
  });

  it('pairs an underline comment like a highlight comment: /Contents, /M and /Popup', async () => {
    const { annot, annots, pdfDoc } = await write({ ...element, style: 'underline' }, { comment: { text: 'note', commentedAt: Date.UTC(2026, 9, 31, 18, 5, 9) } });
    expect(annots.size()).toBe(2);
    expect(annot.has(PDFName.of('Contents'))).toBe(true);
    expect((annot.lookup(PDFName.of('M')) as PDFString).asString()).toBe('D:20261031180509Z');
    const popup = pdfDoc.context.lookup(annot.get(PDFName.of('Popup'))) as PDFDict;
    expect((popup.get(PDFName.of('Subtype')) as PDFName).toString()).toBe('/Popup');
  });

  it('READ-04: writes the underline width as /BS /W and in the appearance, and none for the default or a highlight', async () => {
    const { annot, content } = await write({ ...element, style: 'underline', strokeWidth: 4 });
    const bs = annot.lookup(PDFName.of('BS'), PDFDict);
    expect((bs.get(PDFName.of('W')) as PDFNumber).asNumber()).toBe(4);
    expect(content).toContain('4 w');
    const plain = await write({ ...element, style: 'underline' });
    expect(plain.content).toContain('3 w');
    expect((plain.annot.lookup(PDFName.of('BS'), PDFDict).get(PDFName.of('W')) as PDFNumber).asNumber()).toBe(3);
    expect((await write(element)).annot.has(PDFName.of('BS'))).toBe(false);
  });

  it('applies the opacity to an underline too', async () => {
    const { annot } = await write({ ...element, style: 'underline', opacity: 0.6 });
    expect((annot.get(PDFName.of('CA')) as PDFNumber).asNumber()).toBe(0.6);
  });
});

describe('textCorners', () => {
  const corners = [[0, 1], [2, 1], [0, 0], [2, 0]] as [number, number][];
  const [ul, ur, ll, lr] = corners;
  it.each([
    [0, [ul, ur, ll, lr]],
    [1, [ur, lr, ul, ll]],
    [2, [lr, ll, ur, ul]],
    [3, [ll, ul, lr, ur]],
  ] as const)('puts the corners in the text\'s own order after %i turns', (turns, want) => {
    expect(textCorners(corners, turns)).toEqual(want);
  });
});

describe('serializeHighlight: a turned page', () => {
  const band: HighlightElement = { ...element, style: 'underline' };
  async function content(quarterTurns?: 0 | 1 | 2 | 3) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 100]);
    serializeHighlight(band, { pdfDoc, page, pdfWidth: 200, pdfHeight: 100, pdfX: 20, pdfY: 90, quarterTurns, loadCustomFont: async () => null, baselineOffset: () => 0 } as any);
    const annot = pdfDoc.context.lookup(page.node.Annots()!.get(0)) as PDFDict;
    const ap = pdfDoc.context.lookup(annot.get(PDFName.of('AP'))) as PDFDict;
    return new TextDecoder().decode((pdfDoc.context.lookup(ap.get(PDFName.of('N'))) as any).getContents());
  }
  it('strokes the underline along the displayed left edge after one turn, and still along the bottom with none', async () => {
    expect(await content(1)).toContain('22.5 90 m 22.5 80 l S');
    expect(await content(0)).toContain('20 82.5 m 120 82.5 l S');
  });
});

describe('serializeHighlight: READ-11 sketched stroke', () => {
  async function write(el: HighlightElement) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 100]);
    serializeHighlight(el, { pdfDoc, page, pdfWidth: 200, pdfHeight: 100, pdfX: 20, pdfY: 90, loadCustomFont: async () => null, baselineOffset: () => 0 } as any);
    const annot = pdfDoc.context.lookup(page.node.Annots()!.get(0)) as PDFDict;
    const ap = pdfDoc.context.lookup(annot.get(PDFName.of('AP'))) as PDFDict;
    const stream = pdfDoc.context.lookup(ap.get(PDFName.of('N'))) as any;
    const nums = (a: unknown) => (a as PDFArray).asArray().map((n) => (n as PDFNumber).asNumber());
    return { annot, content: new TextDecoder().decode(stream.getContents()), rect: nums(annot.get(PDFName.of('Rect'))), bbox: nums(stream.dict.get(PDFName.of('BBox'))), quad: nums(annot.get(PDFName.of('QuadPoints'))) };
  }

  it('keeps a clean mark byte-identical', async () => {
    expect((await write(element)).content).toBe('/GS gs\n1 0.953 0.302 rg\n20 90 m 120 90 l 120 80 l 20 80 l h f');
    expect((await write({ ...element, style: 'underline' })).content)
      .toBe('/GS gs\n3 w 0.722 0.686 0.216 RG\n20 82.5 m 120 82.5 l S');
  });

  it('draws a sketched highlight as m, c, h and one trailing f, with no line-to', async () => {
    const { content } = await write({ ...element, stroke: 'sketch' });
    expect(content).toBe('/GS gs\n1 0.953 0.302 rg\n20 90 m 21 90 120 95 120 80 c h f');
    expect(content).not.toContain(' l ');
    expect(content.match(/\bf\b/g)).toHaveLength(1);
  });

  it('fills a sketched underline in the underline ink, with no stroke', async () => {
    const { content } = await write({ ...element, style: 'underline', stroke: 'sketch' });
    expect(content).toContain('0.722 0.686 0.216 rg');
    expect(content).not.toMatch(/RG|\bw\b|\bS\b/);
    expect(content).toMatch(/ c h f$/);
  });

  it('grows the Rect and BBox to the path and leaves the quads as the text bands', async () => {
    const { rect, bbox, quad } = await write({ ...element, stroke: 'sketch' });
    // the control point y 95 lies above the quad top, 90
    expect(rect).toEqual([20, 80, 120, 95]);
    expect(bbox).toEqual(rect);
    expect(quad).toEqual([20, 90, 120, 90, 20, 80, 120, 80]);
  });
});
