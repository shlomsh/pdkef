import { useMemo, useReducer, useRef, useState } from 'preact/hooks';
import type { ComponentProps, ComponentType } from 'preact';
import { hasDraftHint } from '#lib/drafts/draftStore.ts';
import { isGrouped, isInListOrder } from '../lib/mergePlan.ts';
import { outputPageCount } from '#lib/pages/pagePlan.ts';
import { useDocumentHistory } from '#lib/history/useDocumentHistory.ts';
import type BasePdfTool from '#shell/BasePdfTool.tsx';
import { useDownloaded } from '#shell/RatingPrompt.tsx';
import type RatingPrompt from '#shell/RatingPrompt.tsx';
import { useDownloadFlow, type HandoffTool } from '#shell/pageWorkspace/useDownloadFlow.ts';
import { useLinkedHighlight, useMergeMoment } from './useLinkedHighlight.ts';
import { downloadDetail } from '#shell/pageWorkspace/pageCounts.ts';
import type { QuietPolicy } from '#lib/output/quietPrepare.ts';
import { usePreparedMerge } from './usePreparedMerge.ts';
import { englishMergeMessages, type MergeMessages } from '../messages';
import { englishShellMessages, type ShellMessages } from '#shell/shellMessages.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { EMPTY_MODEL, type Model } from '../lib/mergeModel.ts';
import { initialMergeState, mergeReducer } from '../state/mergeState.ts';
import { readRememberedOptions } from '../components/rememberedOptions.ts';
import { useRailSortables } from './useRailSortables.ts';
import { useFileDropTargets } from './useFileDropTargets.ts';
import { useMergeFiles } from './useMergeFiles.ts';
import { useTransientHints } from './useTransientHints.ts';
import { useInstallPrompt } from './useInstallPrompt.ts';
import { useLockedProbe } from './useLockedProbe.ts';
import { useLazySurfaces, useRestoreSettling } from './useDraftSurface.ts';
import { useMergeLifecycle } from './useMergeLifecycle.ts';
import { useMergeHandlers } from './useMergeHandlers.ts';
import { draftStatusLabelOf, failedFileOf, mergeSignatureOf, outputTitleOf, readyFilesOf, sortOptionsOf } from '../lib/mergeView.ts';
import type MergeHints from '../components/MergeHints.tsx';
import type { MergeWorkspaceProps } from '../components/MergeWorkspace.tsx';
import type { MergeDraftPersistenceProps } from '../components/MergeDraftPersistence.tsx';

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

export interface PdfMergeToolProps {
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

interface MergeToolView {
  /** BasePdfTool props except its children and the empty state's art, which the island draws. */
  base: Omit<ComponentProps<typeof BasePdfTool>, 'children' | 'empty'> & {
    empty: { heading: string; message: string; body: string };
  };
  hints: ComponentProps<typeof MergeHints>;
  /** The lazily loaded draft surface and its props; null until the module has loaded. */
  draft: { Component: ComponentType<MergeDraftPersistenceProps>; props: MergeDraftPersistenceProps } | null;
  /** MergeWorkspace props except `rating`, which the island builds from `rating.props`. */
  workspace: Omit<MergeWorkspaceProps, 'rating'>;
  hasFiles: boolean;
  announcement: string;
  /** Props for the rating prompt, and whether it shows below the workspace (no download strip open). */
  rating: { props: ComponentProps<typeof RatingPrompt>; belowWorkspace: boolean };
}

export function useMergeTool({
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
  const mergeSignature = mergeSignatureOf(entries);
  const fileIds = useMemo(() => entries.map((e) => e.id), [mergeSignature]);
  const listOrdered = useMemo(() => isInListOrder(plan, fileIds), [plan, fileIds]);
  const readyFiles = useMemo(() => readyFilesOf(entries), [mergeSignature]);
  const title = outputTitleOf(entries, customOutputName);
  const fileName = title ? `${title}.pdf` : 'merged.pdf';

  const prepared = usePreparedMerge({ files: readyFiles, plan, fileIds, addPageNumbers, title, quietPolicy });

  const { failedEntry, failedReason } = failedFileOf(entries, prepared.error);
  const otherError = !failedEntry && prepared.status === 'error';
  const { needsUnlock, probeSettled, lockedView } = useLockedProbe(entries, state.lockedProbe, dispatch);

  const downloadFlow = useDownloadFlow({
    prepared, from: 'merge', fileName, hrefs: handoffHrefs,
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

  return {
    base: {
      hasFiles,
      onFilesAdded: addFiles,
      intake: { accept: 'application/pdf,.pdf,image/jpeg,image/png,.jpg,.jpeg,.png' },
      identity: { hidden: true },
      empty: { heading: t.emptyHeading, message: t.dropHere, body: t.emptyBody },
      draft: { checking: !hasFiles && state.status === 'checking-draft' },
      clearAll: {
        onClear: reset,
        summary: entries.length === 1 ? t.fileSummaryOne : formatMessage(t.fileSummaryMany, { count: entries.length }),
      },
      // A file flagged by inspection (encrypted, unreadable) is the person's file,
      // not a failed operation; a failure of the merge run itself, which
      // usePreparedMerge reports, still counts.
      analytics: { tool: 'merge', status: prepared.status === 'error' ? 'error' : tap },
      owns: { rating: true },
      // Direction A wave 2 (Shlomi): with the add bar gone, dropping
      // anywhere on the page is the only invitation left, so the
      // drag-over overlay says so - a Merge-only override of the shared
      // shell copy, not a change to what Split/ImageToPdf/ToImage show.
      shellMessages: { ...shellMessages, dropToAddMore: t.dropAnywhereNote },
    },
    draft: DraftPersistence && {
      Component: DraftPersistence,
      props: {
        entries, plan, options: draftOptions, title, outputName: customOutputName, restoreHydrationComplete: state.restoreHydrationComplete,
        onRestore: onDraftRestore, onStateChange: onDraftStateChange, registerClear: (clear) => { clearDraftRef.current = clear; },
      },
    },
    hints: { rejectedFiles: state.rejectedFiles, duplicates: state.duplicates, onAddAnyway: (files) => addFiles(files, { force: true }), t },
    hasFiles,
    workspace: {
      entries, plan, sortMode, sortOptions: sortOptionsOf(t), state, dispatch, canUndo, canRedo, onUndo: handleUndo, onRedo: handleRedo,
      onPlanChange, announce: setAnnouncement, PageGrid, workspaceReady, layoutRef: setLayoutEl, documentRef, chipListRef, listRef, stripRef,
      grouped, rearranged, showSortControls: entries.length >= 2 && !rearranged, canReorderFiles, title, fileName,
      detail: downloadDetail(prepared, outputCount, sm, t.dir), outputCount, downloadFlow, prepared,
      lockedView, needsUnlock, probeSettled, failedEntry, failedReason, otherError, unlockHref, draftStatusLabel: draftStatusLabelOf(state.draftSaveState, sm),
      onRemove: removeEntry, onRowKeyDown, onRowClick: scrollToCaption, onSortChange, onResetOrder: resetPageOrder, onStartAgain: reset,
      onRename: renameOutput, onPageNumbersChange, onRenderedCountChange, onFirstKeyboardFocus, onInstall: requestInstall, t, sm,
    },
    announcement,
    rating: { props: { tool: 'merge', downloaded, messages: sm }, belowWorkspace: !showStrip },
  } satisfies MergeToolView;
}
