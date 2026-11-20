import { describe, expect, it, vi } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from '@cantoo/pdf-lib';
import { serializeHighlight, textCorners } from './highlightPdf.ts';
import { sketchBands, sketchUnderline } from '../geometry/sketchStroke.ts';
import type { HighlightElement } from '../model/editorModel.ts';

// READ-11: spy-through, the real sketch functions run and the spies show what the writer handed them.
vi.mock('../geometry/sketchStroke.ts', { spy: true });

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
    await serializeHighlight(el, ctx(pdfDoc, page, extra));
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

  it('READ-14: a pencil mark stays a /Highlight and carries /PDkefStyle /Pencil for our own reader; others carry none', async () => {
    const { annot } = await write({ ...element, style: 'pencil' });
    expect((annot.get(PDFName.of('Subtype')) as PDFName).toString()).toBe('/Highlight');
    expect((annot.get(PDFName.of('PDkefStyle')) as PDFName).toString()).toBe('/Pencil');
    expect((await write(element)).annot.get(PDFName.of('PDkefStyle'))).toBeUndefined();
    expect((await write({ ...element, style: 'underline' })).annot.get(PDFName.of('PDkefStyle'))).toBeUndefined();
  });

  describe('READ-14: the pencil hatch in the appearance stream', () => {
    const pencil: HighlightElement = { ...element, style: 'pencil', opacity: 0.6, bands: [{ left: 0, top: 0, width: 100, height: 40 }, { left: 0, top: 60, width: 60, height: 40 }] };
    // serializeHighlight loads rough.js on first use, so the stream is only there once its promise has settled.
    const written = async (el: HighlightElement, extra: Record<string, unknown> = {}) => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([200, 100]);
      await serializeHighlight(el, ctx(pdfDoc, page, extra));
      const annot = pdfDoc.context.lookup(page.node.Annots()!.get(0)) as PDFDict;
      const stream = pdfDoc.context.lookup((pdfDoc.context.lookup(annot.get(PDFName.of('AP'))) as PDFDict).get(PDFName.of('N'))) as any;
      return { annot, content: new TextDecoder().decode(stream.getContents()), stream, pdfDoc };
    };

    it('strokes the hatch in the mark color at 1.6 pt, and fills nothing', async () => {
      const { content } = await written(pencil);
      expect(content).toContain('/GS gs');
      expect(content).toMatch(/1\.6 w 1 J 1 0\.95\d* 0\.30\d* RG/);
      expect(content).toContain(' m');
      expect(content).toContain(' c');
      expect(content.trim().endsWith('S')).toBe(true);
      expect(content).not.toMatch(/ f\b/);
    });

    it('is still a standard /Highlight with the quads of the bands, and multiplies', async () => {
      const { annot, stream, pdfDoc } = await written(pencil);
      expect((annot.get(PDFName.of('Subtype')) as PDFName).toString()).toBe('/Highlight');
      expect((annot.lookup(PDFName.of('QuadPoints'), PDFArray)).asArray()).toHaveLength(16);
      const resources = pdfDoc.context.lookup(stream.dict.get(PDFName.of('Resources'))) as PDFDict;
      const states = pdfDoc.context.lookup(resources.get(PDFName.of('ExtGState'))) as PDFDict;
      const state = pdfDoc.context.lookup(states.get(states.keys()[0])) as PDFDict;
      expect((state.get(PDFName.of('BM')) as PDFName).toString()).toBe('/Multiply');
      expect((state.get(PDFName.of('ca')) as PDFNumber).asNumber()).toBe(0.6);
    });

    it('hatches the same every time for the same id, and differently for another', async () => {
      const first = (await written(pencil)).content;
      expect((await written(pencil)).content).toBe(first);
      expect((await written({ ...pencil, id: 'other' })).content).not.toBe(first);
    });

    it('hatches in the displayed orientation: a turned page maps the same strokes through the page matrix', async () => {
      const upright = (await written(pencil)).content;
      // editor (x, y) -> user (-y, x): a quarter turn
      const turned = (await written(pencil, { pageGeometry: { editorToPdf: [0, 1, -1, 0, 0, 0] } })).content;
      const firstMove = (text: string) => text.match(/(-?[\d.]+) (-?[\d.]+) m/)!.slice(1).map(Number);
      const [x, y] = firstMove(upright);
      const [tx, ty] = firstMove(turned);
      expect(tx).toBeCloseTo(-y, 1);
      expect(ty).toBeCloseTo(x, 1);
    });

    it('lets the appearance grow to hold the strokes that wobble past the band', async () => {
      const { annot } = await written(pencil);
      const rect = (annot.lookup(PDFName.of('Rect'), PDFArray)).asArray().map((n) => (n as PDFNumber).asNumber());
      const quad = (annot.lookup(PDFName.of('QuadPoints'), PDFArray)).asArray().map((n) => (n as PDFNumber).asNumber());
      const xs = quad.filter((_, i) => i % 2 === 0), ys = quad.filter((_, i) => i % 2 === 1);
      expect(rect[0]).toBeLessThanOrEqual(Math.min(...xs));
      expect(rect[2]).toBeGreaterThanOrEqual(Math.max(...xs));
      expect(rect[1]).toBeLessThanOrEqual(Math.min(...ys));
      expect(rect[3]).toBeGreaterThanOrEqual(Math.max(...ys));
    });
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

  // The one band the writer hands the sketch functions, and the seed for the id 'h'; the paths below are the
  // real output of the real sketch functions for them (content stream tail, fill operator included), captured once.
  const BAND = [{ x: 20, y: -90, w: 100, h: 10 }];
  const SEED = 3977000791;
  const HIGHLIGHT_STREAM = "17.31 79.35 m 17.05 79.68 17.01 80.34 16.94 81.21 c 16.87 82.07 16.66 83.45 16.9 84.55 c 17.13 85.65 17.85 86.96 18.34 87.8 c 18.83 88.65 19.38 89.28 19.83 89.61 c 20.29 89.94 20.18 89.73 21.07 89.78 c 21.96 89.82 23.82 89.85 25.19 89.87 c 26.56 89.89 27.93 89.89 29.31 89.89 c 30.68 89.89 32.05 89.87 33.42 89.87 c 34.8 89.87 36.17 89.86 37.54 89.87 c 38.92 89.89 40.29 89.92 41.66 89.97 c 43.03 90.02 44.41 90.13 45.78 90.17 c 47.15 90.21 48.52 90.21 49.9 90.21 c 51.27 90.2 52.64 90.15 54.01 90.15 c 55.39 90.15 56.76 90.2 58.13 90.21 c 59.5 90.22 60.88 90.19 62.25 90.21 c 63.62 90.23 65 90.26 66.37 90.31 c 67.74 90.36 69.11 90.49 70.49 90.51 c 71.86 90.53 73.23 90.45 74.6 90.44 c 75.98 90.43 77.35 90.43 78.72 90.44 c 80.09 90.45 81.47 90.47 82.84 90.49 c 84.21 90.51 85.58 90.53 86.96 90.57 c 88.33 90.6 89.7 90.68 91.08 90.69 c 92.45 90.7 93.82 90.64 95.19 90.61 c 96.57 90.59 97.94 90.55 99.31 90.54 c 100.68 90.52 102.06 90.55 103.43 90.54 c 104.8 90.53 106.17 90.5 107.55 90.48 c 108.92 90.46 110.29 90.44 111.67 90.42 c 113.04 90.41 114.41 90.38 115.78 90.41 c 117.16 90.44 118.53 90.6 119.9 90.6 c 121.27 90.61 123.14 90.5 124.02 90.44 c 124.9 90.38 124.93 90.59 125.18 90.25 c 125.43 89.91 125.49 89.21 125.52 88.41 c 125.56 87.6 125.61 86.43 125.38 85.42 c 125.15 84.4 124.6 83.13 124.15 82.32 c 123.69 81.52 123.11 80.9 122.66 80.58 c 122.2 80.26 122.31 80.45 121.42 80.41 c 120.52 80.37 118.67 80.33 117.3 80.32 c 115.93 80.3 114.55 80.31 113.18 80.32 c 111.81 80.33 110.43 80.34 109.06 80.36 c 107.69 80.38 106.32 80.39 104.94 80.43 c 103.57 80.47 102.2 80.6 100.83 80.61 c 99.45 80.62 98.08 80.52 96.71 80.51 c 95.34 80.49 93.96 80.5 92.59 80.51 c 91.22 80.52 89.85 80.56 88.47 80.56 c 87.1 80.57 85.73 80.54 84.35 80.56 c 82.98 80.57 81.61 80.63 80.24 80.65 c 78.86 80.68 77.49 80.7 76.12 80.71 c 74.75 80.73 73.37 80.75 72 80.75 c 70.63 80.74 69.26 80.71 67.88 80.71 c 66.51 80.7 65.14 80.72 63.77 80.72 c 62.39 80.71 61.02 80.7 59.65 80.67 c 58.27 80.64 56.9 80.58 55.53 80.54 c 54.16 80.5 52.78 80.44 51.41 80.43 c 50.04 80.42 48.67 80.48 47.29 80.49 c 45.92 80.5 44.55 80.51 43.18 80.47 c 41.8 80.44 40.43 80.37 39.06 80.28 c 37.68 80.19 36.31 80.03 34.94 79.95 c 33.57 79.87 32.19 79.85 30.82 79.8 c 29.45 79.75 28.08 79.73 26.7 79.64 c 25.33 79.55 23.96 79.32 22.59 79.25 c 21.21 79.18 19.35 79.19 18.47 79.2 c 17.59 79.22 17.56 79.01 17.31 79.35 c h f";
  const UNDERLINE_STREAM = "17.11 82.22 m 17.11 82.64 17.67 83.2 18.46 83.46 c 19.25 83.72 20.73 83.71 21.87 83.79 c 23.01 83.87 24.14 83.92 25.28 83.95 c 26.42 83.98 27.55 83.98 28.69 83.99 c 29.82 84 30.96 84.01 32.1 84.02 c 33.23 84.04 34.37 84.04 35.51 84.05 c 36.64 84.06 37.78 84.07 38.92 84.07 c 40.05 84.07 41.19 84.07 42.33 84.07 c 43.46 84.07 44.6 84.06 45.74 84.05 c 46.87 84.04 48.01 84.02 49.15 84.01 c 50.28 83.99 51.42 83.98 52.55 83.97 c 53.69 83.96 54.83 83.95 55.96 83.95 c 57.1 83.95 58.24 83.95 59.37 83.96 c 60.51 83.97 61.65 83.99 62.78 84.01 c 63.92 84.03 65.06 84.05 66.19 84.08 c 67.33 84.1 68.47 84.13 69.6 84.15 c 70.74 84.18 71.88 84.21 73.01 84.23 c 74.15 84.25 75.29 84.27 76.42 84.29 c 77.56 84.31 78.69 84.32 79.83 84.33 c 80.97 84.33 82.1 84.33 83.24 84.33 c 84.38 84.33 85.51 84.32 86.65 84.31 c 87.79 84.3 88.92 84.28 90.06 84.27 c 91.2 84.25 92.33 84.23 93.47 84.22 c 94.61 84.2 95.74 84.19 96.88 84.18 c 98.02 84.17 99.15 84.16 100.29 84.15 c 101.42 84.15 102.56 84.16 103.7 84.16 c 104.83 84.16 105.97 84.18 107.11 84.16 c 108.24 84.14 109.38 84.1 110.52 84.06 c 111.65 84.02 112.79 83.94 113.93 83.9 c 115.06 83.86 116.2 83.76 117.34 83.82 c 118.47 83.88 119.61 84.11 120.75 84.26 c 121.88 84.41 123.44 84.77 124.15 84.72 c 124.87 84.67 125.05 84.22 125.05 83.98 c 125.05 83.73 124.87 83.45 124.15 83.23 c 123.44 83.01 121.88 82.87 120.75 82.65 c 119.61 82.43 118.47 82.08 117.34 81.9 c 116.2 81.72 115.06 81.67 113.93 81.58 c 112.79 81.49 111.65 81.43 110.52 81.36 c 109.38 81.3 108.24 81.25 107.11 81.21 c 105.97 81.18 104.83 81.18 103.7 81.17 c 102.56 81.16 101.42 81.16 100.29 81.15 c 99.15 81.14 98.02 81.12 96.88 81.11 c 95.74 81.1 94.61 81.08 93.47 81.06 c 92.33 81.05 91.2 81.03 90.06 81.02 c 88.92 81 87.79 80.99 86.65 80.98 c 85.51 80.97 84.38 80.96 83.24 80.96 c 82.1 80.95 80.97 80.95 79.83 80.96 c 78.69 80.96 77.56 80.97 76.42 80.98 c 75.29 80.99 74.15 81.01 73.01 81.02 c 71.88 81.04 70.74 81.05 69.6 81.06 c 68.47 81.07 67.33 81.08 66.19 81.08 c 65.06 81.09 63.92 81.08 62.78 81.08 c 61.65 81.07 60.51 81.05 59.37 81.03 c 58.24 81.01 57.1 80.98 55.96 80.95 c 54.83 80.91 53.69 80.87 52.55 80.83 c 51.42 80.79 50.28 80.75 49.15 80.71 c 48.01 80.67 46.87 80.63 45.74 80.59 c 44.6 80.56 43.46 80.53 42.33 80.52 c 41.19 80.5 40.05 80.49 38.92 80.49 c 37.78 80.49 36.64 80.49 35.51 80.5 c 34.37 80.5 33.23 80.51 32.1 80.52 c 30.96 80.53 29.82 80.55 28.69 80.56 c 27.55 80.57 26.42 80.56 25.28 80.59 c 24.14 80.61 23.01 80.65 21.87 80.71 c 20.73 80.78 19.25 80.74 18.46 80.99 c 17.67 81.24 17.11 81.81 17.11 82.22 c h f";

  it('draws a sketched highlight as m, c, h and one trailing f, with no line-to', async () => {
    const { content } = await write({ ...element, stroke: 'sketch' });
    expect(sketchBands).toHaveBeenCalledWith(BAND, SEED, 0);
    expect(content).toBe(`/GS gs\n1 0.953 0.302 rg\n${HIGHLIGHT_STREAM}`);
    expect(content).toMatch(/ m .* c .* h f$/);
    expect(content).not.toContain(' l ');
    expect(content.match(/\bf\b/g)).toHaveLength(1);
  });

  it('fills a sketched underline in the underline ink, with no stroke', async () => {
    const { content } = await write({ ...element, style: 'underline', stroke: 'sketch' });
    expect(sketchUnderline).toHaveBeenCalledWith(BAND, SEED, 3, 0);
    expect(content).toContain('0.722 0.686 0.216 rg');
    expect(content).toBe(`/GS gs\n0.722 0.686 0.216 rg\n${UNDERLINE_STREAM}`);
    expect(content).not.toMatch(/RG|\bw\b|\bS\b/);
    expect(content).toMatch(/ c h f$/);
  });

  it('grows the Rect and BBox to the path and leaves the quads as the text bands', async () => {
    const { rect, bbox, quad } = await write({ ...element, stroke: 'sketch' });
    // the quad is the text band, 20..120 by 80..90; the Rect is that band and every point of the real path
    expect(rect).toEqual([16.66, 79.01, 125.61, 90.7]);
    expect(rect[0]).toBeLessThanOrEqual(20);
    expect(rect[2]).toBeGreaterThanOrEqual(120);
    expect(bbox).toEqual(rect);
    expect(quad).toEqual([20, 90, 120, 90, 20, 80, 120, 80]);
  });
});
