import { describe, expect, it } from 'vitest';
import { linksOverDeleted } from './linksOverDeleted.js';

describe('linksOverDeleted', () => {
  it('drops a link whose rect exactly matches a deleted box', () => {
    // Real CamScanner footer, verified on a real file: bbox {x:500,y:10,
    // width:80,height:30}, Link /Rect [500 10 580 40].
    const boxes = [{ x: 500, y: 10, width: 80, height: 30 }];
    expect(linksOverDeleted([[500, 10, 580, 40]], boxes)).toEqual([0]);
  });

  it('drops a link entirely inside a larger deleted box', () => {
    const boxes = [{ x: 0, y: 0, width: 100, height: 100 }];
    expect(linksOverDeleted([[10, 10, 20, 20]], boxes)).toEqual([0]);
  });

  it('keeps a link that only 40% overlaps a deleted box', () => {
    const link = [0, 0, 10, 10]; // area 100
    const boxes = [{ x: -1, y: 0, width: 5, height: 10 }]; // overlap 4x10 = 40
    expect(linksOverDeleted([link], boxes)).toEqual([]);
  });

  it('drops a link that 60% overlaps a deleted box', () => {
    const link = [0, 0, 10, 10]; // area 100
    const boxes = [{ x: -1, y: 0, width: 7, height: 10 }]; // overlap 6x10 = 60
    expect(linksOverDeleted([link], boxes)).toEqual([0]);
  });

  it('normalizes a rect whose corners come in reverse order', () => {
    const boxes = [{ x: 0, y: 0, width: 100, height: 100 }];
    expect(linksOverDeleted([[20, 20, 10, 10]], boxes)).toEqual([0]);
  });

  it('never drops a zero-area link rect', () => {
    const boxes = [{ x: 0, y: 0, width: 100, height: 100 }];
    expect(linksOverDeleted([[5, 5, 5, 5]], boxes)).toEqual([]);
  });

  it('drops nothing when there are no deleted boxes', () => {
    expect(linksOverDeleted([[0, 0, 10, 10]], [])).toEqual([]);
  });
});
