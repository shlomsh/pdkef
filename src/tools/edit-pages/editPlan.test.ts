import { describe, expect, it } from 'vitest';
import { moveEntry, planForFile, rotateEntry, updateEntry } from '../../lib/pagePlan.ts';
import { editOptionsFromPlan, includeAll, invert, skipAll } from './editPlan.ts';

describe('editOptionsFromPlan', () => {
  it('reads an untouched plan as the original order with nothing removed or rotated', () => {
    expect(editOptionsFromPlan(planForFile(0, 3))).toEqual({
      pageOrder: [1, 2, 3],
      removedPageNums: new Set(),
      rotations: {},
    });
  });

  it('gives the 1-based order, the skipped pages and the rotations by original page number', () => {
    let plan = planForFile(0, 4);
    plan = moveEntry(plan, 0, 3); // 2, 3, 4, 1
    plan = updateEntry(plan, '0:2', { skipped: true });
    plan = rotateEntry(plan, '0:1', 90);
    plan = rotateEntry(plan, '0:3', -90);
    expect(editOptionsFromPlan(plan)).toEqual({
      pageOrder: [2, 3, 4, 1],
      removedPageNums: new Set([3]),
      rotations: { 2: 90, 4: 270 },
    });
  });

  it('leaves a full turn out of the rotations', () => {
    let plan = planForFile(0, 1);
    for (let i = 0; i < 4; i += 1) plan = rotateEntry(plan, '0:0', 90);
    expect(editOptionsFromPlan(plan).rotations).toEqual({});
  });
});

describe('bulk updaters', () => {
  const mixed = updateEntry(planForFile(0, 3), '0:1', { skipped: true });

  it('includeAll brings every page back, and returns the same plan when none is skipped', () => {
    expect(includeAll(mixed).map((e) => e.skipped)).toEqual([false, false, false]);
    const fresh = planForFile(0, 3);
    expect(includeAll(fresh)).toBe(fresh);
  });

  it('skipAll skips every page, and returns the same plan when all are already skipped', () => {
    const all = skipAll(mixed);
    expect(all.map((e) => e.skipped)).toEqual([true, true, true]);
    expect(skipAll(all)).toBe(all);
  });

  it('invert flips each page, and twice is the original', () => {
    const flipped = invert(mixed);
    expect(flipped.map((e) => e.skipped)).toEqual([true, false, true]);
    expect(invert(flipped).map((e) => e.skipped)).toEqual([false, true, false]);
  });

  it('keeps order, rotation and keys, and leaves an empty plan alone', () => {
    const rotated = rotateEntry(mixed, '0:2', 90);
    const flipped = invert(rotated);
    expect(flipped.map((e) => [e.key, e.rotation])).toEqual([['0:0', 0], ['0:1', 0], ['0:2', 90]]);
    const empty: ReturnType<typeof planForFile> = [];
    expect(invert(empty)).toBe(empty);
    expect(includeAll(empty)).toBe(empty);
    expect(skipAll(empty)).toBe(empty);
  });
});
