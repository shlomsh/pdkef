import { describe, expect, it } from 'vitest';
import { englishMergeMessages } from '../messages';
import { englishShellMessages } from '#shell/shellMessages.ts';
import { MergeFileError } from './merge.js';
import { draftStatusLabelOf, failedFileOf, sortOptionsOf } from './mergeView.ts';
import type { FileEntry } from './mergeModel.ts';

const entry = (id: number, error?: 'encrypted' | 'unreadable'): FileEntry => ({ id, file: new File([], `${id}.pdf`), pageCount: 1, error } as unknown as FileEntry);

describe('failedFileOf', () => {
  it('reports nothing when no file failed', () => {
    expect(failedFileOf([entry(0), entry(1)], null)).toEqual({ failedEntry: null, failedReason: null });
  });
  it('prefers an inspected file error', () => {
    const entries = [entry(0), entry(1, 'encrypted')];
    expect(failedFileOf(entries, null)).toEqual({ failedEntry: entries[1], failedReason: 'encrypted' });
  });
  it('falls back to the merge error, by file index and reason', () => {
    const entries = [entry(0), entry(1)];
    const err = new MergeFileError('x', { fileIndex: 1, reason: 'encrypted' });
    expect(failedFileOf(entries, err)).toEqual({ failedEntry: entries[1], failedReason: 'encrypted' });
  });
  it('ignores an error that is not a file error', () => {
    expect(failedFileOf([entry(0)], new Error('x')).failedEntry).toBeNull();
  });
});

describe('draftStatusLabelOf', () => {
  it('maps each save state to its label and idle to none', () => {
    const sm = englishShellMessages;
    expect(draftStatusLabelOf('saved', sm)).toBe(sm.draftSaved);
    expect(draftStatusLabelOf('pending', sm)).toBe(sm.draftSaving);
    expect(draftStatusLabelOf('error', sm)).toBe(sm.draftNotSaved);
    expect(draftStatusLabelOf('conflict', sm)).toBe(sm.draftConflict);
    expect(draftStatusLabelOf('idle', sm)).toBeNull();
  });
});

describe('sortOptionsOf', () => {
  it('lists the six sort modes in order', () => {
    expect(sortOptionsOf(englishMergeMessages).map((o) => o.value)).toEqual(['added', 'reversed', 'nameAsc', 'nameDesc', 'dateAsc', 'dateDesc']);
  });
});
