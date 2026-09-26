import { describe, expect, it } from 'vitest';
import { elementForSlot, type SlotElementBase } from './slotElement.ts';
import { detectedSlots, freeSlot, placementForField, placementForFree } from './fillSlots.ts';
import { getElementDefinition } from '../../../editor/registry/index.ts';
import { placeTextOnField, type CombRegion, type FieldRegion, type TypableField } from '../../../editor/text/combPlacement.ts';
import { carriedTextStyle } from '../../../editor/model/elementDefaults.ts';
import { DEFAULT_STROKE_WIDTH } from '../../../constants/signGeometry.js';

// A4 in PDF points, matching combPlacement.test.ts and fieldOrder.test.ts.
const PAGE_WIDTH = 595.275;
const PAGE_HEIGHT = 841.89;

const base: SlotElementBase = {
  id: 'el-fresh',
  color: '#1463ff',
  carried: { font: 'Arimo', fontSize: 12 },
  pageDirection: 'rtl',
  pageWidthPoints: PAGE_WIDTH,
  pageHeightPoints: PAGE_HEIGHT,
};
const page = { carriedFontSize: 12, fontFamily: 'Arimo', pageWidthPoints: PAGE_WIDTH, pageHeightPoints: PAGE_HEIGHT };

/**
 * What production's own tap on the same field builds - `useWorkspaceGestures.ts`'s
 * `handlePageClick`, reproduced directly rather than called, since it also
 * dispatches and announces. This is the reference `elementForSlot` has to match.
 */
function productionElement(field: TypableField, slotBase: SlotElementBase = base) {
  const { carried } = slotBase;
  const create = getElementDefinition('text').creation.create!;
  const fontFamily = carried.font ?? 'Arimo';
  const snapped = placeTextOnField(field, {
    carriedFontSize: carried.fontSize ?? null,
    fontFamily,
    pageWidthPoints: PAGE_WIDTH,
    pageHeightPoints: PAGE_HEIGHT,
  });
  const newEl = create({
    id: slotBase.id,
    pageIndex: field.region.pageIndex,
    point: { left: field.region.left, top: field.region.top },
    color: slotBase.color,
    whiteoutColor: '#ffffff',
    strokeWidth: DEFAULT_STROKE_WIDTH,
    font: fontFamily,
    fontSize: snapped.fontSize,
    direction: carried.direction ?? null,
  });
  newEl.textDirection = carried.direction ?? slotBase.pageDirection ?? 'ltr';
  Object.assign(newEl, carriedTextStyle(carried));
  return { ...newEl, ...snapped };
}

