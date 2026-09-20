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

  it('claims the cell whose printed box holds the run, even when the run misses its strip', () => {
    // The carve cuts a caption band off the top of a ruled box; a run printed
    // in that band is inside the box but outside what the cell publishes. The
    // box is still the rectangle the question is about, so the cell goes and
    // the comb takes its strip - otherwise one printed box carries a comb and
    // a text field on top of each other.
    const inBand = { ...teeth, top: 25.4 };
    const labelled = {
      ...identityCell,
      top: 26.4,
      height: 1.69,
      enclosure: { left: 73.6, top: 25.32, width: 17.15, height: 2.77 },
    };
    const { combs, cells } = reconcileFields({ combs: [inBand], checkboxes: [], cells: [labelled] });
    expect(combs[0].writable).toEqual({ left: 73.6, top: 26.4, width: 17.15, height: 1.69 });
    expect(cells).toEqual([]);
  });

  it('compares printed boxes, not strips, when picking the tightest enclosing cell', () => {
    // Constructed so the two orderings disagree, which is the only way to see
    // which one is used: the frame's own caption leaves it a thin strip
    // (85.9 x 0.5 = 43) smaller in area than the identity cell's whole box
    // (17.15 x 2.77 = 47.5), while the box it was cut from is 25 times larger.
    // Tightness is a property of the printed box; a thin strip must not win it.
    const frame = {
      pageIndex: 0,
      left: 4.8,
      top: 26.5,
      width: 85.9,
      height: 0.5,
      kind: 'text',
      enclosure: { left: 4.8, top: 25.05, width: 85.9, height: 13.9 },
    };
    const { combs, cells } = reconcileFields({ combs: [teeth], checkboxes: [], cells: [frame, identityCell] });
    expect(combs[0].writable).toEqual({ left: 73.6, top: 25.32, width: 17.15, height: 2.77 });
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

  it('drops a cell whose printed box a checkbox sits in, above the strip it publishes', () => {
    // Health's yes/no rows, live: a ruled box with "\u05db\u05df" and "\u05dc\u05d0" printed on its top line
    // beside the two radios, and blank space under them. The cell publishes that blank band, so
    // only a sixth of each radio falls inside its bounds - but the box the radios are in is the
    // box this cell was cut from, and something else has already reported them. Published
    // anyway, this was 20 of the 27 false positives on that form's page 1.
    const radio = { pageIndex: 0, left: 52.3, top: 42.4, width: 1.1, height: 0.8 };
    const yesNo = {
      pageIndex: 0, left: 50.9, top: 42.9, width: 8.9, height: 1.4, kind: 'text',
      enclosure: { left: 50.9, top: 42.3, width: 8.9, height: 2.0 },
    };
    const { cells } = reconcileFields({ combs: [], checkboxes: [radio], cells: [yesNo] });
    expect(cells).toEqual([]);
  });

  it('keeps a cell whose printed box a neighbouring checkbox sits outside of', () => {
    const outside = { pageIndex: 0, left: 61, top: 42.4, width: 1.1, height: 0.8 };
    const yesNo = {
      pageIndex: 0, left: 50.9, top: 42.9, width: 8.9, height: 1.4, kind: 'text',
      enclosure: { left: 50.9, top: 42.3, width: 8.9, height: 2.0 },
    };
    const { cells } = reconcileFields({ combs: [], checkboxes: [outside], cells: [yesNo] });
    expect(cells).toEqual([yesNo]);
  });

  it('keeps a comb and a cell that merely touch', () => {
    const below = { ...nameCell, left: 73.6, top: 28.12 };
    const { combs, cells } = reconcileFields({ combs: [teeth], checkboxes: [], cells: [below] });
    expect(combs[0].writable).toBeUndefined();
    expect(cells).toEqual([below]);
  });
});
