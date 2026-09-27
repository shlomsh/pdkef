import { describe, expect, it } from 'vitest';
import { duplicateGroup, groupChanges, groupKey, groupMembers, repeatCopies, type GroupableElement } from './repeatGroup.ts';

const box = (id: string, pageIndex: number, extra: Partial<GroupableElement> = {}): GroupableElement => ({
  id, pageIndex, type: 'blackout', left: 10, top: 20, width: 30, height: 5, ...extra,
});

let n = 0;
const makeId = () => `new-${++n}`;

describe('repeatGroup', () => {
  it('a box with no group key is a group of one, keyed by its own id', () => {
    const a = box('a', 0);
    expect(groupKey(a)).toBe('a');
    expect(groupMembers([a, box('b', 1)], 'a').map((el) => el.id)).toEqual(['a']);
  });

  it('repeat copies join the source\'s group without changing the source', () => {
    const a = box('a', 0);
    const copies = repeatCopies(a, [a], 3, makeId);
    expect(copies.map((el) => el.pageIndex)).toEqual([1, 2]);
    expect(copies.every((el) => el.repeatGroupId === 'a')).toBe(true);
    expect(a.repeatGroupId).toBeUndefined();
    expect(groupMembers([a, ...copies], 'a')).toHaveLength(3);
  });

  it('repeat skips pages that already hold a member of the group, even if it moved', () => {
    const a = box('a', 0);
    const moved = box('m', 1, { repeatGroupId: 'a', top: 50 });
    expect(repeatCopies(a, [a, moved], 3, makeId).map((el) => el.pageIndex)).toEqual([2]);
  });

  it('repeat also skips a page with an identical unlinked box', () => {
    const a = box('a', 0);
    expect(repeatCopies(a, [a, box('x', 1)], 2, makeId)).toEqual([]);
  });

  it('an edit to a linked box carries its shared fields to every member', () => {
    const els = [box('a', 0), box('b', 1, { repeatGroupId: 'a' }), box('c', 2, { repeatGroupId: 'a' }), box('z', 1)];
    expect(groupChanges(els, 'b', { width: 40, color: '#fff' })).toEqual([
      { id: 'b', changes: { width: 40, color: '#fff' } },
      { id: 'a', changes: { width: 40, color: '#fff' } },
      { id: 'c', changes: { width: 40, color: '#fff' } },
    ]);
  });

  it('a change with no shared field touches only the box itself', () => {
    const els = [box('a', 0), box('b', 1, { repeatGroupId: 'a' })];
    expect(groupChanges(els, 'b', { repeatGroupId: 'fresh' })).toEqual([{ id: 'b', changes: { repeatGroupId: 'fresh' } }]);
  });

  it('an unlinked box (fresh key) no longer moves with its old group', () => {
    const els = [box('a', 0), box('b', 1, { repeatGroupId: 'fresh' }), box('c', 2, { repeatGroupId: 'a' })];
    expect(groupChanges(els, 'a', { top: 60 }).map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('duplicating a linked box duplicates the whole group into a new, separate group', () => {
    const els = [box('a', 0), box('b', 1, { repeatGroupId: 'a' })];
    const dupes = duplicateGroup(els, 'b', makeId);
    expect(dupes).toHaveLength(2);
    expect(dupes.map((el) => el.pageIndex)).toEqual([0, 1]);
    expect(new Set(dupes.map((el) => el.repeatGroupId)).size).toBe(1);
    expect(dupes[0].repeatGroupId).not.toBe('a');
    expect(dupes.every((el) => el.left === 14 && el.top === 24)).toBe(true);
    // Resizing the duplicate touches only the duplicate's group.
    const all = [...els, ...dupes];
    expect(groupChanges(all, dupes[1].id, { width: 5 }).map((c) => c.id).sort()).toEqual(dupes.map((el) => el.id).sort());
  });

  it('duplicating a lone box gives one box in a group of its own', () => {
    const dupes = duplicateGroup([box('a', 0, { left: 88 })], 'a', makeId);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].left).toBe(90);
    expect(groupKey(dupes[0])).toBe(dupes[0].id);
  });
});
