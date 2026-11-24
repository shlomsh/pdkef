import { MergeFileError } from './merge.js';
import { mergedTitle } from './mergePlan.ts';
import type { LockedProbe } from '../state/mergeState.ts';
import type { NeedsUnlockKind } from '#shell/NeedsUnlock.tsx';
import type { FileEntry, SortMode } from './mergeModel.ts';
import type { MergeMessages } from '../messages';
import type { ShellMessages } from '#shell/shellMessages.ts';
import type { MergeDraftSaveState } from '../hooks/useMergeDraft.ts';

export interface FailedFile {
  failedEntry: FileEntry | null;
  failedReason: 'encrypted' | 'unreadable' | null;
}

// MERGE-04: which file failed, and why. Inspection catches most cases
// before a merge is attempted; mergePdfs's MergeFileError is the second line.
export function failedFileOf(entries: FileEntry[], preparedError: Error | null): FailedFile {
  const failedEntry = entries.find((e) => e.error)
    ?? (preparedError instanceof MergeFileError ? entries[preparedError.fileIndex] ?? null : null);
  const failedReason = failedEntry
    ? (failedEntry.error ?? (preparedError instanceof MergeFileError ? preparedError.reason : 'unreadable'))
    : null;
  return { failedEntry, failedReason };
}

export function draftStatusLabelOf(draftSaveState: MergeDraftSaveState, sm: ShellMessages): string | null {
  return draftSaveState === 'saved' ? sm.draftSaved
    : draftSaveState === 'pending' ? sm.draftSaving
      : draftSaveState === 'error' ? sm.draftNotSaved
        : draftSaveState === 'conflict' ? sm.draftConflict
          : null;
}

export function sortOptionsOf(t: MergeMessages): { value: SortMode; label: string }[] {
  return [
    { value: 'added', label: t.sortAsAdded },
    { value: 'reversed', label: t.sortReversed },
    { value: 'nameAsc', label: t.sortNameAsc },
    { value: 'nameDesc', label: t.sortNameDesc },
    { value: 'dateAsc', label: t.sortDateAsc },
    { value: 'dateDesc', label: t.sortDateDesc },
  ];
}

export interface NeedsUnlockView {
  file: File;
  kind: NeedsUnlockKind;
  bytes: ArrayBuffer;
}

// Keyed on what the merge reads, not on the entries array itself: a
// thumbnail arriving late replaces an entry object and must not cancel and
// restart a pre-merge that is already running.
export function mergeSignatureOf(entries: FileEntry[]): string {
  return entries.map((e) => `${e.id}:${e.pageCount}:${e.error ?? ''}`).join('|');
}

// The files in list order once the set is mergeable, else null: fewer than
// two files, a page count still being read, or a file that cannot take part.
export function readyFilesOf(entries: FileEntry[]): File[] | null {
  if (entries.length < 2) return null;
  if (entries.some((e) => e.pageCount == null || e.error)) return null;
  return entries.map((e) => e.file);
}

// MERGE-11 (2026-09-13, Shlomi): the output name, once a person edits it in
// the document heading, is theirs - null means "still the automatic name".
// A locked file that leads the list is skipped for the name: the merged file
// is named after the first readable one.
export function outputTitleOf(entries: FileEntry[], customName: string | null): string {
  const nameEntry = entries.find((e) => !e.error) ?? entries[0];
  const autoOutputTitle = nameEntry ? mergedTitle(nameEntry.file.name) : '';
  return customName ?? autoOutputTitle;
}

interface LockedState {
  lockedFile: File | null;
  probeSettled: boolean;
  needsUnlock: NeedsUnlockView | null;
  lockedView: boolean;
}

// One protected file is a precondition, not a failure. Settled once the
// probe has answered for this file; until then nothing shows, so the inline
// error never flashes before the locked state replaces it. The heading and
// the one-file box wait for the probe too.
export function lockedStateOf(entries: FileEntry[], lockedProbe: LockedProbe | null): LockedState {
  const lockedFile = entries.length === 1 && entries[0].error === 'encrypted' ? entries[0].file : null;
  const probeSettled = !lockedFile || lockedProbe?.file === lockedFile;
  const needsUnlock: NeedsUnlockView | null = lockedFile && probeSettled && lockedProbe?.kind && lockedProbe.bytes
    ? { file: lockedFile, kind: lockedProbe.kind, bytes: lockedProbe.bytes }
    : null;
  const lockedView = !!needsUnlock || (!!lockedFile && !probeSettled);
  return { lockedFile, probeSettled, needsUnlock, lockedView };
}
