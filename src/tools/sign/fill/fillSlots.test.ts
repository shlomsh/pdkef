import { describe, expect, it } from 'vitest';
import { detectedSlots, freeSlot, placementForField, placementForFree, slotKey } from './fillSlots.ts';
import { placeTextOnField, type CombRegion, type FieldRegion, type TypableField } from '../../../editor/text/combPlacement.ts';
import { DEFAULT_FONT_SIZE_PT } from '../../../constants/signGeometry.js';
import type { TextElement } from '../../../editor/model/editorModel.ts';
import type { SlotPlacement } from './fillTypes.ts';

// A4 in PDF points, matching combPlacement.test.ts and fieldOrder.test.ts, so
// these fixtures read against the same real-world scale their own tests do.
const PAGE_WIDTH = 595.275;
const PAGE_HEIGHT = 841.89;
const page = { carriedFontSize: 12, fontFamily: 'Arimo', pageWidthPoints: PAGE_WIDTH, pageHeightPoints: PAGE_HEIGHT };

// Income tax form 101's identity comb, as MOBI-03's detector reports it.
const IDENTITY_RUN: CombRegion = { pageIndex: 0, left: 73.597, top: 27.277, width: 17.152, height: 0.836, cells: 9 };
const combField: TypableField = { kind: 'comb', region: IDENTITY_RUN };

const NAME_CELL: FieldRegion = { pageIndex: 0, left: 30, top: 28, width: 26, height: 4 };
const cellField: TypableField = { kind: 'cell', region: NAME_CELL };

describe('slotKey', () => {
  it('is the same for two field objects describing the same spot', () => {
    expect(slotKey(combField)).toBe(slotKey({ kind: 'comb', region: { ...IDENTITY_RUN } }));
  });

  it('encodes the page, left and top to two decimal places', () => {
    expect(slotKey(combField)).toBe('slot:0:73.60:27.28');
  });

  it('differs for the same spot on a different page', () => {
    const otherPage: TypableField = { kind: 'comb', region: { ...IDENTITY_RUN, pageIndex: 1 } };
    expect(slotKey(combField)).not.toBe(slotKey(otherPage));
  });
});

describe('placementForField', () => {
  it('takes left, top and fontSize straight from placeTextOnField, for a comb', () => {
    const placed = placeTextOnField(combField, page);
    const placement = placementForField(combField, page);
    expect(placement.box.left).toBe(placed.left);
    expect(placement.box.top).toBe(placed.top);
    expect(placement.fontSize).toBe(placed.fontSize);
    expect(placement.fontFamily).toBe('Arimo');
  });

  it('gives a comb its span as the box width, and carries combCells', () => {
    const placement = placementForField(combField, page);
    expect(placement.box.width).toBe(IDENTITY_RUN.width);
    expect(placement.combCells).toBe(9);
  });

  it('gives a cell its minWidth as the box width, with no combCells', () => {
    const placed = placeTextOnField(cellField, page);
    const placement = placementForField(cellField, page);
    expect(placement.box.left).toBe(placed.left);
    expect(placement.box.width).toBe(26);
    expect(placement.combCells).toBeUndefined();
  });

  it('takes the height from the region when it carries no writable strip', () => {
    expect(placementForField(combField, page).box.height).toBe(IDENTITY_RUN.height);
  });

  it('takes the height from the writable strip, not the whole field, when it has one', () => {
    // A caption band above a cell leaves a shorter blank strip below it.
    const withStrip: FieldRegion = {
      pageIndex: 0, left: 10, top: 20, width: 15, height: 4,
      writable: { left: 10, top: 22.4, width: 15, height: 1.6 },
    };
    const placement = placementForField({ kind: 'cell', region: withStrip }, page);
    expect(placement.box.height).toBe(1.6);
  });
});

