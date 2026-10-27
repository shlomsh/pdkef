import { useCallback, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { markArrival } from '../../lib/fileArrival.ts';
import { MergeFileError } from './lib/merge.js';
import { hasDraftHint } from '../../lib/drafts/draftStore.ts';
import { isGrouped, isInListOrder, mergedTitle } from './lib/mergePlan.ts';
import { outputPageCount } from '../../lib/pagePlan.ts';
import { isolateName } from '../../lib/format.js';
import { useHandoffFilesIntake } from '../../lib/useHandoffIntake.ts';
import { useDocumentHistory } from '../../lib/history/useDocumentHistory.ts';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import { withIslandBoundary } from '../../lib/IslandErrorBoundary.tsx';
import RatingPrompt, { useDownloaded } from '../../shell/RatingPrompt.tsx';
import MergeVerb from './verb/MergeVerb.tsx';
import ToolShellBridge from '../../shell/ToolShellBridge.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import { useDownloadFlow, type HandoffTool } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import { useLinkedHighlight, useMergeMoment } from './hooks/useLinkedHighlight.ts';
import PageWorkspace from '../../shell/pageWorkspace/PageWorkspace.tsx';
import { downloadDetail } from '../../shell/pageWorkspace/pageCounts.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import type { QuietPolicy } from '../../lib/quietPrepare.ts';
import { usePreparedMerge } from './hooks/usePreparedMerge.ts';
import type { MergeDraftRestore } from './hooks/useMergeDraft.ts';
import { englishMergeMessages, type MergeMessages } from './messages';
import { englishShellMessages, type ShellMessages } from '../../shell/shellMessages';
import { formatMessage } from '../../lib/formatMessage';
import { EMPTY_MODEL, toEntry, type Model } from './lib/mergeModel.ts';
import { initialMergeState, mergeReducer, type MergeState } from './state/mergeState.ts';
import { readRememberedOptions, rememberOptions } from './components/rememberedOptions.ts';
import { useRailSortables } from './hooks/useRailSortables.ts';
import { useFileDropTargets } from './hooks/useFileDropTargets.ts';
import { useMergeFiles } from './hooks/useMergeFiles.ts';
import { useTransientHints } from './hooks/useTransientHints.ts';
import { useInstallPrompt } from './hooks/useInstallPrompt.ts';
import { useLockedProbe } from './hooks/useLockedProbe.ts';
import { useLazySurfaces, useRestoreSettling } from './hooks/useDraftSurface.ts';
import MergeChipBar from './components/MergeChipBar.tsx';
import MergePhoneControls from './components/MergePhoneControls.tsx';
import { MergeHeading, MergeHeaderStatus } from './components/MergeHeading.tsx';
import MergeRailContent from './components/MergeRailContent.tsx';
import MergeRailPinned from './components/MergeRailPinned.tsx';
import MergeNotices from './components/MergeNotices.tsx';

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

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  const { addPageNumbers, customOutputName, renderedCount } = state;
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

  // MERGE-04: which file failed, and why. Inspection catches most cases
  // before a merge is attempted; mergePdfs's MergeFileError is the second line.
  const failedEntry = entries.find((e) => e.error)
    ?? (prepared.error instanceof MergeFileError ? entries[prepared.error.fileIndex] ?? null : null);
  const failedReason: 'encrypted' | 'unreadable' | null = failedEntry
    ? (failedEntry.error ?? (prepared.error instanceof MergeFileError ? prepared.error.reason : 'unreadable'))
    : null;
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
    setAnnouncement(t.cleared);
    recordAction('clear_all');
  }, [clearWorkspace, t.cleared]);

  const onRowKeyDown = useCallback(
    (event: KeyboardEvent, id: number) => {
      if (!canReorderFiles) return;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveFileEntry(id, -1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveFileEntry(id, 1);
      }
    },
    [moveFileEntry, canReorderFiles],
  );

  // Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z are bound by useDocumentHistory, which stands down while
  // focus is in an input (the page-numbers checkbox, the rename field). The prepared output
  // follows the plan on its own (usePreparedMerge keys on it), so nothing is cleared here.

  const onPageNumbersChange = useCallback((event: Event) => {
    const next = (event.target as HTMLInputElement).checked;
    dispatch({ type: 'PAGE_NUMBERS_CHANGED', value: next });
    rememberOptions({ addPageNumbers: next });
    recordAction('change_setting');
  }, []);

  // MERGE-11: the rename itself lives in the shell's OutputName. '' means the
  // person emptied it, which goes back to the automatic name.
  const renameOutput = useCallback((next: string) => {
    dispatch({ type: 'OUTPUT_RENAMED', name: next.length > 0 ? next : null });
  }, []);
  const onDraftStateChange = useCallback(
    (next: { isRestoring: boolean; draftSaveState: MergeState['draftSaveState'] }) => dispatch({ type: 'DRAFT_CHECK_SETTLED', ...next }),
    [],
  );
  const onRenderedCountChange = useCallback((count: number) => dispatch({ type: 'RENDERED_COUNT_CHANGED', count }), []);

  const scrollToCaption = useCallback((fileId: number) => {
    const container = documentRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-caption-for="${fileId}"]`)
      ?? container?.querySelector<HTMLElement>(`[data-key^="${fileId}:"]`);
    target?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  const rearranged = hasFiles && (!grouped || !listOrdered);
  const showSortControls = entries.length >= 2 && !rearranged;
  const detail = downloadDetail(prepared, outputPageCount(plan), sm, t.dir);
  // A file flagged by inspection (encrypted, unreadable) is the person's file,
  // not a failed operation; a failure of the merge run itself, which
  // usePreparedMerge reports, still counts.
  const analyticsStatus = prepared.status === 'error' ? 'error' : tap;
  const { draftSaveState } = state;
  const draftStatusLabel = draftSaveState === 'saved' ? sm.draftSaved
    : draftSaveState === 'pending' ? sm.draftSaving
      : draftSaveState === 'error' ? sm.draftNotSaved
        : draftSaveState === 'conflict' ? sm.draftConflict
          : null;

  // Heading and Download-element counts: the merge OUTPUT (skipped pages
  // excluded), never the raw plan length - a skipped page still gets a
  // "1 skipped" addendum, never inflates the page count itself (PART 2:
  // this fixed "Preparing 27 pages…" counting a skipped page). Rendering
  // progress ("7 of 9 rendered") is a separate figure: it tracks every cell
  // that needs a thumbnail, skipped ones included, and disappears once done.
  const outputCount = outputPageCount(plan);
  const renderTotal = plan.length;
  const sortOptions = [
    { value: 'added' as const, label: t.sortAsAdded },
    { value: 'reversed' as const, label: t.sortReversed },
    { value: 'nameAsc' as const, label: t.sortNameAsc },
    { value: 'nameDesc' as const, label: t.sortNameDesc },
    { value: 'dateAsc' as const, label: t.sortDateAsc },
    { value: 'dateDesc' as const, label: t.sortDateDesc },
  ];

  const rating = <RatingPrompt tool="merge" downloaded={downloaded} messages={sm} />;

  return (
    <BasePdfTool
      accept="application/pdf,.pdf,image/jpeg,image/png,.jpg,.jpeg,.png"
      hasFiles={hasFiles}
      analyticsTool="merge"
      analyticsStatus={analyticsStatus}
      ownsRating
      onFilesAdded={addFiles}
      onClearAll={reset}
      clearSummary={entries.length === 1 ? t.fileSummaryOne : formatMessage(t.fileSummaryMany, { count: entries.length })}
      // Direction A wave 2 (Shlomi): with the add bar gone, dropping
      // anywhere on the page is the only invitation left, so the
      // drag-over overlay says so - a Merge-only override of the shared
      // shell copy, not a change to what Split/ImageToPdf/ToImage show.
      shellMessages={{ ...shellMessages, dropToAddMore: t.dropAnywhereNote }}
      showCloudDriveHint
      emptyHeading={t.emptyHeading}
      emptyStateMessage={t.dropHere}
      emptyBody={t.emptyBody}
      emptyArt={<MergeVerb />}
      checkingDraft={!hasFiles && state.status === 'checking-draft'}
      hideIdentity
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

      {state.rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {state.rejectedFiles.length === 1
            ? formatMessage(t.skippedOne, { name: isolateName(state.rejectedFiles[0], t.dir) })
            : formatMessage(t.skippedMany, { count: state.rejectedFiles.length })}
        </p>
      )}

      {state.duplicates.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          <span>{state.duplicates.map((f) => formatMessage(t.alreadyAdded, { name: isolateName(f.name, t.dir) })).join(' ')}</span>{' '}
          <button type="button" class={pdfToolStyles['quiet-link']} onClick={() => addFiles(state.duplicates, { force: true })}>
            {t.addAnyway}
          </button>
        </p>
      )}

      {hasFiles && (
        <ToolShellBridge>
          {({ requestReplace, requestClear }) => (
            <PageWorkspace
              rootAttrs={{
                'data-merge-workspace-ready': workspaceReady ? '' : undefined,
                'data-merge-restored-workspace': state.isRestoredWorkspace || undefined,
              }}
              layoutRef={setLayoutEl}
              documentRef={documentRef}
              phoneBar={(
                <MergeChipBar
                  entries={entries}
                  chipListRef={chipListRef}
                  onRemove={removeEntry}
                  downloadFlow={downloadFlow}
                  prepared={prepared}
                  fileName={fileName}
                  detail={detail}
                  t={t}
                  rating={rating}
                />
              )}
              phoneControls={(
                <MergePhoneControls
                  fileCount={entries.length}
                  rearranged={rearranged}
                  sortMode={sortMode}
                  sortOptions={sortOptions}
                  onSortChange={onSortChange}
                  onResetOrder={resetPageOrder}
                  onAdd={requestReplace}
                  onClear={requestClear}
                  t={t}
                  sm={sm}
                />
              )}
              /* Coarse pointer only (CSS-gated, PageWorkspace.module.css): the
                 chip row and the page grid below both drag on press-and-hold
                 (SortableJS's delayOnTouchOnly), with no grip icon standing in
                 for the gesture the way the desktop rail's handle does, so
                 nothing tells a phone that dragging works at all. Gated on
                 having something worth reordering, same threshold as the
                 desktop rail's own Sort control. */
              touchHint={(entries.length > 1 || outputCount > 1) && t.touchDragHint}
              heading={lockedView ? null : (
                <MergeHeading
                  title={title}
                  outputCount={outputCount}
                  skippedCount={plan.length - outputCount}
                  stillRendering={renderTotal > 0 && renderedCount < renderTotal}
                  renderedCount={renderedCount}
                  onRename={renameOutput}
                  onRenamingChange={(renaming) => dispatch({ type: 'RENAMING_CHANGED', renaming })}
                  t={t}
                  sm={sm}
                />
              )}
              headerStatus={lockedView ? null : (
                <MergeHeaderStatus
                  canUndo={canUndo}
                  canRedo={canRedo}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  showPickedUp={state.showPickedUpSentence}
                  showShortcuts={state.showShortcutsHint}
                  isRestoredWorkspace={state.isRestoredWorkspace}
                  onStartFresh={requestClear}
                  t={t}
                />
              )}
              railContent={(
                <MergeRailContent
                  entries={entries}
                  listRef={listRef}
                  canReorderFiles={canReorderFiles}
                  rearranged={rearranged}
                  showSortControls={showSortControls}
                  sortMode={sortMode}
                  sortOptions={sortOptions}
                  draftStatusLabel={draftStatusLabel}
                  showDraftRetentionHint={draftSaveState !== 'error' && draftSaveState !== 'conflict'}
                  showPickedUpSentence={state.showPickedUpSentence}
                  isRestoredWorkspace={state.isRestoredWorkspace}
                  onRemove={removeEntry}
                  onRowKeyDown={onRowKeyDown}
                  onRowClick={scrollToCaption}
                  onSortChange={onSortChange}
                  onResetOrder={resetPageOrder}
                  onAdd={requestReplace}
                  onClear={requestClear}
                  t={t}
                  sm={sm}
                />
              )}
              railPinned={(
                <MergeRailPinned
                  fileCount={entries.length}
                  addPageNumbers={addPageNumbers}
                  onPageNumbersChange={onPageNumbersChange}
                  lockedView={lockedView}
                  downloadFlow={downloadFlow}
                  prepared={prepared}
                  fileName={fileName}
                  detail={detail}
                  renderedCount={renderedCount}
                  renderTotal={renderTotal}
                  outputCount={outputCount}
                  hasFailedEntry={!!failedEntry}
                  isOutputNameBeingRenamed={state.isRenamingOutputName}
                  onChooseFiles={requestReplace}
                  onStartAgain={reset}
                  showInstallLine={state.showInstallLine}
                  installPrompt={state.installPrompt}
                  onIos={state.onIos}
                  onInstall={requestInstall}
                  t={t}
                  sm={sm}
                />
              )}
            >
              <MergeNotices
                needsUnlock={needsUnlock}
                probeSettled={probeSettled}
                failedEntry={failedEntry}
                failedReason={failedReason}
                otherError={otherError}
                unlockHref={unlockHref}
                onRemove={removeEntry}
                t={t}
              />

              {!needsUnlock && PageGrid && plan.length > 0 && (
                <PageGrid
                  sources={entries}
                  plan={plan}
                  onPlanChange={onPlanChange}
                  announce={setAnnouncement}
                  messages={t}
                  labelledBy="page-grid-heading"
                  grouped={grouped}
                  labelSources
                  gridRef={stripRef}
                  onRenderedCountChange={onRenderedCountChange}
                  onFirstKeyboardFocus={onFirstKeyboardFocus}
                />
              )}
            </PageWorkspace>
          )}
        </ToolShellBridge>
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {!showStrip && rating}
    </BasePdfTool>
  );
});
