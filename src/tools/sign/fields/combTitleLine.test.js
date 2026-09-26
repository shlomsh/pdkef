import { describe, expect, it } from 'vitest';
import { titleLineWritable } from './combTitleLine.js';

// Page-percent boxes shaped like form 101's tax year (FORM-27): four 8-unit teeth,
// and a 14-unit title just to their right, reaching above them.
const comb = { pageIndex: 0, left: 10, top: 20, width: 16, height: 8, cells: 4 };
const title = { str: 'שנת המס', left: 27, top: 10, width: 14, height: 14 };

describe('titleLineWritable', () => {
  it('stretches an open comb up to the top of the title on its line', () => {
    const [out] = titleLineWritable([comb], { cells: [], checkboxes: [], textRuns: [title] });
    expect(out.writable).toEqual({ left: 10, top: 10, width: 16, height: 18 });
    expect(out).toMatchObject({ left: 10, top: 20, width: 16, height: 8 });
  });

  it('never borrows from a checkbox glyph, which is the checkbox, not a title', () => {
    const glyph = { ...title, str: 'o', width: 3 };
    const box = { pageIndex: 0, left: 27, top: 15, width: 3, height: 3 };
    const [out] = titleLineWritable([comb], { cells: [], checkboxes: [box], textRuns: [glyph] });
    expect(out.writable).toBeUndefined();
  });

  it('leaves teeth that are already a line tall alone', () => {
    const tall = { ...comb, top: 14, height: 12 };
    const [out] = titleLineWritable([tall], { cells: [], checkboxes: [], textRuns: [title] });
    expect(out.writable).toBeUndefined();
  });

  it('ignores text further away than one cell pitch', () => {
    const far = { ...title, left: 31 };
    const [out] = titleLineWritable([comb], { cells: [], checkboxes: [], textRuns: [far] });
    expect(out.writable).toBeUndefined();
  });

  it('leaves a comb a cell encloses to the cell, and a boxed comb to its own boxes', () => {
    const cell = { pageIndex: 0, left: 10, top: 5, width: 16, height: 23 };
    const boxed = { ...comb, boxed: true };
    const out = titleLineWritable([comb, boxed], { cells: [cell], checkboxes: [], textRuns: [title] });
    expect(out.map((c) => c.writable)).toEqual([undefined, undefined]);
  });
});