describe('placementForFree', () => {
  it('starts before the tap, not on top of it', () => {
    const placement = placementForFree({ pageIndex: 0, x: 50, y: 50 }, page);
    expect(placement.box.left).toBeLessThan(50);
  });

  it('takes the default size while the document carries none, like a free tap', () => {
    const placement = placementForFree({ pageIndex: 0, x: 50, y: 50 }, { ...page, carriedFontSize: null });
    expect(placement.fontSize).toBe(DEFAULT_FONT_SIZE_PT);
  });

  it('is vertically centred on the tap', () => {
    const placement = placementForFree({ pageIndex: 0, x: 50, y: 50 }, page);
    const heightPercent = (12 * 1.29 / PAGE_HEIGHT) * 100;
    expect(placement.box.top).toBeCloseTo(50 - heightPercent / 2, 5);
  });

  it('never rises above the top of the page near the top edge', () => {
    expect(placementForFree({ pageIndex: 0, x: 50, y: 0.01 }, page).box.top).toBe(0);
  });

  it('stays on the page when the tap is near the left edge', () => {
    const placement = placementForFree({ pageIndex: 0, x: 0.5, y: 50 }, page);
    expect(placement.box.left).toBeGreaterThanOrEqual(0);
  });

  it('stays on the page when the tap is near the right edge', () => {
    const placement = placementForFree({ pageIndex: 0, x: 99.5, y: 50 }, page);
    expect(placement.box.left + placement.box.width).toBeLessThanOrEqual(100 + 1e-9);
  });

  it('carries no combCells, since a free slot is never a comb', () => {
    expect(placementForFree({ pageIndex: 0, x: 50, y: 50 }, page).combCells).toBeUndefined();
  });
});

describe('detectedSlots', () => {
  const order: TypableField[] = [combField, cellField];
  const placementFor = (field: TypableField): SlotPlacement => placementForField(field, page);

  it('makes one slot per field when nothing is filled in yet', () => {
    const slots = detectedSlots(order, [], placementFor);
    expect(slots.map((s) => s.key)).toEqual([slotKey(combField), slotKey(cellField)]);
    expect(slots.map((s) => s.field)).toEqual([combField, cellField]);
  });

  it('gives no slot to a field a text element already sits on', () => {
    const onComb: TextElement = {
      id: 'el-1', type: 'text', pageIndex: 0, left: IDENTITY_RUN.left, top: IDENTITY_RUN.top,
      text: '123456789', width: IDENTITY_RUN.width, combCells: 9,
    };
    const slots = detectedSlots(order, [onComb], placementFor);
    expect(slots.map((s) => s.field)).toEqual([cellField]);
  });

  it('keeps the caller\'s order, not its own', () => {
    const slots = detectedSlots([cellField, combField], [], placementFor);
    expect(slots.map((s) => s.field)).toEqual([cellField, combField]);
  });

  it('is empty when every field already has text on it', () => {
    const onCell: TextElement = { id: 'el-2', type: 'text', pageIndex: 0, left: 30, top: 28, text: 'Jane', minWidth: 26 };
    const onComb: TextElement = {
      id: 'el-1', type: 'text', pageIndex: 0, left: IDENTITY_RUN.left, top: IDENTITY_RUN.top,
      text: '123456789', width: IDENTITY_RUN.width, combCells: 9,
    };
    expect(detectedSlots(order, [onComb, onCell], placementFor)).toEqual([]);
  });
});

describe('freeSlot', () => {
  it('keys on the page and the tap point to one decimal place', () => {
    const placement = placementForFree({ pageIndex: 2, x: 12.34, y: 56.78 }, page);
    const slot = freeSlot({ pageIndex: 2, x: 12.34, y: 56.78 }, placement);
    expect(slot.key).toBe('free:2:12.3:56.8');
    expect(slot.field).toBeNull();
    expect(slot.pageIndex).toBe(2);
    expect(slot.placement).toBe(placement);
  });

  it('gives the same key for two taps that round to the same tenth', () => {
    const a = freeSlot({ pageIndex: 0, x: 12.34, y: 56.78 }, placementForFree({ pageIndex: 0, x: 12.34, y: 56.78 }, page));
    const b = freeSlot({ pageIndex: 0, x: 12.35, y: 56.76 }, placementForFree({ pageIndex: 0, x: 12.35, y: 56.76 }, page));
    expect(a.key).toBe(b.key);
  });
});
