import { describe, expect, it } from 'vitest';
import {
  fileOrder,
  insertPages,
  isGrouped,
  isInListOrder,
  mergedFileName,
  mergedTitle,
  moveFileBlock,
  regroupPlan,
  removeFile,
  sanitizeOutputName,
  toMergeMap,
} from './mergePlan.ts';
import { movePlanEntry, planForFile } from '../../lib/pagePlan.ts';

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
    const moved = movePlanEntry(plan, 2, 1);
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

describe('isInListOrder', () => {
  it('is true when grouped and the plan order matches the list order', () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    expect(isInListOrder(plan, [1, 2])).toBe(true);
  });

  it('is false when grouped but a file block moved relative to the list', () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    expect(isInListOrder(plan, [2, 1])).toBe(false);
  });

  it('is false when the plan is interleaved', () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    const interleaved = movePlanEntry(plan, 2, 1);
    expect(isInListOrder(interleaved, [1, 2])).toBe(false);
  });

  it('ignores a file with no plan entries yet, still true', () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    // File 3 has been added to the list but its page count isn't known yet,
    // so it has no entries in the plan - it should not count against order.
    expect(isInListOrder(plan, [1, 3, 2])).toBe(true);
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
    const interleaved = movePlanEntry(plan, 2, 1); // file 2's page in between file 1's pages
    expect(isGrouped(interleaved)).toBe(false);
    const grouped = regroupPlan(interleaved, fileOrder(interleaved));
    expect(isGrouped(grouped)).toBe(true);
  });

  it('handles an empty plan', () => {
    expect(regroupPlan([], [1, 2])).toEqual([]);
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
  it('prefixes the base name with merged_, regardless of how many other files there are', () => {
    expect(mergedTitle('Invoice 2024-03-01.pdf')).toBe('merged_Invoice 2024-03-01');
  });

  it('strips only the final extension', () => {
    expect(mergedTitle('archive.tar.gz')).toBe('merged_archive.tar');
  });

  it('keeps a dotfile-style leading dot with no other extension', () => {
    expect(mergedTitle('.hidden.pdf')).toBe('merged_.hidden');
  });

  it('falls back to the raw name when there is no extension to strip', () => {
    expect(mergedTitle('README')).toBe('merged_README');
  });

  it('never returns an empty string, falling back to "merged_merged"', () => {
    expect(mergedTitle('')).toBe('merged_merged');
  });

  it('treats a name with only a leading dot as a dotfile, not an extension to strip', () => {
    // Same rule as '.hidden.pdf': the leading dot is not treated as marking
    // an extension, so '.pdf' alone has nothing to strip.
    expect(mergedTitle('.pdf')).toBe('merged_.pdf');
  });

  it('chains rather than collapsing when the first file already carries another prefix', () => {
    expect(mergedTitle('signed_form.pdf')).toBe('merged_signed_form');
  });

  it('mergedFileName appends .pdf to the title, one file or several', () => {
    expect(mergedFileName('Invoice 2024-03-01.pdf')).toBe('merged_Invoice 2024-03-01.pdf');
  });
});

describe('sanitizeOutputName', () => {
  it('trims surrounding whitespace', () => {
    expect(sanitizeOutputName('  Invoice March  ')).toBe('Invoice March');
  });

  it('strips path separators, forward and back', () => {
    expect(sanitizeOutputName('../etc/passwd\\evil')).toBe('..etcpasswdevil');
  });

  it('strips control characters but keeps everything else', () => {
    expect(sanitizeOutputName('Invoice' + String.fromCharCode(0) + ' ' + String.fromCharCode(31) + 'March')).toBe('Invoice March');
  });

  it('keeps Unicode text untouched, Hebrew included', () => {
    expect(sanitizeOutputName('חשבונית מרץ')).toBe('חשבונית מרץ');
  });

  it('caps at 120 code points without splitting a surrogate pair', () => {
    const emoji = '😀'; // a surrogate pair, 2 UTF-16 code units, 1 code point
    const raw = emoji.repeat(130);
    const result = sanitizeOutputName(raw);
    expect(Array.from(result)).toHaveLength(120);
    expect(result).toBe(emoji.repeat(120));
  });

  it('returns an empty string for a name that is only path separators and control characters', () => {
    expect(sanitizeOutputName('//\\\\ ')).toBe('');
  });
});