describe('elementForSlot', () => {
  it('matches production exactly for a comb field', () => {
    const region: CombRegion = { pageIndex: 0, left: 73.597, top: 27.277, width: 17.152, height: 0.836, cells: 9 };
    const field: TypableField = { kind: 'comb', region };
    const slot = detectedSlots([field], [], (f) => placementForField(f, page))[0];
    expect(elementForSlot(slot, '123456789', base)).toEqual({ ...productionElement(field), text: '123456789' });
  });

  it('matches production exactly for a cell field', () => {
    const region: FieldRegion = { pageIndex: 0, left: 30, top: 28, width: 26, height: 4 };
    const field: TypableField = { kind: 'cell', region };
    const slot = detectedSlots([field], [], (f) => placementForField(f, page))[0];
    expect(elementForSlot(slot, 'Jane Doe', base)).toEqual({ ...productionElement(field), text: 'Jane Doe' });
  });

  it('gives a comb both width and combCells, and a cell only minWidth', () => {
    const comb: TypableField = { kind: 'comb', region: { pageIndex: 0, left: 10, top: 10, width: 15, height: 0.8, cells: 6 } };
    const cell: TypableField = { kind: 'cell', region: { pageIndex: 0, left: 10, top: 20, width: 20, height: 2 } };
    const combSlot = detectedSlots([comb], [], (f) => placementForField(f, page))[0];
    const cellSlot = detectedSlots([cell], [], (f) => placementForField(f, page))[0];

    const combEl = elementForSlot(combSlot, '123456', base);
    const cellEl = elementForSlot(cellSlot, 'hi', base);

    expect(combEl.width).toBe(15);
    expect(combEl.combCells).toBe(6);
    expect(combEl).not.toHaveProperty('minWidth');
    expect(cellEl.minWidth).toBe(20);
    expect(cellEl).not.toHaveProperty('width');
    expect(cellEl).not.toHaveProperty('combCells');
  });

  it('gives a free slot no width, minWidth or combCells, sitting exactly where its slot sat', () => {
    const at = { pageIndex: 0, x: 40, y: 50 };
    const placement = placementForFree(at, page);
    const slot = freeSlot(at, placement);

    const element = elementForSlot(slot, 'hello', base);

    expect(element.left).toBe(placement.box.left);
    expect(element.top).toBe(placement.box.top);
    expect(element).not.toHaveProperty('width');
    expect(element).not.toHaveProperty('minWidth');
    expect(element).not.toHaveProperty('combCells');
    expect(element.text).toBe('hello');
    expect(element.fontSize).toBe(12);
    expect(element.fontFamily).toBe('Arimo');
    expect(element.color).toBe(base.color);
  });

  it("gives a field slot the page's printed direction while the document carries none", () => {
    const field: TypableField = { kind: 'cell', region: { pageIndex: 0, left: 10, top: 10, width: 20, height: 2 } };
    const slot = detectedSlots([field], [], (f) => placementForField(f, page))[0];

    expect(elementForSlot(slot, 'x', { ...base, pageDirection: 'ltr' }).textDirection).toBe('ltr');
    expect(elementForSlot(slot, 'x', { ...base, pageDirection: 'rtl' }).textDirection).toBe('rtl');
    expect(elementForSlot(slot, 'x', { ...base, pageDirection: null }).textDirection).toBe('ltr');
  });

  it("lets the document's carried direction win over the page's, as a tap does", () => {
    const field: TypableField = { kind: 'cell', region: { pageIndex: 0, left: 10, top: 10, width: 20, height: 2 } };
    const slot = detectedSlots([field], [], (f) => placementForField(f, page))[0];
    const slotBase = { ...base, carried: { ...base.carried, direction: 'rtl' as const }, pageDirection: 'ltr' as const };

    expect(elementForSlot(slot, 'x', slotBase).textDirection).toBe('rtl');
  });

  it("takes the document's carried alignment, weight and style", () => {
    const field: TypableField = { kind: 'cell', region: { pageIndex: 0, left: 10, top: 10, width: 20, height: 2 } };
    const slot = detectedSlots([field], [], (f) => placementForField(f, page))[0];
    const slotBase = { ...base, carried: { ...base.carried, bold: true, italic: true, textAlign: 'center' as const } };

    const element = elementForSlot(slot, 'x', slotBase);

    expect(element.fontWeight).toBe('bold');
    expect(element.fontStyle).toBe('italic');
    expect(element.textAlign).toBe('center');
    expect(element).toEqual({ ...productionElement(field, slotBase), text: 'x' });
  });

  it('seeds its size from the field, like a tap, while the document carries no size', () => {
    const field: TypableField = { kind: 'cell', region: { pageIndex: 0, left: 10, top: 10, width: 20, height: 2 } };
    const slot = detectedSlots([field], [], (f) => placementForField(f, { ...page, carriedFontSize: null }))[0];
    const slotBase = { ...base, carried: { font: 'Arimo' } };

    const element = elementForSlot(slot, 'x', slotBase);

    expect(element.fontSize).toBe(placeTextOnField(field, {
      carriedFontSize: null,
      fontFamily: 'Arimo',
      pageWidthPoints: PAGE_WIDTH,
      pageHeightPoints: PAGE_HEIGHT,
    }).fontSize);
  });

  it('places through the resolved family, not the raw carried one, once the text needs a switch (SIGN-38)', () => {
    // Caveat is Latin-only, so Hebrew text forces a substitution
    // (resolveFontSubstitution) to Gveret Levin - the digit-centring geometry
    // has to be measured against whatever will actually render and embed
    // this text, or the box lands where Caveat's metrics put it while
    // Gveret Levin's own ink sits somewhere else.
    const field: TypableField = { kind: 'cell', region: { pageIndex: 0, left: 10, top: 10, width: 20, height: 2 } };
    const slot = detectedSlots([field], [], (f) => placementForField(f, { ...page, fontFamily: 'Caveat' }))[0];
    const slotBase = { ...base, carried: { ...base.carried, font: 'Caveat' } };

    const element = elementForSlot(slot, 'שלום', slotBase);
    const resolvedPlacement = placeTextOnField(field, {
      carriedFontSize: 12,
      fontFamily: 'Gveret Levin',
      pageWidthPoints: PAGE_WIDTH,
      pageHeightPoints: PAGE_HEIGHT,
    });

    // The stored family is still the raw carried one, exactly as a tap
    // creates it - rendering resolves it from the text, same as TextNode.tsx.
    expect(element.fontFamily).toBe('Caveat');
    expect(element.top).toBe(resolvedPlacement.top);
  });

  it('gives each call the requested id and a fresh, empty-text-free element otherwise identical in shape', () => {
    const field: TypableField = { kind: 'cell', region: { pageIndex: 1, left: 10, top: 10, width: 20, height: 2 } };
    const slot = detectedSlots([field], [], (f) => placementForField(f, page))[0];
    const element = elementForSlot(slot, 'signed', { ...base, id: 'el-42' });
    expect(element.id).toBe('el-42');
    expect(element.type).toBe('text');
    expect(element.pageIndex).toBe(1);
  });
});
