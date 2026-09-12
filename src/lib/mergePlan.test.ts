import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OUTPUT_NAME_TEMPLATE,
  fileOrder,
  insertPages,
  isGrouped,
  mergedFileName,
  mergedTitle,
  moveEntry,
  moveFileBlock,
  outputPageCount,
  planForFile,
  regroupPlan,
  removeFile,
  rotateEntry,
  toMergeMap,
  updateEntry,
  type PlanEntry,
} from './mergePlan.ts';

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

describe('fileOrder', () => {
  it('returns distinct file ids in first-appearance order', () => {
    const plan = [...planForFile(2, 2), ...planForFile(1, 1), ...planForFile(2, 1)];
    expect(fileOrder(plan)).toEqual([2, 1]);
  });

  it('is empty for an empty plan', () => {
    expect(fileOrder([])).toEqual([]);
  });
});

describe('isGrouped', () => {
  it('is true for an empty plan', () => {
    expect(isGrouped([])).toBe(true);
  });

  it('is true when each file is one contiguous run', () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    expect(isGrouped(plan)).toBe(true);
  });

  it('is false once a cross-file move interleaves pages', () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    // Move file 2's first page in between file 1's two pages.
    const moved = moveEntry(plan, 2, 1);
    expect(isGrouped(moved)).toBe(false);
  });

  it('is false when a file reappears after being interrupted', () => {
    const a1 = { key: 'a:0', fileId: 1, pageIndex: 0, rotation: 0, skipped: false };
    const b1 = { key: 'b:0', fileId: 2, pageIndex: 0, rotation: 0, skipped: false };
    const b2 = { key: 'b:1', fileId: 2, pageIndex: 1, rotation: 0, skipped: false };
    const a2 = { key: 'a:1', fileId: 1, pageIndex: 1, rotation: 0, skipped: false };
    expect(isGrouped([a1, b1, b2, a2])).toBe(false);
  });
});

describe('regroupPlan', () => {
  it('groups entries by file in the given order, keeping intra-file order', () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    const grouped = regroupPlan(plan, [2, 1]);
    expect(grouped.map((e) => e.key)).toEqual(['2:0', '2:1', '1:0', '1:1']);
  });

  it('keeps an unlisted file after the listed ones, in its prior relative position', () => {
    const plan = [...planForFile(1, 1), ...planForFile(2, 1), ...planForFile(3, 1)];
    const grouped = regroupPlan(plan, [3]);
    expect(grouped.map((e) => e.fileId)).toEqual([3, 1, 2]);
  });

  it('regroups an interleaved (ungrouped) plan back into blocks', () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    const interleaved = moveEntry(plan, 2, 1); // file 2's page in between file 1's pages
    expect(isGrouped(interleaved)).toBe(false);
    const grouped = regroupPlan(interleaved, fileOrder(interleaved));
    expect(isGrouped(grouped)).toBe(true);
  });

  it('handles an empty plan', () => {
    expect(regroupPlan([], [1, 2])).toEqual([]);
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

describe('moveFileBlock', () => {
  it('reorders whole file blocks among each other', () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2), ...planForFile(3, 1)];
    const moved = moveFileBlock(plan, 3, 0);
    expect(fileOrder(moved)).toEqual([3, 1, 2]);
    // Intra-file order preserved.
    expect(moved.filter((e) => e.fileId === 1).map((e) => e.pageIndex)).toEqual([0, 1]);
  });

  it('is a no-op copy when the fileId is not in the plan', () => {
    const plan = planForFile(1, 2);
    expect(moveFileBlock(plan, 99, 0)).toEqual(plan);
  });
});

describe('insertPages', () => {
  it('splices entries in at the given index', () => {
    const plan = planForFile(1, 2);
    const inserted = insertPages(plan, planForFile(2, 1), 1);
    expect(inserted.map((e) => e.key)).toEqual(['1:0', '2:0', '1:1']);
  });

  it('clamps the index past the end to append', () => {
    const plan = planForFile(1, 2);
    const inserted = insertPages(plan, planForFile(2, 1), 99);
    expect(inserted.map((e) => e.key)).toEqual(['1:0', '1:1', '2:0']);
  });

  it('clamps a negative index to the start', () => {
    const plan = planForFile(1, 2);
    const inserted = insertPages(plan, planForFile(2, 1), -3);
    expect(inserted.map((e) => e.key)).toEqual(['2:0', '1:0', '1:1']);
  });
});

describe('removeFile', () => {
  it('drops every entry for the given file, leaving the rest untouched', () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    const removed = removeFile(plan, 1);
    expect(removed.map((e) => e.key)).toEqual(['2:0', '2:1']);
  });

  it('is a no-op when the fileId is absent', () => {
    const plan = planForFile(1, 2);
    expect(removeFile(plan, 99)).toEqual(plan);
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

describe('toMergeMap', () => {
  it('maps fileId to its position in the given fileIds array', () => {
    const plan = [...planForFile(10, 1), ...planForFile(20, 1)];
    const map = toMergeMap(plan, [20, 10]);
    expect(map).toEqual([
      { fileIndex: 1, pageIndex: 0, rotation: 0, skipped: false },
      { fileIndex: 0, pageIndex: 0, rotation: 0, skipped: false },
    ]);
  });

  it('throws for a plan entry whose fileId is not in fileIds', () => {
    const plan = planForFile(10, 1);
    expect(() => toMergeMap(plan, [20])).toThrow();
  });

  it('returns an empty array for an empty plan', () => {
    expect(toMergeMap([], [1, 2])).toEqual([]);
  });
});

describe('mergedTitle / mergedFileName', () => {
  it('is just the base name when there are no other files', () => {
    expect(mergedTitle('Invoice 2024-03-01.pdf', 0)).toBe('Invoice 2024-03-01');
  });

  it('applies the default template with other files', () => {
    expect(mergedTitle('Invoice 2024-03-01.pdf', 3)).toBe('Invoice 2024-03-01 + 3 more');
  });

  it('strips only the final extension', () => {
    expect(mergedTitle('archive.tar.gz', 0)).toBe('archive.tar');
  });

  it('keeps a dotfile-style leading dot with no other extension', () => {
    expect(mergedTitle('.hidden.pdf', 0)).toBe('.hidden');
  });

  it('falls back to the raw name when there is no extension to strip', () => {
    expect(mergedTitle('README', 2)).toBe('README + 2 more');
  });

  it('never returns an empty string, falling back to "merged"', () => {
    expect(mergedTitle('', 0)).toBe('merged');
  });

  it('treats a name with only a leading dot as a dotfile, not an extension to strip', () => {
    // Same rule as '.hidden.pdf': the leading dot is not treated as marking
    // an extension, so '.pdf' alone has nothing to strip.
    expect(mergedTitle('.pdf', 0)).toBe('.pdf');
  });

  it('supports a template with the placeholders reordered, e.g. a Hebrew-style phrasing', () => {
    const template = '{count} more + {name}';
    expect(mergedTitle('Invoice.pdf', 3, template)).toBe('3 more + Invoice');
  });

  it('mergedFileName appends .pdf to the title', () => {
    expect(mergedFileName('Invoice 2024-03-01.pdf', 3)).toBe('Invoice 2024-03-01 + 3 more.pdf');
    expect(mergedFileName('Invoice 2024-03-01.pdf', 0)).toBe('Invoice 2024-03-01.pdf');
  });

  it('exposes the default template string', () => {
    expect(DEFAULT_OUTPUT_NAME_TEMPLATE).toBe('{name} + {count} more');
  });
});
