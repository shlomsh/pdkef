import { describe, expect, it } from 'vitest';
import { moveEntry, outputPageCount, planForFile, planKey, rotateEntry, updateEntry, type PlanEntry } from './pagePlan.ts';

describe('planForFile', () => {
  it('builds one entry per page, in order, unrotated and unskipped', () => {
    expect(planForFile(7, 3)).toEqual([
      { key: '7:0', fileId: 7, pageIndex: 0, rotation: 0, skipped: false },
      { key: '7:1', fileId: 7, pageIndex: 1, rotation: 0, skipped: false },
      { key: '7:2', fileId: 7, pageIndex: 2, rotation: 0, skipped: false },
    ]);
  });

  it('returns an empty plan for a zero-page file', () => {
    expect(planForFile(1, 0)).toEqual([]);
  });
});

describe('moveEntry', () => {
  it('moves a page from one index to another', () => {
    const plan = planForFile(1, 3); // pages 0,1,2
    const moved = moveEntry(plan, 0, 2);
    expect(moved.map((e) => e.pageIndex)).toEqual([1, 2, 0]);
  });

  it('clamps an out-of-range fromIndex', () => {
    const plan = planForFile(1, 3);
    const moved = moveEntry(plan, 99, 0);
    // Clamped fromIndex lands on the last entry (pageIndex 2), moved to front.
    expect(moved.map((e) => e.pageIndex)).toEqual([2, 0, 1]);
  });

  it('clamps a negative fromIndex', () => {
    const plan = planForFile(1, 3);
    const moved = moveEntry(plan, -5, 2);
    expect(moved.map((e) => e.pageIndex)).toEqual([1, 2, 0]);
  });

  it('clamps an out-of-range toIndex to the end', () => {
    const plan = planForFile(1, 3);
    const moved = moveEntry(plan, 0, 99);
    expect(moved.map((e) => e.pageIndex)).toEqual([1, 2, 0]);
  });

  it('is a no-op returning a copy for an empty plan', () => {
    const moved = moveEntry([], 0, 1);
    expect(moved).toEqual([]);
  });

  it('never mutates the input array', () => {
    const plan = planForFile(1, 3);
    const before = JSON.stringify(plan);
    moveEntry(plan, 0, 2);
    expect(JSON.stringify(plan)).toBe(before);
  });
});

describe('updateEntry', () => {
  it('patches only the matching entry', () => {
    const plan = planForFile(1, 2);
    const updated = updateEntry(plan, '1:0', { skipped: true });
    expect(updated[0]).toEqual({ key: '1:0', fileId: 1, pageIndex: 0, rotation: 0, skipped: true });
    expect(updated[1]).toEqual(plan[1]);
  });

  it('is a no-op (structurally equal) for an unknown key', () => {
    const plan = planForFile(1, 2);
    expect(updateEntry(plan, 'nope', { skipped: true })).toEqual(plan);
  });
});

describe('rotateEntry', () => {
  it('adds a +90 delta', () => {
    const plan = planForFile(1, 1);
    const rotated = rotateEntry(plan, '1:0', 90);
    expect(rotated[0].rotation).toBe(90);
  });

  it('normalises a negative rotation into 0..270', () => {
    const plan = updateEntry(planForFile(1, 1), '1:0', { rotation: 0 });
    const rotated = rotateEntry(plan, '1:0', -90);
    expect(rotated[0].rotation).toBe(270);
  });

  it('wraps past 360 back to 0', () => {
    const plan: PlanEntry[] = [{ key: '1:0', fileId: 1, pageIndex: 0, rotation: 270, skipped: false }];
    const rotated = rotateEntry(plan, '1:0', 90);
    expect(rotated[0].rotation).toBe(0);
  });

  it('is a no-op for an unknown key', () => {
    const plan = planForFile(1, 1);
    expect(rotateEntry(plan, 'nope', 90)).toEqual(plan);
  });
});

describe('outputPageCount', () => {
  it('counts only unskipped entries', () => {
    const plan = updateEntry(planForFile(1, 3), '1:1', { skipped: true });
    expect(outputPageCount(plan)).toBe(2);
  });

  it('is 0 for an empty plan', () => {
    expect(outputPageCount([])).toBe(0);
  });
});

describe('planKey', () => {
  it('is empty for an empty plan', () => {
    expect(planKey([])).toBe('');
  });

  it('reads file, page, rotation and skipped in order', () => {
    const plan = rotateEntry(updateEntry(planForFile(3, 2), '3:1', { skipped: true }), '3:0', 90);
    expect(planKey(plan)).toBe('3.0.90.0,3.1.0.1');
  });

  it('changes when pages are reordered, and not when the plan is the same', () => {
    const plan = planForFile(1, 3);
    expect(planKey(moveEntry(plan, 0, 2))).not.toBe(planKey(plan));
    expect(planKey([...plan])).toBe(planKey(plan));
  });
});
