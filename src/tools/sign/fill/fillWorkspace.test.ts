import { describe, expect, it } from 'vitest';
import { boxOf, documentFillItems, fillItemIndex, fillItemsByPage, fillReachTargets } from './fillWorkspace.ts';
import { freeSlotKey, slotKey } from './fillSlots.ts';
import { boxKey } from './fillDom.ts';
import type { FieldRegion, PercentBox, TypableField } from '../../../editor/text/combPlacement.ts';
import type { TextDirection, TextElement } from '../../../editor/model/editorModel.ts';
import type { FillItem, FillSlot, PagePoint } from './fillTypes.ts';
import {
  DEFAULT_FALLBACK_ELEMENT_WIDTH_PCT,
  DEFAULT_FONT_SIZE_PT,
  TEXT_BOX_LINE_HEIGHT_EM,
} from '../../../constants/signGeometry.js';

const PAGE_HEIGHT_POINTS = 792;
const pageHeightPointsOf = () => PAGE_HEIGHT_POINTS;

// Sits exactly on FIELD's region (elementIsOnField's own tolerance), so
// order.find() matches it - the "on a detected field" branch.
const FIELD_REGION: FieldRegion = { pageIndex: 0, left: 30, top: 28, width: 26, height: 4 };
const FIELD: TypableField = { kind: 'cell', region: FIELD_REGION };

function textElement(overrides: Partial<TextElement> = {}): TextElement {
  return { id: 'el-1', type: 'text', pageIndex: 0, left: 5, top: 60, text: 'hello', ...overrides };
}

function textItem(element: TextElement): FillItem {
  return { kind: 'text', key: `el:${element.id}`, element };
}

function slotItem(overrides: Partial<FillSlot> = {}): FillItem {
  const slot: FillSlot = {
    key: 'slot:0:12.50:30.00',
    pageIndex: 0,
    field: null,
    placement: { box: { left: 12.5, top: 30, width: 40, height: 6 }, fontSize: 12, fontFamily: 'Arimo' },
    ...overrides,
  };
  return { kind: 'slot', key: slot.key, slot };
}

describe('boxOf', () => {
  it('takes a slot straight from its own placement box', () => {
    const item = slotItem({ pageIndex: 2, placement: { box: { left: 1, top: 2, width: 3, height: 4 }, fontSize: 12, fontFamily: 'Arimo' } });
    expect(boxOf(item, [], pageHeightPointsOf)).toEqual({ left: 1, top: 2, width: 3, height: 4, pageIndex: 2 });
  });

  it('takes a text element on a detected field from the field\'s own region, not the element\'s geometry', () => {
    // Same left/top as FIELD_REGION, so elementIsOnField matches it.
    const item = textItem(textElement({ left: 30, top: 28, width: 999, minWidth: 999 }));
    expect(boxOf(item, [FIELD], pageHeightPointsOf)).toEqual({ ...FIELD_REGION, pageIndex: 0 });
  });

  it('skips a field the element does not sit on, to find the one among several it does', () => {
    const otherField: TypableField = { kind: 'cell', region: { pageIndex: 0, left: 70, top: 10, width: 10, height: 4 } };
    const item = textItem(textElement({ left: 30, top: 28 }));
    expect(boxOf(item, [otherField, FIELD], pageHeightPointsOf)).toEqual({ ...FIELD_REGION, pageIndex: 0 });
  });

  it('falls back to the element\'s own left/top when it sits on no field', () => {
    const item = textItem(textElement({ left: 5, top: 60 }));
    const box = boxOf(item, [FIELD], pageHeightPointsOf);
    expect(box.left).toBe(5);
    expect(box.top).toBe(60);
    expect(box.pageIndex).toBe(0);
  });

  it('takes minWidth over width when the element carries both', () => {
    const item = textItem(textElement({ minWidth: 22, width: 40 }));
    expect(boxOf(item, [], pageHeightPointsOf).width).toBe(22);
  });

  it('takes width (a comb\'s span) when there is no minWidth', () => {
    const item = textItem(textElement({ width: 18 }));
    expect(boxOf(item, [], pageHeightPointsOf).width).toBe(18);
  });

  it('falls back to the small default width when the element has neither', () => {
    const item = textItem(textElement({ minWidth: undefined, width: undefined }));
    expect(boxOf(item, [], pageHeightPointsOf).width).toBe(DEFAULT_FALLBACK_ELEMENT_WIDTH_PCT);
  });

  it('sizes an off-field element\'s height as one line at its own font size, in percent of the page height', () => {
    const item = textItem(textElement({ fontSize: 16 }));
    const expected = (16 * TEXT_BOX_LINE_HEIGHT_EM / PAGE_HEIGHT_POINTS) * 100;
    expect(boxOf(item, [], pageHeightPointsOf).height).toBeCloseTo(expected);
  });

  it('falls back to the default font size for the height when the element carries none', () => {
    const item = textItem(textElement({ fontSize: undefined }));
    const expected = (DEFAULT_FONT_SIZE_PT * TEXT_BOX_LINE_HEIGHT_EM / PAGE_HEIGHT_POINTS) * 100;
    expect(boxOf(item, [], pageHeightPointsOf).height).toBeCloseTo(expected);
  });

  it('is a zero height rather than an infinite one when the page height is not known yet', () => {
    const item = textItem(textElement({ fontSize: 16 }));
    expect(boxOf(item, [], () => 0).height).toBe(0);
  });

  it('reads the field for the element\'s own page, not a same-shaped field on another page', () => {
    const otherPage: TypableField = { kind: 'cell', region: { ...FIELD_REGION, pageIndex: 1 } };
    const item = textItem(textElement({ pageIndex: 0, left: 30, top: 28 }));
    // elementIsOnField itself rejects a page mismatch, so the off-field
    // fallback branch runs - the element's own geometry, not otherPage's.
    const box = boxOf(item, [otherPage], pageHeightPointsOf);
    expect(box.left).toBe(30);
    expect(box.pageIndex).toBe(0);
  });
});

