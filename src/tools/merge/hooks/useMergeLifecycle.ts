import { useCallback } from 'preact/hooks';
import type { Dispatch } from 'preact/hooks';
import { markArrival } from '../../../lib/fileArrival.ts';
import { recordAction } from '../../../lib/actionTrail.ts';
import { useHandoffFilesIntake } from '../../../lib/useHandoffIntake.ts';
import { EMPTY_MODEL, toEntry, type FileEntry, type Model } from '../lib/mergeModel.ts';
import { readRememberedOptions } from '../components/rememberedOptions.ts';
import type { MergeAction } from '../state/mergeState.ts';
import type { MergeDraftRestore } from './useMergeDraft.ts';

interface Options {
  resetModel: (model: Model) => void;
  inspectEntry: (entry: FileEntry) => Promise<unknown>;
  addFiles: (files: File[], options?: { force?: boolean; fresh?: boolean }) => void;
  forgetPendingPlanIndexes: () => void;
  resetDownloadFlow: () => void;
  startPickedUpTimer: () => void;
  cancelHints: () => void;
  dispatch: Dispatch<MergeAction>;
  announce: (message: string) => void;
  clearedMessage: string;
  handedOffRef: { current: boolean };
  restoreScrollPendingRef: { current: boolean };
  clearDraftRef: { current: (() => Promise<boolean>) | null };
}

/** Draft restore, Clear all and the home-page hand-off: the three ways the workspace is replaced. */
export function useMergeLifecycle({
  resetModel, inspectEntry, addFiles, forgetPendingPlanIndexes, resetDownloadFlow, startPickedUpTimer, cancelHints,
  dispatch, announce, clearedMessage, handedOffRef, restoreScrollPendingRef, clearDraftRef,
}: Options) {
  // A restored draft: fresh entries for the stored files (the index doubles as
  // the id, which is what the stored plan's fileId already is), then the same
  // inspection a fresh pick gets, for thumbnails and to re-check each file.
  const onDraftRestore = useCallback((restored: MergeDraftRestore, source: 'restore' | 'recent') => {
    // SITE-42: files handed off from the home page are the newest intent and
    // win; a restore resolving after them must not overwrite or join them.
    if (handedOffRef.current) return;
    // DEBT-58: marked past that bail, so a restore that loses never relabels the hand-off.
    markArrival(source);
    restoreScrollPendingRef.current = true;
    const restoredEntries = restored.files.map((file) => toEntry(file));
    const idByIndex = restoredEntries.map((e) => e.id);
    const restoredPlan = restored.plan.map((p) => ({ ...p, fileId: idByIndex[p.fileId], key: `${idByIndex[p.fileId]}:${p.pageIndex}` }));
    resetModel({ entries: restoredEntries, plan: restoredPlan, sortMode: 'added' });
    dispatch({ type: 'DRAFT_RESTORED', addPageNumbers: restored.options.addPageNumbers, outputName: restored.outputName });
    startPickedUpTimer();
    void Promise.allSettled(restoredEntries.map((entry) => inspectEntry(entry))) // reason: allSettled never rejects
      .then(() => dispatch({ type: 'RESTORE_HYDRATED' }));
  }, [resetModel, inspectEntry, startPickedUpTimer]);

  // Everything on screen that belongs to the current set, shared by Clear all
  // and a home-page hand-off so the two cannot drift. It never touches the
  // saved draft: Clear all deletes that itself, a hand-off must not.
  const clearWorkspace = useCallback(() => {
    resetModel(EMPTY_MODEL);
    resetDownloadFlow();
    dispatch({ type: 'WORKSPACE_CLEARED' });
    cancelHints();
    forgetPendingPlanIndexes();
  }, [resetDownloadFlow, resetModel, cancelHints, forgetPendingPlanIndexes]);

  // SITE-42: several files picked on the home page arrive as a brand-new set,
  // through addFiles like a manual pick. Whatever a restore already put on
  // screen is replaced, but the saved set is NOT cleared (no reset(), no
  // clearDraftRef): it stays in the shared recents, and the new set saves as
  // its own entry because an entry's id is derived from its files' bytes
  // (draftStore's sourceIdForFiles), never reused from the current pointer.
  useHandoffFilesIntake('merge', (files) => {
    handedOffRef.current = true;
    clearWorkspace();
    dispatch({ type: 'HANDOFF_ARRIVED', addPageNumbers: readRememberedOptions().addPageNumbers });
    addFiles(files, { force: true, fresh: true });
  });

  const reset = useCallback(() => {
    clearWorkspace();
    void clearDraftRef.current?.(); // reason: clearDraft goes through draftStore, which reports its own failure
    announce(clearedMessage);
    recordAction('clear_all');
  }, [clearWorkspace, clearedMessage]);

  return { onDraftRestore, reset };
}
