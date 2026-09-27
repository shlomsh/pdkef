import { describe, expect, it } from 'vitest';
import { deleteSpansByPage } from './useDeletePreviews.ts';

describe('deleteSpansByPage', () => {
  it('groups delete elements by page', () => {
    const byPage = deleteSpansByPage([
      { pageIndex: 0, type: 'delete', start: 10, end: 20 },
      { pageIndex: 1, type: 'delete', start: 5, end: 8 },
      { pageIndex: 0, type: 'delete', start: 30, end: 40 },
    ]);

    expect([...byPage.keys()].sort()).toEqual([0, 1]);
    expect(byPage.get(0)).toEqual([
      { start: 10, end: 20 },
      { start: 30, end: 40 },
    ]);
    expect(byPage.get(1)).toEqual([{ start: 5, end: 8 }]);
  });

  it('ignores non-delete elements', () => {
    const byPage = deleteSpansByPage([
      { pageIndex: 0, type: 'redact', start: 1, end: 2 },
    ]);
    expect(byPage.size).toBe(0);
  });

  it('sorts a page spans so the key is stable regardless of add order', () => {
    const a = deleteSpansByPage([
      { pageIndex: 0, type: 'delete', start: 30, end: 40 },
      { pageIndex: 0, type: 'delete', start: 10, end: 20 },
    ]);
    const b = deleteSpansByPage([
      { pageIndex: 0, type: 'delete', start: 10, end: 20 },
      { pageIndex: 0, type: 'delete', start: 30, end: 40 },
    ]);
    expect(a.get(0)).toEqual(b.get(0));
  });

  it('returns an empty map for no delete elements', () => {
    expect(deleteSpansByPage([]).size).toBe(0);
  });
});
