import { describe, expect, it } from 'vitest';
import { ALL_CLEAR, NOTHING_COVERED_SHORT, picturePagesNote } from './checkCopy.ts';
import { checkView } from './checkView.ts';
import type { Finding, TermResult } from './types.ts';

const result = (label: string, findings: Finding[] = []): TermResult => ({
  term: { label, source: 'covered', finder: () => [] },
  findings,
});
const base = { results: [], typed: [], pageCount: 2, picturePages: [], unsolidPages: [], detailsSurvived: 0, hasNote: false };

describe('checkView', () => {
  it('is closed with the all-clear line when nothing was found', () => {
    const view = checkView({ ...base, results: [result('Haifa')] });
    expect(view.expanded).toBe(false);
    expect(view.lines).toEqual([ALL_CLEAR]);
    expect(view.rows).toHaveLength(1);
  });

  it('says nothing was covered when there are no automatic results', () => {
    expect(checkView(base).lines).toEqual([NOTHING_COVERED_SHORT]);
  });

  it('opens for a finding, an unsolid box, a surviving detail or a note', () => {
    expect(checkView({ ...base, results: [result('A', [{ kind: 'in-text', pageIndex: 0 }])] }).expanded).toBe(true);
    expect(checkView({ ...base, typed: [result('A', [{ kind: 'in-text', pageIndex: 0 }])] }).expanded).toBe(true);
    expect(checkView({ ...base, unsolidPages: [0] }).expanded).toBe(true);
    expect(checkView({ ...base, detailsSurvived: 1 }).expanded).toBe(true);
    expect(checkView({ ...base, hasNote: true }).expanded).toBe(true);
  });

  it('drops no-finding rows when every page is a picture, keeping typed ones', () => {
    const view = checkView({ ...base, pageCount: 1, picturePages: [0], results: [result('A')], typed: [result('T')] });
    expect(view.lines).toEqual([picturePagesNote([0])]);
    expect(view.rows.map((row) => row.term.label)).toEqual(['T']);
  });

  it('adds the picture line after the all-clear line on a mixed file', () => {
    const view = checkView({ ...base, picturePages: [1], results: [result('A')] });
    expect(view.lines).toEqual([ALL_CLEAR, picturePagesNote([1])]);
  });
});
