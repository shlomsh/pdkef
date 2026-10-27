import { describe, expect, it } from 'vitest';
import {
  applyInspection,
  fileIndexForPlanDrop,
  insertEntriesAt,
  moveEntryTo,
  planInsertionIndex,
  recordPendingPlanIndexes,
  settlePendingPlanIndexes,
  sortFiles,
  withFileOrder,
} from './mergePlan.ts';
import { planForFile } from '../../../lib/pagePlan.ts';
import type { FileEntry, Model } from './mergeModel.ts';

function entry(id: number, name = `f${id}.pdf`, extra: Partial<FileEntry> = {}): FileEntry {
  return { id, file: new File(['x'], name), pageCount: null, pdfCreationDate: null, thumbnail: null, error: null, ...extra };
}

const model = (entries: FileEntry[], plan = [] as Model['plan']): Model => ({ entries, plan, sortMode: 'added' });

describe('planInsertionIndex', () => {
  it('appends when no later file has pages yet', () => {
    const plan = planForFile(1, 2);
    expect(planInsertionIndex(plan, [entry(1), entry(2)], 2)).toBe(2);
  });

  it('lands before the first page of a file later in the list', () => {
    const plan = planForFile(3, 2);
    expect(planInsertionIndex(plan, [entry(1), entry(2), entry(3)], 2)).toBe(0);
  });
});

describe('applyInspection', () => {
  const result = { pageCount: 2, encrypted: false, creationDate: 7 };

  it('leaves a snapshot without the entry untouched', () => {
    const snapshot = model([entry(1)]);
    expect(applyInspection(snapshot, 9, result, undefined)).toBe(snapshot);
  });

  it('sets the count, date and pages at the list-derived position', () => {
    const next = applyInspection(model([entry(1), entry(2)], planForFile(1, 1)), 2, result, undefined);
    expect(next.entries[1]).toMatchObject({ pageCount: 2, pdfCreationDate: 7, error: null });
    expect(next.plan.map((p) => p.fileId)).toEqual([1, 2, 2]);
  });

  it('places pages at the recorded grid index, clamped to the plan', () => {
    const snapshot = model([entry(1), entry(2)], planForFile(1, 2));
    expect(applyInspection(snapshot, 2, result, 1).plan.map((p) => p.fileId)).toEqual([1, 2, 2, 1]);
    expect(applyInspection(snapshot, 2, result, 99).plan.map((p) => p.fileId)).toEqual([1, 1, 2, 2]);
  });

  it('marks a locked file without giving it pages', () => {
    const next = applyInspection(model([entry(1)]), 1, { pageCount: 1, encrypted: true }, undefined);
    expect(next.entries[0].error).toBe('encrypted');
    expect(next.plan).toEqual([]);
  });

  it('is idempotent for a file that already has pages', () => {
    const once = applyInspection(model([entry(1)]), 1, result, undefined);
    expect(applyInspection(once, 1, result, undefined).plan).toEqual(once.plan);
  });
});

describe('pending plan indexes', () => {
  it('records one index per new entry without touching the input', () => {
    const before = new Map([[1, 0]]);
    const after = recordPendingPlanIndexes(before, [2, 3], 4);
    expect([...after]).toEqual([[1, 0], [2, 4], [3, 4]]);
    expect([...before]).toEqual([[1, 0]]);
  });

  it('moves later records past the pages just placed', () => {
    const settled = settlePendingPlanIndexes(new Map([[1, 2], [2, 2], [3, 0]]), 1, { pageCount: 3, encrypted: false });
    expect([...settled]).toEqual([[2, 5], [3, 0]]);
  });

  it('keeps the others where they were when the file was locked', () => {
    const settled = settlePendingPlanIndexes(new Map([[1, 2], [2, 2]]), 1, { pageCount: 3, encrypted: true });
    expect([...settled]).toEqual([[2, 2]]);
  });

  it('does nothing for a file with no record', () => {
    const pending = new Map([[2, 2]]);
    expect([...settlePendingPlanIndexes(pending, 1, { pageCount: 3, encrypted: false })]).toEqual([[2, 2]]);
  });
});

describe('fileIndexForPlanDrop', () => {
  const entries = [entry(1), entry(2)];
  const plan = [...planForFile(1, 2), ...planForFile(2, 2)];

  it('slots between files at a file boundary', () => {
    expect(fileIndexForPlanDrop(plan, entries, 2)).toBe(1);
    expect(fileIndexForPlanDrop(plan, entries, 0)).toBe(0);
  });

  it('appends inside another file or past the end', () => {
    expect(fileIndexForPlanDrop(plan, entries, 1)).toBe(-1);
    expect(fileIndexForPlanDrop(plan, entries, 4)).toBe(-1);
  });
});

describe('entry list edits', () => {
  const list = [entry(1), entry(2), entry(3)];

  it('inserts at an index and appends when it is out of range', () => {
    expect(insertEntriesAt(list, [entry(9)], 1).map((e) => e.id)).toEqual([1, 9, 2, 3]);
    expect(insertEntriesAt(list, [entry(9)], -1).map((e) => e.id)).toEqual([1, 2, 3, 9]);
    expect(insertEntriesAt(list, [entry(9)], 4).map((e) => e.id)).toEqual([1, 2, 3, 9]);
  });

  it('moves one entry without mutating the input', () => {
    expect(moveEntryTo(list, 0, 2).map((e) => e.id)).toEqual([2, 3, 1]);
    expect(list.map((e) => e.id)).toEqual([1, 2, 3]);
  });
});

describe('sortFiles', () => {
  const list = [entry(2, 'b.pdf'), entry(1, 'c.pdf'), entry(3, 'a.pdf')];

  it('reverses the current order', () => {
    expect(sortFiles(list, 'reversed').map((e) => e.id)).toEqual([3, 1, 2]);
  });

  it('restores the order files were added in', () => {
    expect(sortFiles(list, 'added').map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('sorts by name', () => {
    expect(sortFiles(list, 'nameAsc').map((e) => e.file.name)).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(sortFiles(list, 'nameDesc').map((e) => e.file.name)).toEqual(['c.pdf', 'b.pdf', 'a.pdf']);
  });
});

describe('withFileOrder', () => {
  it('regroups the plan around the new order and records the mode', () => {
    const current = model([entry(1), entry(2)], [...planForFile(1, 1), ...planForFile(2, 1)]);
    const next = withFileOrder(current, [entry(2), entry(1)], 'reversed');
    expect(next.plan.map((p) => p.fileId)).toEqual([2, 1]);
    expect(next.sortMode).toBe('reversed');
  });
});