describe('fillItemIndex', () => {
  const items: FillItem[] = [slotItem({ key: 'a' }), slotItem({ key: 'b' }), slotItem({ key: 'c' })];

  it('finds the position of an item by key', () => {
    expect(fillItemIndex(items, 'a')).toBe(0);
    expect(fillItemIndex(items, 'b')).toBe(1);
    expect(fillItemIndex(items, 'c')).toBe(2);
  });

  it('is -1 for a key that is not in the list', () => {
    expect(fillItemIndex(items, 'nowhere')).toBe(-1);
  });

  it('is -1 for an empty list', () => {
    expect(fillItemIndex([], 'a')).toBe(-1);
  });
});

describe('documentFillItems', () => {
  const pageSizeOf = () => ({ width: 612, height: 792 });
  const ltr = (): TextDirection => 'ltr';
  const typography = { fontFamily: 'Arimo', fontSize: 12 };

  it('turns an empty detected field into a slot item keyed by slotKey', () => {
    const items = documentFillItems({
      order: [FIELD],
      textElements: [],
      freeAt: null,
      typography,
      pageSizeOf,
      directionOfPage: ltr,
    });
    expect(items).toEqual([{ kind: 'slot', key: slotKey(FIELD), slot: expect.objectContaining({ field: FIELD }) }]);
  });

  it('yields no slot, only the text item, when a text element already sits on the field', () => {
    // Same left/top as FIELD_REGION, so elementIsOnField matches it (see FIELD comment above).
    const element = textElement({ left: FIELD_REGION.left, top: FIELD_REGION.top });
    const items = documentFillItems({
      order: [FIELD],
      textElements: [element],
      freeAt: null,
      typography,
      pageSizeOf,
      directionOfPage: ltr,
    });
    expect(items).toEqual([{ kind: 'text', key: 'el:el-1', element }]);
  });

  it('includes a free slot keyed by freeSlotKey, with field null, when freeAt is set', () => {
    const freeAt: PagePoint = { pageIndex: 0, x: 10, y: 20 };
    const items = documentFillItems({
      order: [],
      textElements: [],
      freeAt,
      typography,
      pageSizeOf,
      directionOfPage: ltr,
    });
    expect(items).toEqual([{ kind: 'slot', key: freeSlotKey(freeAt), slot: expect.objectContaining({ field: null }) }]);
  });

  it('includes no free slot when freeAt is null', () => {
    const items = documentFillItems({
      order: [],
      textElements: [],
      freeAt: null,
      typography,
      pageSizeOf,
      directionOfPage: ltr,
    });
    expect(items).toEqual([]);
  });

  it("takes a slot's placement font family from typography", () => {
    const items = documentFillItems({
      order: [FIELD],
      textElements: [],
      freeAt: null,
      typography: { fontFamily: 'Rubik', fontSize: 14 },
      pageSizeOf,
      directionOfPage: ltr,
    });
    const [item] = items;
    if (item.kind !== 'slot') throw new Error('expected a slot item');
    expect(item.slot.placement.fontFamily).toBe('Rubik');
  });

  it('orders two fields on one row left first on an LTR page', () => {
    const left: TypableField = { kind: 'cell', region: { pageIndex: 0, left: 10, top: 28, width: 10, height: 4 } };
    const right: TypableField = { kind: 'cell', region: { pageIndex: 0, left: 50, top: 28, width: 10, height: 4 } };
    const items = documentFillItems({
      order: [right, left],
      textElements: [],
      freeAt: null,
      typography,
      pageSizeOf,
      directionOfPage: ltr,
    });
    expect(items.map((item) => item.key)).toEqual([slotKey(left), slotKey(right)]);
  });

  it('orders two fields on one row right first on an RTL page', () => {
    const left: TypableField = { kind: 'cell', region: { pageIndex: 0, left: 10, top: 28, width: 10, height: 4 } };
    const right: TypableField = { kind: 'cell', region: { pageIndex: 0, left: 50, top: 28, width: 10, height: 4 } };
    const items = documentFillItems({
      order: [left, right],
      textElements: [],
      freeAt: null,
      typography,
      pageSizeOf,
      directionOfPage: () => 'rtl',
    });
    expect(items.map((item) => item.key)).toEqual([slotKey(right), slotKey(left)]);
  });

  it('orders a page 0 item before a page 1 item regardless of input order', () => {
    const onPage1: TypableField = { kind: 'cell', region: { pageIndex: 1, left: 10, top: 10, width: 10, height: 4 } };
    const items = documentFillItems({
      order: [onPage1, FIELD],
      textElements: [],
      freeAt: null,
      typography,
      pageSizeOf,
      directionOfPage: ltr,
    });
    expect(items.map((item) => item.key)).toEqual([slotKey(FIELD), slotKey(onPage1)]);
  });

  it('orders a text element below a slot on the same page after it', () => {
    const element = textElement({ top: 80 });
    const items = documentFillItems({
      order: [FIELD],
      textElements: [element],
      freeAt: null,
      typography,
      pageSizeOf,
      directionOfPage: ltr,
    });
    expect(items.map((item) => item.key)).toEqual([slotKey(FIELD), 'el:el-1']);
  });
});

