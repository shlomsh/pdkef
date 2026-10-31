import { describe, it, expect } from 'vitest';
import { createPageGeometry } from '#editor/geometry/coords.ts';
import { turnElement } from '#editor/geometry/pageTurn.ts';
import { turnRegions } from './turnRegions.ts';
import type { FormFieldRegions } from '../hooks/useFormFieldRegions.ts';

const regions = (): FormFieldRegions => ({
  detection: 'done',
  combs: [{ pageIndex: 1, left: 10, top: 20, width: 30, height: 5, cells: 6, writable: { left: 10, top: 20, width: 30, height: 5 } }],
  checkboxes: [
    { pageIndex: 0, left: 10, top: 20, width: 4, height: 2 },
    { pageIndex: 1, left: 10, top: 20, width: 4, height: 2 },
  ],
  cells: [],
  pageDirections: ['ltr', 'rtl'],
});

const portraitPage = createPageGeometry({ cropBox: { x: 0, y: 0, width: 612, height: 792 } });

describe('turnRegions', () => {
  it('moves a turned page\'s checkbox with the content', () => {
    const turned = turnRegions(regions(), { 1: 1 });
    // one quarter turn: (x, y) -> (100 - y, x), box corners (10,20)-(14,22) -> (80,10)-(78,14)
    expect(turned.checkboxes[1]).toMatchObject({ pageIndex: 1, left: 78, top: 10, width: 2, height: 4 });
  });

  it('turns combs and their writable strip, keeping the cell count', () => {
    const [comb] = turnRegions(regions(), { 1: 1 }).combs;
    expect(comb.cells).toBe(6);
    expect(comb).toMatchObject({ left: 75, top: 10, width: 5, height: 30 });
    expect(comb.writable).toMatchObject({ left: 75, top: 10, width: 5, height: 30 });
  });

  it('keeps untouched pages and an unturned document reference-equal', () => {
    const input = regions();
    const turned = turnRegions(input, { 1: 1 });
    expect(turned.checkboxes[0]).toBe(input.checkboxes[0]);
    expect(turnRegions(input, {})).toBe(input);
  });

  it('is the identity after four turns', () => {
    const input = regions();
    let r = input;
    for (let i = 0; i < 4; i++) r = turnRegions(r, { 1: 1 });
    expect(r.checkboxes[1]).toEqual(input.checkboxes[1]);
    expect(r.combs[0]).toEqual(input.combs[0]);
  });

  it.each([1, 2, 3] as const)('text typed on a field stays on the turned field (%i turns)', (q) => {
    const fontSize = 12;
    const region = { pageIndex: 0, left: 20, top: 30, width: 0.4, height: (fontSize * 1.05 * 100) / portraitPage.height };
    const text = { id: 't', pageIndex: 0, type: 'text', text: 'x', fontSize, left: region.left, top: region.top } as any;
    const out = turnElement(text, portraitPage, q) as any;
    const turned = turnRegions({ combs: [], checkboxes: [], cells: [region] } as any, { 0: q }).cells[0];
    expect(Math.abs(out.left - turned.left)).toBeLessThanOrEqual(0.6);
    expect(Math.abs(out.top - turned.top)).toBeLessThanOrEqual(0.6);
  });
});
