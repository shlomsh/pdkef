import { describe, expect, it } from 'vitest';
import { eachMark } from './marks.ts';

/** A plane from rows of digits: 0 is ink, 9 is paper. */
const plane = (rows: string[]) => ({
  width: rows[0].length,
  height: rows.length,
  data: Uint8ClampedArray.from(rows.join('').split('').map((c) => Number(c) * 25)),
});
const marksOf = (rows: string[], below = 100) => {
  const { data, width, height } = plane(rows);
  const marks: number[][] = [];
  eachMark(data, width, height, below, (pixels) => marks.push([...pixels].sort((a, b) => a - b)));
  return marks;
};

describe('eachMark', () => {
  it('finds nothing on clean paper', () => {
    expect(marksOf(['999', '999'])).toEqual([]);
  });

  it('hands over each mark once, with every pixel in it', () => {
    expect(marksOf(['009', '999', '900'])).toEqual([[0, 1], [7, 8]]);
  });

  it('joins pixels that touch only at a corner', () => {
    expect(marksOf(['099', '909', '990'])).toEqual([[0, 4, 8]]);
  });

  it('does not wrap a mark round the end of a row', () => {
    expect(marksOf(['990', '099'])).toEqual([[2], [3]]);
  });

  it('counts only pixels under the limit', () => {
    expect(marksOf(['050', '999'], 100)).toEqual([[0], [2]]);
    expect(marksOf(['050', '999'], 200)).toEqual([[0, 1, 2]]);
  });
});