describe('fillReachTargets', () => {
  const box: PercentBox = { left: 10, top: 20, width: 30, height: 40 };
  const boxOfItem = (): PercentBox & { pageIndex: number } => ({ ...box, pageIndex: 3 });
  const fieldSlot = slotItem({ key: 'field-slot', field: FIELD });
  const freeSlotItem = slotItem({ key: 'free-slot', field: null });
  const textEl = textItem(textElement({ id: 'el-9' }));

  it("'text' returns one 'fill' target per item, with the box from boxOfItem and no pageIndex inside it", () => {
    const targets = fillReachTargets('text', [fieldSlot, freeSlotItem, textEl], [], boxOfItem);
    expect(targets).toEqual([
      { kind: 'fill', key: 'field-slot', pageIndex: 3, box },
      { kind: 'fill', key: 'free-slot', pageIndex: 3, box },
      { kind: 'fill', key: 'el:el-9', pageIndex: 3, box },
    ]);
  });

  it("'date' returns only the detected slots, excluding a free slot and a text item", () => {
    const targets = fillReachTargets('date', [fieldSlot, freeSlotItem, textEl], [], boxOfItem);
    expect(targets).toEqual([{ kind: 'fill', key: 'field-slot', pageIndex: 3, box }]);
  });

  it("'mark' returns one 'box' target per checkbox, keyed by boxKey", () => {
    const region: FieldRegion = { pageIndex: 1, left: 5, top: 6, width: 7, height: 8 };
    const targets = fillReachTargets('mark', [], [region], boxOfItem);
    expect(targets).toEqual([{ kind: 'box', key: boxKey(region), pageIndex: 1, box: { left: 5, top: 6, width: 7, height: 8 } }]);
  });

  it("'other' returns no targets", () => {
    expect(fillReachTargets('other', [fieldSlot, textEl], [], boxOfItem)).toEqual([]);
  });
});

describe('fillItemsByPage', () => {
  it("groups a slot by slot.pageIndex and a text item by element.pageIndex, keeping order, in numPages lists including empty ones", () => {
    const a = slotItem({ key: 'a', pageIndex: 0 });
    const b = textItem(textElement({ id: 'el-b', pageIndex: 0 }));
    const c = slotItem({ key: 'c', pageIndex: 2 });
    expect(fillItemsByPage([a, b, c], 3)).toEqual([[a, b], [], [c]]);
  });

  it('drops an item on a page at or past numPages', () => {
    const a = slotItem({ key: 'a', pageIndex: 0 });
    const stray = slotItem({ key: 'stray', pageIndex: 5 });
    expect(fillItemsByPage([a, stray], 2)).toEqual([[a], []]);
  });
});
