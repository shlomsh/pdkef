import { useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { hasDraftHint } from '../../lib/drafts/draftStore.ts';
import { isGrouped, isInListOrder, mergedTitle } from './lib/mergePlan.ts';
import { outputPageCount } from '../../lib/pages/pagePlan.ts';
import { useDocumentHistory } from '../../lib/history/useDocumentHistory.ts';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import { withIslandBoundary } from '../../lib/telemetry/IslandErrorBoundary.tsx';
import RatingPrompt, { useDownloaded } from '../../shell/RatingPrompt.tsx';
import MergeVerb from './verb/MergeVerb.tsx';
import { useDownloadFlow, type HandoffTool } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import { useLinkedHighlight, useMergeMoment } from './hooks/useLinkedHighlight.ts';
import { downloadDetail } from '../../shell/pageWorkspace/pageCounts.ts';
import type { QuietPolicy } from '../../lib/output/quietPrepare.ts';
import { usePreparedMerge } from './hooks/usePreparedMerge.ts';
import { englishMergeMessages, type MergeMessages } from './messages';
import { englishShellMessages, type ShellMessages } from '../../shell/shellMessages';
import { formatMessage } from '../../lib/text/formatMessage';
import { EMPTY_MODEL, type Model } from './lib/mergeModel.ts';
import { initialMergeState, mergeReducer } from './state/mergeState.ts';
import { readRememberedOptions } from './components/rememberedOptions.ts';
import { useRailSortables } from './hooks/useRailSortables.ts';
import { useFileDropTargets } from './hooks/useFileDropTargets.ts';
import { useMergeFiles } from './hooks/useMergeFiles.ts';
import { useTransientHints } from './hooks/useTransientHints.ts';
import { useInstallPrompt } from './hooks/useInstallPrompt.ts';
import { useLockedProbe } from './hooks/useLockedProbe.ts';
import { useLazySurfaces, useRestoreSettling } from './hooks/useDraftSurface.ts';
import { useMergeLifecycle } from './hooks/useMergeLifecycle.ts';
import { useMergeHandlers } from './hooks/useMergeHandlers.ts';
import { draftStatusLabelOf, failedFileOf, sortOptionsOf } from './lib/mergeView.ts';
import MergeHints from './components/MergeHints.tsx';
import MergeWorkspace from './components/MergeWorkspace.tsx';

export type { FileEntry } from './lib/mergeModel.ts';

/* MERGE-14: Compress and Sign only. Split was in the first cut and came out
   on Shlomi's read: after page-level reorder and skip in the grid, splitting
   the result is not the next step anyone takes. */

/* MERGE-13: the same synchronous hint ToolPageLayout.astro's pre-paint script
   and useDraftPersistence read, so the empty state can be held back on the
   first render, before the draft module (a dynamic import) has even loaded.
   Goes through draftStore's own hasDraftHint (MEM-01) rather than reading a
   localStorage key directly - this used to duplicate that key's literal
   name, which is exactly the kind of copy that silently stops matching the
   moment the store's key format changes. */
function hasMergeDraftHint(): boolean {
  return hasDraftHint('merge');
}

interface PdfMergeToolProps {
  /** LOC-02: server-rendered by its src/pages/[locale]/<tool>.astro route for a
   * localized edition; every key not overridden keeps the English default,
   * so a partial catalogue degrades to English rather than to `undefined`. */
  messages?: Partial<MergeMessages>;
  shellMessages?: Partial<ShellMessages>;
  /** Where the encrypted-file error sends people to remove a password first
   * (MERGE-04). The English tool by default; a localized page passes its own
   * edition's route once one exists. */
  unlockHref?: string;
  /** MERGE-14: where the three hand-off links go. English routes by default;
   * a localized page passes its edition's routes where one exists. */
  handoffHrefs?: Partial<Record<HandoffTool, string>>;
  /** Tests only: shortens the quiet wait before the background merge. */
  quietPolicy?: QuietPolicy;
  /** Tests only: jsdom cannot navigate. */
  navigate?: (href: string) => void;
}

export default withIslandBoundary(function PdfMergeTool({
  messages: messagesProp,
  shellMessages,
  unlockHref = '/unlock/',
  handoffHrefs,
  quietPolicy,
  navigate = (href) => { window.location.href = href; },
}: PdfMergeToolProps = {}) {
  const t: MergeMessages = { ...englishMergeMessages, ...messagesProp };
  const sm: ShellMessages = { ...englishShellMessages, ...shellMessages };
  /* GRID-03: one Undo/Redo stack over the whole document. A user edit is a
   * `commit`; a late arrival (files being added, a page count or thumbnail
   * resolving) is an `amend`, so undo can never take it away; a restore or
   * Clear all is a `reset`. */
  const [announcement, setAnnouncement] = useState('');
  const {
    present, canUndo, canRedo, commit: commitModel, amend: amendModel, reset: resetModel, onPlanChange, handleUndo, handleRedo,
  } = useDocumentHistory<Model>(EMPTY_MODEL, {
    tool: 'merge',
    announce: setAnnouncement,
    messages: { undone: t.undoneAnnouncement, redone: t.redoneAnnouncement },
  });
  const { entries, plan, sortMode }: Model = present;
  const [state, dispatch] = useReducer(
    mergeReducer,
    undefined,
    () => initialMergeState({ draftHint: hasMergeDraftHint(), addPageNumbers: readRememberedOptions().addPageNumbers }),
  );
  const { addPageNumbers, customOutputName } = state;
  const downloaded = useDownloaded();
  const [layoutEl, setLayoutEl] = useState<HTMLDivElement | null>(null);
  useLinkedHighlight(layoutEl);
  const startMergeMoment = useMergeMoment(layoutEl);
  const chipListRef = useRef<HTMLUListElement | null>(null);
  const documentRef = useRef<HTMLDivElement | null>(null);
  const { listRef, stripRef, takeDropPosition } = useFileDropTargets(entries.length > 0);
  const clearDraftRef = useRef<(() => Promise<boolean>) | null>(null);
  const handedOffRef = useRef(false);
  const restoreScrollPendingRef = useRef(false);
  const draftOptions = useMemo(() => ({ addPageNumbers }), [addPageNumbers]);
  const { startPickedUpTimer, cancelHints, onFirstKeyboardFocus } = useTransientHints(dispatch);

  const hasFiles = entries.length > 0;
  const grouped = useMemo(() => isGrouped(plan), [plan]);
  const canReorderFiles = entries.length >= 2;
  // The one readiness condition: the restore marker is released and the
  // layout wrapper below carries `data-merge-workspace-ready` on the same
  // commit, so the page is never revealed before the grid is in the DOM.
  const { PageGrid, DraftPersistence } = useLazySurfaces(hasFiles, dispatch);
  const workspaceReady = Boolean(PageGrid) && plan.length > 0;
  useRestoreSettling({ hasFiles, status: state.status, workspaceReady, restoreScrollPendingRef });
  // Keyed on what the merge reads, not on the entries array itself: a
  // thumbnail arriving late replaces an entry object and must not cancel and
  // restart a pre-merge that is already running.
  const mergeSignature = entries.map((e) => `${e.id}:${e.pageCount}:${e.error ?? ''}`).join('|');
  const fileIds = useMemo(() => entries.map((e) => e.id), [mergeSignature]);
  const listOrdered = useMemo(() => isInListOrder(plan, fileIds), [plan, fileIds]);
  const readyFiles = useMemo(() => {
    if (entries.length < 2) return null;
    if (entries.some((e) => e.pageCount == null || e.error)) return null;
    return entries.map((e) => e.file);
  }, [mergeSignature]);
  // MERGE-11 (2026-09-13, Shlomi): the output name, once a person edits it in
  // the document heading, is theirs - null means "still the automatic name"
  // and it survives every later add/remove/reorder until Clear all. A locked
  // file that leads the list is skipped for the name: the merged file is
  // named after the first readable one. Both the download attribute and the
  // PDF Title come from the same `title`, so a rename touches both.
  const nameEntry = entries.find((e) => !e.error) ?? entries[0];
  const autoOutputTitle = nameEntry ? mergedTitle(nameEntry.file.name) : '';
  const title = customOutputName ?? autoOutputTitle;
  const fileName = title ? `${title}.pdf` : 'merged.pdf';

  const prepared = usePreparedMerge({
    files: readyFiles,
    plan,
    fileIds,
    addPageNumbers,
    title,
    quietPolicy,
  });

  const { failedEntry, failedReason } = failedFileOf(entries, prepared.error);
  const otherError = !failedEntry && prepared.status === 'error';
  const { needsUnlock, probeSettled, lockedView } = useLockedProbe(entries, state.lockedProbe, dispatch);

  const downloadFlow = useDownloadFlow({
    prepared,
    fileName,
    hrefs: handoffHrefs,
    blocked: entries.length < 2 ? 'one-file' : (failedEntry || otherError) ? 'error' : null,
    // Page counts still arriving leave the plan empty; that is not "every page skipped".
    nothing: plan.length > 0 && outputPageCount(plan) === 0,
    announce: setAnnouncement,
    messages: { ready: t.mergedReady, shared: t.sharedSuccessfully, canceled: t.sharingCanceled, shareError: t.shareError },
    onDelivered: startMergeMoment,
    navigate,
  });
  const { tap, showStrip, reset: resetDownloadFlow } = downloadFlow;

  const {
    inspectEntry, addFiles, removeEntry, applyFileReorder, moveFileEntry, onSortChange, resetPageOrder, forgetPendingPlanIndexes,
  } = useMergeFiles({ model: present, commitModel, amendModel, dispatch, announce: setAnnouncement, takeDropPosition, t });
  useRailSortables({ listRef, chipListRef, hasFiles, canReorderFiles, onReorder: applyFileReorder });
  const { requestInstall } = useInstallPrompt(state, dispatch, prepared.status);

  const { onDraftRestore, reset } = useMergeLifecycle({
    resetModel, inspectEntry, addFiles, forgetPendingPlanIndexes, resetDownloadFlow, startPickedUpTimer, cancelHints,
    dispatch, announce: setAnnouncement, clearedMessage: t.cleared, handedOffRef, restoreScrollPendingRef, clearDraftRef,
  });
  const {
    onRowKeyDown, onPageNumbersChange, renameOutput, onDraftStateChange, onRenderedCountChange, scrollToCaption,
  } = useMergeHandlers({ dispatch, canReorderFiles, moveFileEntry, documentRef });

  const rearranged = hasFiles && (!grouped || !listOrdered);
  // Heading and Download-element counts: the merge OUTPUT (skipped pages
  // excluded), never the raw plan length - a skipped page still gets a
  // "1 skipped" addendum, never inflates the page count itself (PART 2:
  // this fixed "Preparing 27 pages…" counting a skipped page). Rendering
  // progress ("7 of 9 rendered") is a separate figure: it tracks every cell
  // that needs a thumbnail, skipped ones included, and disappears once done.
  const outputCount = outputPageCount(plan);
  const rating = <RatingPrompt tool="merge" downloaded={downloaded} messages={sm} />;

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      onFilesAdded={addFiles}
      intake={{ accept: 'application/pdf,.pdf,image/jpeg,image/png,.jpg,.jpeg,.png' }}
      identity={{ hidden: true }}
      empty={{ cloudDriveHint: true, heading: t.emptyHeading, message: t.dropHere, body: t.emptyBody, art: <MergeVerb /> }}
      draft={{ checking: !hasFiles && state.status === 'checking-draft' }}
      clearAll={{
        onClear: reset,
        summary: entries.length === 1 ? t.fileSummaryOne : formatMessage(t.fileSummaryMany, { count: entries.length }),
      }}
      // A file flagged by inspection (encrypted, unreadable) is the person's file,
      // not a failed operation; a failure of the merge run itself, which
      // usePreparedMerge reports, still counts.
      analytics={{ tool: 'merge', status: prepared.status === 'error' ? 'error' : tap }}
      owns={{ rating: true }}
      // Direction A wave 2 (Shlomi): with the add bar gone, dropping
      // anywhere on the page is the only invitation left, so the
      // drag-over overlay says so - a Merge-only override of the shared
      // shell copy, not a change to what Split/ImageToPdf/ToImage show.
      shellMessages={{ ...shellMessages, dropToAddMore: t.dropAnywhereNote }}
    >
      {DraftPersistence && (
        <DraftPersistence
          entries={entries}
          plan={plan}
          options={draftOptions}
          title={title}
          outputName={customOutputName}
          restoreHydrationComplete={state.restoreHydrationComplete}
          onRestore={onDraftRestore}
          onStateChange={onDraftStateChange}
          registerClear={(clear) => { clearDraftRef.current = clear; }}
        />
      )}

      <MergeHints
        rejectedFiles={state.rejectedFiles}
        duplicates={state.duplicates}
        onAddAnyway={(files) => addFiles(files, { force: true })}
        t={t}
      />

      {hasFiles && (
        <MergeWorkspace
          entries={entries}
          plan={plan}
          sortMode={sortMode}
          sortOptions={sortOptionsOf(t)}
          state={state}
          dispatch={dispatch}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onPlanChange={onPlanChange}
          announce={setAnnouncement}
          PageGrid={PageGrid}
          workspaceReady={workspaceReady}
          layoutRef={setLayoutEl}
          documentRef={documentRef}
          chipListRef={chipListRef}
          listRef={listRef}
          stripRef={stripRef}
          grouped={grouped}
          rearranged={rearranged}
          showSortControls={entries.length >= 2 && !rearranged}
          canReorderFiles={canReorderFiles}
          title={title}
          fileName={fileName}
          detail={downloadDetail(prepared, outputCount, sm, t.dir)}
          outputCount={outputCount}
          downloadFlow={downloadFlow}
          prepared={prepared}
          rating={rating}
          lockedView={lockedView}
          needsUnlock={needsUnlock}
          probeSettled={probeSettled}
          failedEntry={failedEntry}
          failedReason={failedReason}
          otherError={otherError}
          unlockHref={unlockHref}
          draftStatusLabel={draftStatusLabelOf(state.draftSaveState, sm)}
          onRemove={removeEntry}
          onRowKeyDown={onRowKeyDown}
          onRowClick={scrollToCaption}
          onSortChange={onSortChange}
          onResetOrder={resetPageOrder}
          onStartAgain={reset}
          onRename={renameOutput}
          onPageNumbersChange={onPageNumbersChange}
          onRenderedCountChange={onRenderedCountChange}
          onFirstKeyboardFocus={onFirstKeyboardFocus}
          onInstall={requestInstall}
          t={t}
          sm={sm}
        />
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {!showStrip && rating}
    </BasePdfTool>
  );
});
