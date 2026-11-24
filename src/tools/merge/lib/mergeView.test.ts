import { describe, expect, it } from 'vitest';
import { englishMergeMessages } from '../messages';
import { englishShellMessages } from '#shell/shellMessages.ts';
import { MergeFileError } from './merge.js';
import { draftStatusLabelOf, failedFileOf, lockedStateOf, mergeSignatureOf, outputTitleOf, readyFilesOf, sortOptionsOf } from './mergeView.ts';
import type { FileEntry } from './mergeModel.ts';
import type { LockedProbe } from '../state/mergeState.ts';

const entry = (id: number, error?: 'encrypted' | 'unreadable', name = `${id}.pdf`, extra: Partial<FileEntry> = {}): FileEntry => ({ id, file: new File([], name), pageCount: 1, error, ...extra } as unknown as FileEntry);

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

describe('mergeSignatureOf', () => {
  it('stays the same when only a thumbnail arrives, and changes with a page count or an error', () => {
    const plain = [entry(0), entry(1)];
    const withThumbnail = [entry(0, undefined, '0.pdf', { thumbnail: 'data:image/png;base64,' } as Partial<FileEntry>), entry(1)];
    expect(mergeSignatureOf(withThumbnail)).toBe(mergeSignatureOf(plain));
    expect(mergeSignatureOf([entry(0), entry(1, undefined, '1.pdf', { pageCount: 4 })])).not.toBe(mergeSignatureOf(plain));
    expect(mergeSignatureOf([entry(0), entry(1, 'unreadable')])).not.toBe(mergeSignatureOf(plain));
  });
});

describe('readyFilesOf', () => {
  it('returns the files in list order once two or more are readable, else null', () => {
    const ready = [entry(0), entry(1)];
    expect(readyFilesOf(ready)).toEqual(ready.map((e) => e.file));
    expect(readyFilesOf([entry(0)])).toBeNull();
    expect(readyFilesOf([entry(0), entry(1, undefined, '1.pdf', { pageCount: undefined })])).toBeNull();
    expect(readyFilesOf([entry(0), entry(1, 'encrypted')])).toBeNull();
  });
});

describe('outputTitleOf', () => {
  it('names the output after the first readable file, not a locked one that leads', () => {
    expect(outputTitleOf([entry(0, 'encrypted', 'locked.pdf'), entry(1, undefined, 'plain.pdf')], null)).toBe('merged_plain');
  });
  it('falls back to the first file when every file failed, and to nothing for no files', () => {
    expect(outputTitleOf([entry(0, 'encrypted', 'locked.pdf')], null)).toBe('merged_locked');
    expect(outputTitleOf([], null)).toBe('');
  });
  it('keeps a typed name over the automatic one', () => {
    expect(outputTitleOf([entry(0, undefined, 'a.pdf')], 'mine')).toBe('mine');
  });
  it('keeps the merged_ prefix untranslated ahead of a Hebrew first file', () => {
    expect(outputTitleOf([entry(0, undefined, 'אישור שנתי.pdf'), entry(1)], null)).toBe('merged_אישור שנתי');
  });
});

describe('lockedStateOf', () => {
  const locked = entry(0, 'encrypted', 'locked.pdf');
  const probe = (kind: LockedProbe['kind'], file: File = locked.file): LockedProbe => ({ file, kind, bytes: kind ? new ArrayBuffer(1) : null });
  it('shows neither the error nor the locked state while the probe has not answered', () => {
    const state = lockedStateOf([locked], null);
    expect(state).toMatchObject({ lockedFile: locked.file, probeSettled: false, needsUnlock: null, lockedView: true });
  });
  it('treats an answer for another file as unanswered', () => {
    expect(lockedStateOf([locked], probe('needs-password', new File([], 'other.pdf'))).probeSettled).toBe(false);
  });
  it('shows the locked state once the probe says password or owner restriction', () => {
    const state = lockedStateOf([locked], probe('owner-restricted'));
    expect(state.probeSettled).toBe(true);
    expect(state.needsUnlock).toMatchObject({ file: locked.file, kind: 'owner-restricted' });
    expect(state.lockedView).toBe(true);
  });
  it('leaves the inline error when the probe cannot say', () => {
    expect(lockedStateOf([locked], probe(null))).toMatchObject({ probeSettled: true, needsUnlock: null, lockedView: false });
  });
  it('is not locked among several files, or for an unreadable single file', () => {
    expect(lockedStateOf([locked, entry(1)], null)).toMatchObject({ lockedFile: null, probeSettled: true, lockedView: false });
    expect(lockedStateOf([entry(0, 'unreadable')], null).lockedFile).toBeNull();
  });
});
