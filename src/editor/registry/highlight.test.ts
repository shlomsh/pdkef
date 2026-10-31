import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
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

  it('draws one Multiply rectangle per band', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 400]);
    const drawn: any[] = [];
    const realDraw = page.drawRectangle.bind(page);
    page.drawRectangle = ((options: any) => { drawn.push(options); realDraw(options); }) as any;
    // Element box: left 10%, top 20% of the page, 50% x 10% of the page.
    definition.serialize(good, { pdfDoc, page, pdfWidth: 200, pdfHeight: 400, pdfX: 20, pdfY: 320 } as any);
    expect(drawn).toHaveLength(2);
    // Box is 100 x 40 points; band 1 is the whole top 40%, band 2 the left half of the bottom 40%.
    expect(drawn[0]).toMatchObject({ x: 20, y: 320 - 0 - 16, width: 100, height: 16, blendMode: 'Multiply' });
    expect(drawn[1]).toMatchObject({ x: 20, y: 320 - 24 - 16, width: 50, height: 16, blendMode: 'Multiply' });
    expect(drawn[0].borderWidth).toBeUndefined();

    const saved = await PDFDocument.load(await pdfDoc.save({ useObjectStreams: false }));
    const resources = saved.getPage(0).node.Resources()!;
    const extGStates = resources.lookup(PDFName.of('ExtGState')) as any;
    const states = extGStates.keys().map((key: any) => extGStates.lookup(key).toString());
    expect(states.some((state: string) => state.includes('/BM /Multiply'))).toBe(true);
  });
});
