import { MergeFileError } from './merge.js';
import type { FileEntry, SortMode } from './mergeModel.ts';
import type { MergeMessages } from '../messages';
import type { ShellMessages } from '../../../shell/shellMessages';
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
