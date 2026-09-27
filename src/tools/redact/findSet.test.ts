import { describe, expect, it } from 'vitest';
import { findSetChanges, findSetKey, findSetMembers, withoutFindSet, type FindSetElement } from './findSet.ts';

const box = (id: string, extra: Record<string, unknown> = {}): FindSetElement => ({ id, type: 'blur', left: 1, top: 2, width: 3, height: 4, ...extra });

describe('findSet', () => {
  const els = [box('a', { findSetId: 's1' }), box('b', { findSetId: 's1', left: 50 }), box('c', { findSetId: 's2' }), box('d')];

  it('a box with no set is a set of one', () => {
    expect(findSetKey(els[3])).toBeNull();
    expect(findSetMembers(els, 'd').map((el) => el.id)).toEqual(['d']);
  });

  it('members are exactly the boxes of the same search', () => {
    expect(findSetMembers(els, 'b').map((el) => el.id)).toEqual(['a', 'b']);
    expect(findSetMembers(els, 'missing')).toEqual([]);
  });

  it('shares blur strength across the set, never geometry', () => {
    expect(findSetChanges(els, 'a', { strength: 'light', left: 9 })).toEqual([
      { id: 'a', changes: { strength: 'light', left: 9 } },
      { id: 'b', changes: { strength: 'light' } },
    ]);
    expect(findSetChanges(els, 'a', { left: 9 })).toEqual([{ id: 'a', changes: { left: 9 } }]);
  });

  it('a copy leaves the set', () => {
    expect(withoutFindSet(els[0])).toEqual(box('a'));
    expect(withoutFindSet(els[3])).toBe(els[3]);
  });
});
