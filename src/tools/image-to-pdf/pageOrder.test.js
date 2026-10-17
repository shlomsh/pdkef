import { describe, expect, it } from 'vitest';
import { defaultOutputName, moveEntry, orderKey, reorderEntries, sortEntries } from './pageOrder.js';

const e = (id, name, lastModified = 0) => ({ id, file: { name, lastModified } });

describe('pageOrder', () => {
  const list = [e(3, 'c.png'), e(1, 'a.png'), e(2, 'b.png')];

  it('keys the order by entry ids', () => {
    expect(orderKey(list)).toBe('3,1,2');
    expect(orderKey([])).toBe('');
  });

  it('moves an entry by a delta and stops at the ends', () => {
    expect(orderKey(moveEntry(list, 3, 1))).toBe('1,3,2');
    expect(moveEntry(list, 3, -1)).toBe(list);
    expect(moveEntry(list, 2, 1)).toBe(list);
    expect(moveEntry(list, 99, 1)).toBe(list);
  });

  it('reorders by index and leaves the input alone', () => {
    expect(orderKey(reorderEntries(list, 0, 2))).toBe('1,2,3');
    expect(orderKey(list)).toBe('3,1,2');
  });

  it('sorts by name and by date, both ways', () => {
    expect(orderKey(sortEntries(list, 'nameAsc'))).toBe('1,2,3');
    expect(orderKey(sortEntries(list, 'nameDesc'))).toBe('3,2,1');
    const dated = [e(1, 'x.png', 30), e(2, 'y.png', 10), e(3, 'z.png', 20)];
    expect(orderKey(sortEntries(dated, 'dateAsc'))).toBe('2,3,1');
    expect(orderKey(sortEntries(dated, 'dateDesc'))).toBe('1,3,2');
    expect(sortEntries(list, 'custom')).toBe(list);
  });

  it('names the PDF after the first image, without its extension', () => {
    expect(defaultOutputName(list)).toBe('c');
    expect(defaultOutputName([e(1, 'holiday.photo.JPG')])).toBe('holiday.photo');
    expect(defaultOutputName([])).toBe('images');
    expect(defaultOutputName([e(1, '.png')])).toBe('images');
  });
});
