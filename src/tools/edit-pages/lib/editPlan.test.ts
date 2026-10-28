import { describe, expect, it } from 'vitest';
import { movePlanEntry, planForFile, rotateEntry, updateEntry } from '../../../lib/pages/pagePlan.ts';
import { editOptionsFromPlan } from './editPlan.ts';

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
    plan = movePlanEntry(plan, 0, 3); // 2, 3, 4, 1
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
