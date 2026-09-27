import { describe, expect, it } from 'vitest';
import { linkedChanges, linkMembers, type LinkedElement } from './links.ts';

interface Box extends LinkedElement {
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  strength: number;
  repeatGroupId?: string;
  findSetId?: string;
}

function box(overrides: Partial<Box> & { id: string }): Box {
  return {
    pageIndex: 0,
    type: 'blur',
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    color: '#000',
    strength: 5,
    ...overrides,
  };
}

describe('linkedChanges', () => {
  it('an unlinked box yields just itself', () => {
    const a = box({ id: 'a' });
    const result = linkedChanges([a], 'a', { left: 20 });
    expect(result).toEqual([{ id: 'a', changes: { left: 20 } }]);
  });

  it('a repeated box geometry change reaches its copies but not its find-set siblings', () => {
    const a = box({ id: 'a', repeatGroupId: 'g1', findSetId: 'f1' });
    const copy = box({ id: 'copy', pageIndex: 1, repeatGroupId: 'g1' });
    const findSibling = box({ id: 'sib', findSetId: 'f1' });
    const result = linkedChanges([a, copy, findSibling], 'a', { left: 30 });
    expect(result).toEqual([
      { id: 'a', changes: { left: 30 } },
      { id: 'copy', changes: { left: 30 } },
    ]);
  });

  it('a box in both a repeat group and a find set changing strength yields one entry per box, no duplicates, edited box first', () => {
    const a = box({ id: 'a', repeatGroupId: 'g1', findSetId: 'f1' });
    const groupSibling = box({ id: 'copy', pageIndex: 1, repeatGroupId: 'g1', findSetId: 'f1' });
    const findSibling = box({ id: 'sib', findSetId: 'f1' });
    const result = linkedChanges([a, groupSibling, findSibling], 'a', { strength: 9 });
    expect(result).toEqual([
      { id: 'a', changes: { strength: 9 } },
      { id: 'copy', changes: { strength: 9 } },
      { id: 'sib', changes: { strength: 9 } },
    ]);
  });

  it('a non-shared field touches only the box', () => {
    const a = box({ id: 'a', repeatGroupId: 'g1', findSetId: 'f1' });
    const copy = box({ id: 'copy', pageIndex: 1, repeatGroupId: 'g1', findSetId: 'f1' });
    const result = linkedChanges([a, copy], 'a', { repeatGroupId: undefined });
    expect(result).toEqual([{ id: 'a', changes: { repeatGroupId: undefined } }]);
  });
});

describe('linkMembers', () => {
  it('repeatGroup: every box in the group, box included', () => {
    const a = box({ id: 'a', repeatGroupId: 'g1' });
    const copy = box({ id: 'copy', pageIndex: 1, repeatGroupId: 'g1' });
    const other = box({ id: 'other' });
    expect(linkMembers([a, copy, other], 'a', 'repeatGroup')).toEqual([a, copy]);
  });

  it('findSet: every box in the set, box included', () => {
    const a = box({ id: 'a', findSetId: 'f1' });
    const sib = box({ id: 'sib', findSetId: 'f1' });
    const other = box({ id: 'other' });
    expect(linkMembers([a, sib, other], 'a', 'findSet')).toEqual([a, sib]);
  });

  it('a box with no set returns just itself, for both kinds', () => {
    const a = box({ id: 'a' });
    const other = box({ id: 'other' });
    expect(linkMembers([a, other], 'a', 'repeatGroup')).toEqual([a]);
    expect(linkMembers([a, other], 'a', 'findSet')).toEqual([a]);
  });
});
