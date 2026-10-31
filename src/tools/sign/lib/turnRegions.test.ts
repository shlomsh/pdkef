import { describe, it, expect } from 'vitest';
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
});
