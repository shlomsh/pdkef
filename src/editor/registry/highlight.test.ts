import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFStream, degrees } from '@cantoo/pdf-lib';
import { applyAffineTransform, createPageGeometry } from '../geometry/coords.ts';
import { hexToRgbFractions } from '../text/imageTint.js';
import { getElementDefinition } from './index.ts';
import { validateDraftElements } from './draftValidation.ts';
import type { HighlightElement } from '../model/editorModel.ts';

const definition = getElementDefinition('highlight');
const good: HighlightElement = {
  id: 'h-1', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 50, height: 10, color: '#FFF34D',
  bands: [{ left: 0, top: 0, width: 100, height: 40 }, { left: 0, top: 60, width: 50, height: 40 }],
};

describe('highlight definition', () => {
  it('accepts a valid highlight', () => {
    expect(definition.schema(good)).toBe(true);
  });

  it('rejects bad bands', () => {
    expect(definition.schema({ ...good, bands: [] })).toBe(false);
    expect(definition.schema({ ...good, bands: 'x' })).toBe(false);
    expect(definition.schema({ ...good, bands: Array(201).fill(good.bands[0]) })).toBe(false);
    expect(definition.schema({ ...good, bands: [{ left: 0, top: 0, width: NaN, height: 5 }] })).toBe(false);
    expect(definition.schema({ ...good, bands: [{ left: 0, top: 0, width: -1, height: 5 }] })).toBe(false);
    expect(definition.schema({ ...good, bands: [{ left: 0, top: 200, width: 5, height: 5 }] })).toBe(false);
    expect(definition.schema({ ...good, bands: [{ left: 0, top: 0, width: 5 }] })).toBe(false);
    expect(definition.schema({ ...good, color: undefined })).toBe(false);
  });

  it('keeps an old draft without style or opacity valid, and checks the new fields', () => {
    expect(definition.schema(good)).toBe(true);
    expect(definition.schema({ ...good, style: 'underline' })).toBe(true);
    expect(definition.schema({ ...good, opacity: 0.3 })).toBe(true);
    expect(definition.schema({ ...good, opacity: 1 })).toBe(true);
    expect(definition.schema({ ...good, opacity: 0.2 })).toBe(false);
    expect(definition.schema({ ...good, opacity: 1.1 })).toBe(false);
    expect(definition.schema({ ...good, opacity: '0.5' })).toBe(false);
    expect(definition.schema({ ...good, style: 'strike' })).toBe(false);
    const { valid, droppedCount } = validateDraftElements([good, { ...good, id: 'u', style: 'underline', opacity: 0.5 }, { ...good, id: 'x', opacity: 0.2 }, { ...good, id: 'y', style: 'strike' }]);
    expect(valid.map((e) => e.id)).toEqual(['h-1', 'u']);
    expect(droppedCount).toBe(2);
  });

  it('survives validateDraftElements', () => {
    const { valid, droppedCount } = validateDraftElements([good]);
    expect(valid).toEqual([good]);
    expect(droppedCount).toBe(0);
  });

  it('creates an empty seed in the given or the default color', () => {
    const base = { id: 'h', pageIndex: 1, point: { left: 5, top: 6 }, color: '#000000', whiteoutColor: '#ffffff', strokeWidth: 3, font: 'Arimo', fontSize: 12, direction: null };
    expect(definition.creation.create!({ ...base, highlightColor: '#9CF27A' })).toMatchObject({ type: 'highlight', left: 5, top: 6, width: 0, height: 0, color: '#9CF27A', bands: [] });
    expect(definition.creation.create!(base)).toMatchObject({ color: '#FFF34D' });
  });

  it('has no resize handles', () => {
    expect(definition.resizeBehavior.handles).toEqual([]);
  });

  describe('serialize: a standard /Highlight annotation', () => {
    const ctxFor = (pdfDoc: PDFDocument, page: any, extra: Record<string, unknown> = {}) =>
      ({ pdfDoc, page, pdfWidth: 200, pdfHeight: 400, pdfX: 20, pdfY: 320, ...extra }) as any;
    const annotsOf = (pdfDoc: PDFDocument, page: any): PDFDict[] => {
      const annots = page.node.Annots();
      return Array.from({ length: annots?.size() ?? 0 }, (_, i) => pdfDoc.context.lookup(annots.get(i)) as PDFDict);
    };
    const subtypeOf = (annot: PDFDict, kind: string) => annot.get(PDFName.of('Subtype'))?.toString() === `/${kind}`;
    const nums = (pdfDoc: PDFDocument, array: unknown) =>
      Array.from({ length: (array as PDFArray).size() }, (_, i) => (pdfDoc.context.lookup((array as PDFArray).get(i)) as PDFNumber).asNumber());

    async function run(element: HighlightElement, extra: Record<string, unknown> = {}) {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([200, 400]);
      await definition.serialize(element, ctxFor(pdfDoc, page, extra));
      return { pdfDoc, page, annots: annotsOf(pdfDoc, page) };
    }

    it('writes one /Highlight with quads, color, print flag and no page content', async () => {
      const { pdfDoc, page, annots } = await run({ ...good, id: 'h-1' });
      expect(annots).toHaveLength(1);
      const [highlight] = annots;
      expect(subtypeOf(highlight, 'Highlight')).toBe(true);
      expect(nums(pdfDoc, highlight.get(PDFName.of('QuadPoints')))).toEqual([
        20, 320, 120, 320, 20, 304, 120, 304,
        20, 296, 70, 296, 20, 280, 70, 280,
      ]);
      expect(nums(pdfDoc, highlight.get(PDFName.of('C')))).toEqual(Object.values(hexToRgbFractions('#FFF34D', '#000000')).slice(0, 3));
      expect((highlight.get(PDFName.of('F')) as PDFNumber).asNumber()).toBe(4);
      expect((highlight.get(PDFName.of('CA')) as PDFNumber).asNumber()).toBe(1);
      expect(nums(pdfDoc, highlight.get(PDFName.of('Rect')))).toEqual([20, 280, 120, 320]);
      expect((highlight.get(PDFName.of('NM')) as PDFHexString).decodeText()).toBe('h-1');
      expect(highlight.get(PDFName.of('Popup'))).toBeUndefined();
      expect(page.node.Contents()).toBeUndefined();
    });

    it('gives the annotation a Multiply appearance stream over its Rect', async () => {
      const { pdfDoc, annots } = await run(good);
      const ap = pdfDoc.context.lookup(annots[0].get(PDFName.of('AP'))) as PDFDict;
      const normal = pdfDoc.context.lookup(ap.get(PDFName.of('N'))) as PDFStream;
      expect(nums(pdfDoc, normal.dict.get(PDFName.of('BBox')))).toEqual([20, 280, 120, 320]);
      const resources = pdfDoc.context.lookup(normal.dict.get(PDFName.of('Resources'))) as PDFDict;
      const states = pdfDoc.context.lookup(resources.get(PDFName.of('ExtGState'))) as PDFDict;
      const state = pdfDoc.context.lookup(states.get(states.keys()[0])) as PDFDict;
      expect(state.get(PDFName.of('BM'))?.toString()).toBe('/Multiply');
    });

    it('adds /Contents (Hebrew included) and a closed /Popup only for a comment', async () => {
      const plain = await run(good);
      expect(plain.annots.some((a) => subtypeOf(a, 'Popup'))).toBe(false);
      expect(plain.annots[0].get(PDFName.of('Contents'))).toBeUndefined();
      const blank = await run(good, { comment: { text: '   ' } });
      expect(blank.annots).toHaveLength(1);

      const { pdfDoc, annots } = await run(good, { comment: { text: 'שלום, a note' } });
      const highlight = annots.find((a) => subtypeOf(a, 'Highlight'))!;
      expect((highlight.get(PDFName.of('Contents')) as PDFHexString).decodeText()).toBe('שלום, a note');
      expect(highlight.get(PDFName.of('T'))).toBeUndefined();
      const popup = annots.find((a) => subtypeOf(a, 'Popup'))!;
      expect(pdfDoc.context.lookup(highlight.get(PDFName.of('Popup')))).toBe(popup);
      expect(pdfDoc.context.lookup(popup.get(PDFName.of('Parent')))).toBe(highlight);
      expect(popup.get(PDFName.of('Open'))?.toString()).toBe('false');
    });

    it('never writes a badge, and a non-printed comment highlight is transparent with an empty appearance', async () => {
      const { annots } = await run(good, { comment: { text: 'x' }, commentNumber: 3 } as any);
      expect(annots.some((a) => subtypeOf(a, 'FreeText'))).toBe(false);
      const popup = annots.find((a) => subtypeOf(a, 'Popup'))!;
      expect((popup.get(PDFName.of('F')) as PDFNumber).asNumber()).toBe(24);
    });

    it('maps every corner through editorToPdf on a rotated page', async () => {
      const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 200, height: 400 }, rotation: 90 });
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([200, 400]);
      page.setRotation(degrees(90));
      await definition.serialize(good, ctxFor(pdfDoc, page, { pdfWidth: geometry.width, pdfHeight: geometry.height, pageGeometry: geometry }));
      const quads = nums(pdfDoc, annotsOf(pdfDoc, page)[0].get(PDFName.of('QuadPoints')));
      const boxW = (good.width / 100) * geometry.width;
      const boxH = (good.height / 100) * geometry.height;
      const band = good.bands[0];
      const l = 20 + (band.left / 100) * boxW, r = l + (band.width / 100) * boxW;
      const t = 320 - (band.top / 100) * boxH, b = t - (band.height / 100) * boxH;
      const expected = [[l, t], [r, t], [l, b], [r, b]].flatMap(([x, y]) => {
        const p = applyAffineTransform({ x, y }, geometry.editorToPdf);
        return [p.x, p.y];
      });
      expect(quads).toHaveLength(16);
      quads.slice(0, 8).forEach((v, i) => expect(v).toBeCloseTo(expected[i], 6));
    });
  });
});
