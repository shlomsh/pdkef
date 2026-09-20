import { describe, expect, it } from 'vitest';
import { reconcileFields } from './fieldRegions.js';

// Page percentages. Form 101's section ב row: the identity comb's teeth hang
// off the bottom rule of a 23pt cell that is as tall as the name cell beside it.
const teeth = { pageIndex: 0, left: 73.6, top: 27.28, width: 17.15, height: 0.84, cells: 9 };
const identityCell = { pageIndex: 0, left: 73.6, top: 25.32, width: 17.15, height: 2.77, kind: 'text' };
const nameCell = { pageIndex: 0, left: 52.7, top: 25.32, width: 20.9, height: 2.77, kind: 'text' };

describe('reconcileFields', () => {
  it('gives an open comb the cell drawn around it as its writable strip, and drops the cell', () => {
    const { combs, cells } = reconcileFields({ combs: [teeth], checkboxes: [], cells: [identityCell, nameCell] });
    expect(combs[0].writable).toEqual({ left: 73.6, top: 25.32, width: 17.15, height: 2.77 });
    expect(cells).toEqual([nameCell]);
  });

  it('passes on the band a labelled cell publishes, not the ruled box around it', () => {
    // formCells.js already carves the caption off: the cell's own bounds are
    // the strip, and its `enclosure` is only the tap target.
    const labelled = {
      ...identityCell,
      top: 26.4,
      height: 1.69,
      enclosure: { left: 73.6, top: 25.32, width: 17.15, height: 2.77 },
    };
    const { combs } = reconcileFields({ combs: [teeth], checkboxes: [], cells: [labelled] });
    expect(combs[0].writable).toEqual({ left: 73.6, top: 26.4, width: 17.15, height: 1.69 });
  });

  it('takes the tightest enclosing cell, not a section frame that also contains the run', () => {
    const frame = { pageIndex: 0, left: 4.8, top: 25.05, width: 85.9, height: 13.9, kind: 'text' };
    const { combs, cells } = reconcileFields({ combs: [teeth], checkboxes: [], cells: [frame, identityCell] });
    expect(combs[0].writable.height).toBeCloseTo(2.77);
    expect(cells).toEqual([]);
  });

  it('leaves a boxed comb alone - its boxes are the field - but still drops the cell around it', () => {
    const boxed = { ...teeth, boxed: true };
    const { combs, cells } = reconcileFields({ combs: [boxed], checkboxes: [], cells: [identityCell] });
    expect(combs[0]).toBe(boxed);
    expect(cells).toEqual([]);
  });

  it('drops a cell a checkbox sits in', () => {
    const box = { pageIndex: 0, left: 54, top: 26, width: 1.5, height: 1.5 };
    const { cells } = reconcileFields({ combs: [], checkboxes: [box], cells: [nameCell] });
    expect(cells).toEqual([]);
  });

  it('keeps a comb and a cell that merely touch', () => {
    const below = { ...nameCell, left: 73.6, top: 28.12 };
    const { combs, cells } = reconcileFields({ combs: [teeth], checkboxes: [], cells: [below] });
    expect(combs[0].writable).toBeUndefined();
    expect(cells).toEqual([below]);
  });
});
