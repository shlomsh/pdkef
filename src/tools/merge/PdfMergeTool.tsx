import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { reportEdit } from '../../lib/productAnalytics.ts';
import { markArrival } from '../../lib/fileArrival.ts';
import type { ComponentType } from 'preact';
import Sortable from 'sortablejs';
import { Shrink, FileSignature, File as FileIcon, FilePlus, Trash2, X as XIcon } from 'lucide-preact';
import { inspectPdf, MergeFileError } from './merge.js';
import { hasDraftHint } from '../../lib/drafts/draftStore.js';
import DraftRetentionHint from '../../shell/DraftRetentionHint';
import {
  insertPages,
  isGrouped,
  isInListOrder,
  mergedTitle,
  regroupPlan,
  removeFile,
} from './mergePlan.ts';
import { outputPageCount, planForFile, type PlanEntry } from '../../lib/pagePlan.ts';
import { deriveFileKind } from '../../lib/fileKind.js';
import { sortByDate, sortByName } from '../../lib/sort.js';
import { renderThumbnail } from '../../lib/thumbnails.js';
import { formatFileSize, isolateName } from '../../lib/format.js';
import { useHandoffFilesIntake } from '../../lib/useHandoffIntake.ts';
import { useDocumentHistory } from '../../lib/history/useDocumentHistory.ts';
import { isIOSDevice } from '../../lib/platform.ts';
import { isFileDrag } from '../../shell/fileDragDepth.ts';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import HistoryButtons from '../../shell/HistoryButtons.tsx';
import RatingPrompt, { useDownloaded } from '../../shell/RatingPrompt.tsx';
import MergeVerb from './verb/MergeVerb.tsx';
import ToolShellBridge from '../../shell/ToolShellBridge.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import docStyles from './components/MergeDocument.module.css';
import railStyles from './components/MergeRail.module.css';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import NeedsUnlock, { type NeedsUnlockKind } from '../../shell/NeedsUnlock.tsx';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import { useDownloadFlow, type HandoffTool, type HandoffHrefs } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import { useLinkedHighlight, useMergeMoment } from './useLinkedHighlight.ts';
import DownloadElement from '../../shell/DownloadElement.tsx';
import FinishRow from '../../shell/pageWorkspace/FinishRow.tsx';
import PhoneFinish from '../../shell/pageWorkspace/PhoneFinish.tsx';
import PageNumbersRow from '../../shell/pageWorkspace/PageNumbersRow.tsx';
import { downloadDetail, pagesLabel, skippedLabel } from '../../shell/pageWorkspace/pageCounts.ts';
import PageWorkspace, { workspaceStyles } from '../../shell/pageWorkspace/PageWorkspace.tsx';
import FileName from '../../shell/FileName.tsx';
import OutputName from '../../shell/OutputName.tsx';
import { recordAction } from '../../lib/actionTrail.ts';
import SortMenu from '../../shell/SortMenu.tsx';
import type { QuietPolicy } from '../../lib/quietPrepare.ts';
import { usePreparedMerge } from './components/usePreparedMerge.ts';
import type { PageGridProps } from '../../shell/pageGrid/PageGrid.tsx';
import type { MergeDraftPersistenceProps } from './components/MergeDraftPersistence.tsx';
import type { MergeDraftRestore, MergeDraftSaveState } from './components/useMergeDraft.ts';
import {
  englishMergeMessages,
  englishShellMessages,
  formatMessage,
  type MergeMessages,
  type ShellMessages,
} from '../../i18n/toolMessages';
import { reportError } from '../../lib/errorReport.ts';
import { reportableCause } from './reportableCause.ts';

let nextId = 0;

export interface FileEntry {
  id: number;
  file: File;
  /** From inspectPdf; null until read. The plan gets this file's pages only
   * once it is known, so a file with an unknown count has no plan entries. */
  pageCount: number | null;
  pdfCreationDate: number | null;
  thumbnail: string | null;
  /** MERGE-04: a file that cannot take part is kept in the list, marked, so
   * the error block and the row agree on which one it is. */
  error: 'encrypted' | 'unreadable' | null;
}

interface Model {
  entries: FileEntry[];
  /** MERGE-09: the single source of output order. Every page of every file,
   * as PlanEntry { key, fileId, pageIndex, rotation, skipped }. Grouped by
   * file until a page crosses a file boundary in the grid. */
  plan: PlanEntry[];
  /** The file sort the menu shows. Part of the document so undoing a sort
   * brings the menu's choice back with the order it produced. */
  sortMode: SortMode;
}

/* Direction A wave 2 (Shlomi): Reverse folded into the Sort select as its
 * own option, rather than a separate button beside it. */
type SortMode = 'added' | 'reversed' | 'nameAsc' | 'nameDesc' | 'dateAsc' | 'dateDesc';

function toEntry(file: File): FileEntry {
  return { id: nextId++, file, pageCount: null, pdfCreationDate: null, thumbnail: null, error: null };
}

/* MERGE-11: the one remembered option, on device, under the existing
   `pdf-toolkit:` prefix. A person who always wants page numbers sets it
   once; nothing is sent anywhere. */
const OPTIONS_KEY = 'pdf-toolkit:merge:options';

function readRememberedOptions(): { addPageNumbers: boolean } {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (!raw) return { addPageNumbers: false };
    const parsed = JSON.parse(raw);
    return { addPageNumbers: parsed?.addPageNumbers === true };
  } catch {
    // expected: a stored preference that cannot be read falls back to the default
    return { addPageNumbers: false };
  }
}

function rememberOptions(options: { addPageNumbers: boolean }) {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // expected: blocked localStorage, remembering is a convenience
  }
}

/* Where a file's pages go in the plan once its page count arrives: before
   the first plan entry of any file that comes later in the list, so a file
   inserted between two others lands between their pages even when its
   count resolves after theirs. */
function planInsertionIndex(plan: PlanEntry[], entries: FileEntry[], fileId: number): number {
  const position = entries.findIndex((e) => e.id === fileId);
  const laterIds = new Set(entries.slice(position + 1).map((e) => e.id));
  const index = plan.findIndex((entry) => laterIds.has(entry.fileId));
  return index === -1 ? plan.length : index;
}

/* MERGE-17: the one quiet line after the first result in this browser. The
   flag is set the moment the line is shown, so it never returns. */
const FIRST_RESULT_KEY = 'pdf-toolkit:merge:first-result-seen';

function firstResultSeen(): boolean {
  try {
    return localStorage.getItem(FIRST_RESULT_KEY) === '1';
  } catch {
    // expected: blocked localStorage, treated as already seen
    return true;
  }
}

function markFirstResultSeen() {
  try {
    localStorage.setItem(FIRST_RESULT_KEY, '1');
  } catch {
    // expected: blocked localStorage, the line just shows again next time
  }
}

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

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<unknown>;
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

const DEFAULT_HANDOFF_HREFS: HandoffHrefs = { compress: '/compress/', sign: '/sign/' };

export default function PdfMergeTool({
  messages: messagesProp,
  shellMessages,
  unlockHref = '/unlock/',
  handoffHrefs,
  quietPolicy,
  navigate = (href) => { window.location.href = href; },
}: PdfMergeToolProps = {}) {
  const hrefs: HandoffHrefs = { ...DEFAULT_HANDOFF_HREFS, ...handoffHrefs };
  const t: MergeMessages = { ...englishMergeMessages, ...messagesProp };
  const sm: ShellMessages = { ...englishShellMessages, ...shellMessages };
  /* GRID-03: one Undo/Redo stack over the whole document. A user edit is a
   * `commit`; a late arrival (files being added, a page count or thumbnail
   * resolving) is an `amend`, so undo can never take it away; a restore or
   * Clear all is a `reset`. */
  const [announcement, setAnnouncement] = useState('');
  const {
    present, canUndo, canRedo, commit: commitModel, amend: amendModel, reset: resetModel, onPlanChange, handleUndo, handleRedo,
  } = useDocumentHistory<Model>({ entries: [], plan: [], sortMode: 'added' }, {
    tool: 'merge',
    announce: setAnnouncement,
    messages: { undone: t.undoneAnnouncement, redone: t.redoneAnnouncement },
  });
  const { entries, plan, sortMode }: Model = present;
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<File[]>([]);
  const [addPageNumbers, setAddPageNumbers] = useState(() => readRememberedOptions().addPageNumbers);
  /* MERGE-11 (2026-09-13, Shlomi): the output name, once a person edits it in
   * the document heading, is theirs - null means "still the automatic name",
   * a string means "renamed", and it survives every later add/remove/reorder
   * until Clear all. The name is WYSIWYG - one `contenteditable` span, never
   * a button swapped for an input - so there is no separate draft string:
   * `nameRef` reads the DOM node's own text directly to commit it.
   * `isRenamingOutputName` is only the toggle for `contenteditable`/`role`/
   * the affordance styling; `skipNextNameBlurCommit` lets Escape blur the
   * span without its own `onBlur` re-committing the text it was just told to
   * discard. `nameRemountKey` is bumped on every commit and cancel (never on
   * entering edit, which would drop the caret/focus just placed): typing
   * into a contenteditable node can replace its Text child with a new DOM
   * object (browsers do this on some edits, and any Escape/paste fallback
   * that writes `textContent` always does), which leaves Preact's own
   * `_dom` reference for that child pointing at a detached node - silently
   * "fixing" nothing on the next reactive render since Preact patches a node
   * nobody sees any more. Changing `key` forces Preact to discard that node
   * and mount a fresh one from the current (correct) `title`, which is the
   * standard remedy for a contenteditable region a framework also renders
   * into. */
  const [customOutputName, setCustomOutputName] = useState<string | null>(null);
  const [isRenamingOutputName, setIsRenamingOutputName] = useState(false);
  const [renderedCount, setRenderedCount] = useState(0);
  /* Direction A wave 2 (Shlomi): the restored-draft sentence shows once, for
   * five seconds, then gives way for good to the small "Draft saved" chip
   * that lives beside Add files / Clear all for the rest of the session. */
  const [showPickedUpSentence, setShowPickedUpSentence] = useState(false);
  const pickedUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* The shortcuts line shows once, for about six seconds, on the first
   * keyboard (not pointer) focus of a page cell, then never again this
   * mount. */
  const [showShortcutsHint, setShowShortcutsHint] = useState(false);
  const shortcutsShownRef = useRef(false);
  const shortcutsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloaded = useDownloaded();
  const listRef = useRef<HTMLUListElement | null>(null);
  /* Phone chip row (Shlomi's reduction, wave 2): a second, independent
   * SortableJS list over the same `entries`, since the desktop rail's list
   * and the chip row are two different DOM lists shown one at a time via
   * CSS, not one list re-skinned. */
  const chipListRef = useRef<HTMLUListElement | null>(null);
  const chipSortableRef = useRef<Sortable | null>(null);
  const stripRef = useRef<HTMLUListElement | null>(null);
  const documentRef = useRef<HTMLDivElement | null>(null);
  const [layoutEl, setLayoutEl] = useState<HTMLDivElement | null>(null);
  useLinkedHighlight(layoutEl);
  const startMergeMoment = useMergeMoment(layoutEl);
  const sortableRef = useRef<Sortable | null>(null);
  const insertIndexRef = useRef(-1);
  /* MERGE-10: a file dropped onto the grid lands at that page position. The
     plan index is recorded per new entry and consumed when its page count
     arrives, because the pages cannot be placed before the count is known. */
  const stripInsertIndexRef = useRef(-1);
  const pendingPlanIndexRef = useRef(new Map<number, number>());
  /* MERGE-08: the grid, the preview dialog and (MERGE-13) the draft hook all
     arrive through dynamic import(), so the eager graph check-page-weight.js
     measures for /merge/ does not grow with them. */
  const [PageGrid, setPageGrid] = useState<ComponentType<PageGridProps> | null>(null);
  /* MERGE-13: crash-safe draft. The hook lives in MergeDraftPersistence,
     loaded through a dynamic import() on mount; until it reports, the hint
     alone decides whether the empty state is held back. */
  const [DraftPersistence, setDraftPersistence] = useState<ComponentType<MergeDraftPersistenceProps> | null>(null);
  const [draftState, setDraftState] = useState<{ isRestoring: boolean; draftSaveState: MergeDraftSaveState }>(
    () => ({ isRestoring: hasMergeDraftHint(), draftSaveState: 'idle' }),
  );
  const clearDraftRef = useRef<(() => Promise<boolean>) | null>(null);
  const handedOffRef = useRef(false);
  const restoreScrollPendingRef = useRef(false);
  const [restoreHydrationComplete, setRestoreHydrationComplete] = useState(true);
  // Persists for this mounted workspace after a valid restore. The page shell
  // uses it to retain the first-paint geometry that a fresh picker is allowed
  // to collapse after a user gesture.
  const [isRestoredWorkspace, setIsRestoredWorkspace] = useState(false);
  const draftOptions = useMemo(() => ({ addPageNumbers }), [addPageNumbers]);
  /* MERGE-17 */
  const [showInstallLine, setShowInstallLine] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [onIos, setOnIos] = useState(false);

  // The one readiness condition: the restore marker is released and the
  // layout wrapper below carries `data-merge-workspace-ready` on the same
  // commit, so the page is never revealed before the grid is in the DOM.
  const workspaceReady = Boolean(PageGrid) && plan.length > 0;

  const grouped = useMemo(() => isGrouped(plan), [plan]);
  const canReorderFiles = entries.length >= 2;
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
  // MERGE-11: the automatic name, always kept up to date with the file list,
  // and the effective one - the person's own edit once there is one, which
  // then stops tracking the file list entirely (reset() clears it). Both the
  // download attribute and the PDF Title (usePreparedMerge's own `title`
  // input, passed straight through to mergePdfs's setTitle call) come from
  // the same `title` below, so a rename touches both without extra plumbing.
  const autoOutputTitle = entries.length > 0 ? mergedTitle(entries[0].file.name) : '';
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

  // One protected file is a precondition, not a failure: it gets the shared locked state in place of the
  // result (src/shell/NeedsUnlock.tsx), as in every other tool. Among several files the inline error stays.
  // The probe tells a password from an owner-only restriction; if it cannot say, the inline error shows.
  const [lockedProbe, setLockedProbe] = useState<{ file: File; kind: NeedsUnlockKind | null; bytes: ArrayBuffer | null } | null>(null);
  const lockedFile = entries.length === 1 && entries[0].error === 'encrypted' ? entries[0].file : null;
  useEffect(() => {
    if (!lockedFile) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const bytes = await lockedFile.arrayBuffer();
        const kind = await probeEncryption(bytes);
        const locked = kind === 'needs-password' || kind === 'owner-restricted';
        if (!cancelled) setLockedProbe({ file: lockedFile, kind: locked ? kind : null, bytes: locked ? bytes : null });
      } catch (err) {
        reportError('pdf_tool_run', err, 'check_encryption');
        if (!cancelled) setLockedProbe({ file: lockedFile, kind: null, bytes: null });
      }
    })();
    return () => { cancelled = true; };
  }, [lockedFile]);
  // Settled once the probe has answered for this file; until then nothing shows, so the inline error never
  // flashes before the locked state replaces it.
  const probeSettled = !lockedFile || lockedProbe?.file === lockedFile;
  const needsUnlock = lockedFile && probeSettled && lockedProbe?.kind && lockedProbe.bytes
    ? { file: lockedFile, kind: lockedProbe.kind, bytes: lockedProbe.bytes }
    : null;

  const downloadFlow = useDownloadFlow({
    prepared,
    fileName,
    hrefs,
    blocked: entries.length < 2 ? 'one-file' : (failedEntry || otherError) ? 'error' : null,
    // Page counts still arriving leave the plan empty; that is not "every page skipped".
    nothing: plan.length > 0 && outputPageCount(plan) === 0,
    announce: setAnnouncement,
    messages: { ready: t.mergedReady, shared: t.sharedSuccessfully, canceled: t.sharingCanceled, shareError: t.shareError },
    onDelivered: startMergeMoment,
    navigate,
  });
  const {
    tap, downloadState, downloadedOnce, showStrip, shareReady, handoffBusy, handoffFailed,
    requestHandoff, onDownloadTap, onRowPreparingTap, handleShare, reset: resetDownloadFlow,
  } = downloadFlow;

  // Drag-to-reorder in the rail: SortableJS owns the DOM order during a drag;
  // on drop we read its final order back into Preact state, which becomes
  // the source of truth again for every subsequent render. Reordering a file
  // regroups the plan around the new file order (MERGE-09).
  const applyFileReorder = useCallback((oldIndex: number, newIndex: number) => {
    if (oldIndex === newIndex) return;
    commitModel((current: Model) => {
      const next = [...current.entries];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      return { entries: next, plan: regroupPlan(current.plan, next.map((e) => e.id)), sortMode: 'added' };
    });
    recordAction('reorder');
    reportEdit('merge');
  }, [commitModel]);

  useEffect(() => {
    if (!listRef.current) return undefined;
    sortableRef.current?.destroy();
    sortableRef.current = Sortable.create(listRef.current, {
      animation: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      handle: `.${railStyles.grip}`,
      ghostClass: railStyles['is-ghost'],
      chosenClass: railStyles['is-chosen'],
      dragClass: railStyles['is-dragging'],
      forceFallback: false,
      onEnd(evt: Sortable.SortableEvent) {
        if (evt.oldIndex == null || evt.newIndex == null) return;
        applyFileReorder(evt.oldIndex, evt.newIndex);
      },
    });
    return () => {
      // Clear the ref: Sortable's destroy() nulls its element, so a second
      // destroy() on the same instance throws (a production report from
      // Firefox caught it).
      sortableRef.current?.destroy();
      sortableRef.current = null;
    };
  }, [entries.length > 0, applyFileReorder]);

  // The phone chip row: the same whole-file reorder, but a short press-and-hold
  // (touch only) instead of a drag handle, since a chip has no grip of its
  // own - the whole chip is the handle. Give a finger enough movement before
  // cancelling the delayed pickup; the old 5px threshold made an ordinary
  // thumb drift turn into a click before Sortable could start.
  useEffect(() => {
    if (!chipListRef.current) return undefined;
    chipSortableRef.current?.destroy();
    chipSortableRef.current = Sortable.create(chipListRef.current, {
      animation: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      draggable: `.${docStyles.chip}`,
      delay: 100,
      delayOnTouchOnly: true,
      touchStartThreshold: 10,
      // A press on a chip's remove button never starts a drag, and its click
      // still fires.
      filter: `.${docStyles['chip-remove']}`,
      preventOnFilter: false,
      onEnd(evt: Sortable.SortableEvent) {
        if (evt.oldIndex == null || evt.newIndex == null) return;
        applyFileReorder(evt.oldIndex, evt.newIndex);
      },
    });
    return () => {
      chipSortableRef.current?.destroy();
      chipSortableRef.current = null;
    };
  }, [entries.length > 0, applyFileReorder]);

  // ToolPageLayout's pre-paint script sets `html[data-draft-hint]` when a
  // draft exists, and Dropzone.module.css hides the empty-state dropzone under
  // it until hydration commits its real state. Sign never shows an empty state
  // after a restore (Replace loads another file), so its hook only clears the
  // attribute when nothing was restored; Merge does show one again, after
  // Clear all or Start again, so the attribute goes as soon as the check has
  // settled either way. Without this the card came back blank after Clear all.
  useEffect(() => {
    if (draftState.isRestoring) return;
    document.documentElement.removeAttribute('data-draft-hint');
    // A Merge restore holds the temporary shell and static content below it
    // invisible until PageGrid has mounted the real grid. Do not clear its
    // pre-paint marker as soon as IndexedDB returns: the restored files still
    // need to make it through inspection and this dynamically-loaded surface.
    // A missing/stale draft has no files, so it is released immediately.
    if (entries.length === 0 || workspaceReady) document.documentElement.removeAttribute('data-merge-restore');
  }, [draftState.isRestoring, entries.length, workspaceReady]);

  // WebKit intermittently ignores history.scrollRestoration during a reload.
  // Wait until the asynchronously restored grid is really in the document,
  // then reset the stale offset once for that restore. The second pass lands
  // after the restore marker above reveals the completed workspace.
  useEffect(() => {
    if (!workspaceReady || !restoreScrollPendingRef.current) return undefined;
    restoreScrollPendingRef.current = false;
    window.scrollTo(0, 0);
    const frame = requestAnimationFrame(() => window.scrollTo(0, 0));
    return () => cancelAnimationFrame(frame);
  }, [workspaceReady]);

  useEffect(() => {
    let cancelled = false;
    import('./components/MergeDraftPersistence.tsx')
      .then((module) => { if (!cancelled) setDraftPersistence(() => module.default); })
      .catch((err) => { reportError('chunk_load', err, 'import_draft_persistence'); if (!cancelled) setDraftState((current) => ({ ...current, isRestoring: false })); });
    return () => { cancelled = true; };
  }, []);

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
    const plan = restored.plan.map((p) => ({ ...p, fileId: idByIndex[p.fileId], key: `${idByIndex[p.fileId]}:${p.pageIndex}` }));
    resetModel({ entries: restoredEntries, plan, sortMode: 'added' });
    setAddPageNumbers(restored.options.addPageNumbers);
    setCustomOutputName(restored.outputName);
    setRestoreHydrationComplete(false);
    setIsRestoredWorkspace(true);
    setShowPickedUpSentence(true);
    if (pickedUpTimerRef.current) clearTimeout(pickedUpTimerRef.current);
    pickedUpTimerRef.current = setTimeout(() => setShowPickedUpSentence(false), 5000);
    void Promise.allSettled(restoredEntries.map((entry) => inspectEntry(entry)))
      .then(() => setRestoreHydrationComplete(true));
  }, [resetModel]);

  useEffect(() => {
    if (entries.length === 0 || PageGrid) return;
    let cancelled = false;
    import('../../shell/pageGrid/PageGrid.tsx')
      .then((module) => { if (!cancelled) setPageGrid(() => module.default); })
      .catch((err) => { reportError('chunk_load', err, 'import_page_strip'); });
    return () => { cancelled = true; };
  }, [entries.length > 0, PageGrid]);

  // Whole-file reorder remains available after individual pages have crossed
  // file boundaries. Dropping a file deliberately regroups its pages (the
  // same recovery behaviour as choosing a file sort order or Reset order).
  useEffect(() => {
    sortableRef.current?.option('disabled', !canReorderFiles);
    chipSortableRef.current?.option('disabled', !canReorderFiles);
  }, [canReorderFiles]);

  // Everything inspectEntry writes is a late arrival, not a user edit: it is
  // amended into the present and every undo/redo snapshot, so a count or a
  // thumbnail that lands after an edit survives undoing past that edit (and a
  // file removed before its count arrived still gets its pages on Undo).
  const inspectEntry = useCallback((entry: FileEntry) => {
    const inspection = inspectPdf(entry.file)
      .then(({ pageCount, encrypted, creationDate }) => {
        // Read once: the mapper below runs on every snapshot, and the bookkeeping
        // for files dropped together must happen exactly once.
        const recorded = pendingPlanIndexRef.current.get(entry.id);
        amendModel((snapshot: Model) => {
          if (!snapshot.entries.some((e) => e.id === entry.id)) return snapshot;
          const nextEntries = snapshot.entries.map((e) =>
            e.id === entry.id
              ? { ...e, pageCount, pdfCreationDate: creationDate ?? null, error: encrypted ? ('encrypted' as const) : null }
              : e,
          );
          if (encrypted || snapshot.plan.some((p) => p.fileId === entry.id)) return { ...snapshot, entries: nextEntries };
          const at = recorded == null ? planInsertionIndex(snapshot.plan, nextEntries, entry.id) : Math.min(recorded, snapshot.plan.length);
          return { ...snapshot, entries: nextEntries, plan: insertPages(snapshot.plan, planForFile(entry.id, pageCount), at) };
        });
        if (recorded != null) {
          pendingPlanIndexRef.current.delete(entry.id);
          if (!encrypted) {
            // Files dropped together share one recorded index; the ones still
            // waiting for a count move past the pages just placed.
            for (const [id, index] of pendingPlanIndexRef.current) {
              if (index >= recorded) pendingPlanIndexRef.current.set(id, index + pageCount);
            }
          }
        }
      })
      .catch((err) => {
        // Every failure is reported, whoever's file it turns out to be: a valid PDF the library
        // cannot parse is ours, and only the report can tell it from a broken one.
        const cause = reportableCause(err);
        if (cause) reportError('pdf_tool_run', cause, 'inspect_pdf');
        amendModel((snapshot: Model) => ({
          ...snapshot,
          entries: snapshot.entries.map((e) => (e.id === entry.id ? { ...e, error: 'unreadable' as const } : e)),
        }));
      });
    // Thumbnails are nice-to-have, not blocking: render as they resolve
    // instead of waiting before the file appears.
    const thumbnail = renderThumbnail(entry.file)
      .then((thumbnail) => {
        amendModel((snapshot: Model) => ({
          ...snapshot,
          entries: snapshot.entries.map((e) => (e.id === entry.id ? { ...e, thumbnail } : e)),
        }));
      })
      // expected: the thumbnail is decoration, encrypted or malformed user PDFs fail pdf.js by design
      .catch(() => {});
    return Promise.all([inspection, thumbnail]).then(() => undefined);
  }, [amendModel]);

  // Adding files is not an undo step (amend): Undo takes back edits, never a
  // file the person just brought in.
  const insertEntries = useCallback((newEntries: FileEntry[], atIndex: number) => {
    amendModel((snapshot: Model) => {
      const next = [...snapshot.entries];
      const index = atIndex < 0 || atIndex > next.length ? next.length : atIndex;
      next.splice(index, 0, ...newEntries);
      return { ...snapshot, entries: next };
    });
    for (const entry of newEntries) inspectEntry(entry);
  }, [amendModel, inspectEntry]);

  const addFiles = useCallback((fileList: FileList | File[], options: { force?: boolean; fresh?: boolean } = {}) => {
    const incoming = Array.from(fileList);
    // MERGE-02, MERGE-22: classify through deriveFileKind, which falls back to the
    // extension when a drag source or picker hands over a File with an
    // empty `type` - the exact case Compress already accepts.
    const known = incoming.filter((f) => deriveFileKind(f) !== null);
    const rejected = incoming.filter((f) => deriveFileKind(f) === null);
    setRejectedFiles(rejected.length > 0 ? rejected.map((f) => f.name) : []);

    // MERGE-07: a file with the same name and size as one already in the
    // list is almost always the same file picked twice; nudge, do not refuse.
    let accepted = known;
    if (!options.force) {
      const dupes = known.filter((f) => entries.some((e) => e.file.name === f.name && e.file.size === f.size));
      setDuplicates(dupes);
      accepted = known.filter((f) => !dupes.includes(f));
    } else {
      setDuplicates([]);
    }
    if (accepted.length === 0) return;

    const newEntries = accepted.map(toEntry);
    // MERGE-07: dropped onto the list, files go where they were dropped
    // (see the dragover listener below); every other route appends.
    let atIndex = insertIndexRef.current;
    insertIndexRef.current = -1;
    // MERGE-10: dropped onto the grid, the pages go at that position. At a
    // file boundary the file itself slots in between; inside another file's
    // pages the list appends it and the plan interleaves (pages rearranged).
    const planIndex = stripInsertIndexRef.current;
    stripInsertIndexRef.current = -1;
    if (planIndex >= 0) {
      const owner = plan[planIndex];
      const boundary = !owner || planIndex === 0 || plan[planIndex - 1].fileId !== owner.fileId;
      atIndex = owner && boundary ? entries.findIndex((e) => e.id === owner.fileId) : -1;
      for (const entry of newEntries) pendingPlanIndexRef.current.set(entry.id, planIndex);
    }
    insertEntries(newEntries, atIndex);
    // DEBT-58: the first files into an empty list are the file arriving, not an edit.
    if (entries.length > 0 && !options.fresh) reportEdit('merge');
    recordAction('add_files');
    setAnnouncement(
      newEntries.length === 1 ? t.filesAddedOne : formatMessage(t.filesAddedMany, { count: newEntries.length }),
    );
  }, [entries, plan, insertEntries, t.filesAddedOne, t.filesAddedMany]);

  // Everything on screen that belongs to the current set, shared by Clear all
  // and a home-page hand-off so the two cannot drift. It never touches the
  // saved draft: Clear all deletes that itself, a hand-off must not.
  const clearWorkspace = useCallback(() => {
    resetModel({ entries: [], plan: [], sortMode: 'added' });
    resetDownloadFlow();
    setRejectedFiles([]);
    setDuplicates([]);
    setRenderedCount(0);
    setShowPickedUpSentence(false);
    setIsRestoredWorkspace(false);
    if (pickedUpTimerRef.current) clearTimeout(pickedUpTimerRef.current);
    setShowShortcutsHint(false);
    shortcutsShownRef.current = false;
    if (shortcutsTimerRef.current) clearTimeout(shortcutsTimerRef.current);
    pendingPlanIndexRef.current.clear();
    // MERGE-11: the next set of files gets the automatic output name again,
    // not the previous set's.
    setCustomOutputName(null);
    setIsRenamingOutputName(false);
  }, [resetDownloadFlow, resetModel]);

  // SITE-42: several files picked on the home page arrive as a brand-new set,
  // through addFiles like a manual pick. Whatever a restore already put on
  // screen is replaced, but the saved set is NOT cleared (no reset(), no
  // clearDraftRef): it stays in the shared recents, and the new set saves as
  // its own entry because an entry's id is derived from its files' bytes
  // (draftStore's sourceIdForFiles), never reused from the current pointer.
  useHandoffFilesIntake('merge', (files) => {
    handedOffRef.current = true;
    clearWorkspace();
    setRestoreHydrationComplete(true);
    setAddPageNumbers(readRememberedOptions().addPageNumbers);
    addFiles(files, { force: true, fresh: true });
  });

  // One undo step: the snapshot restores the file and its pages where they
  // were, so a page order rearranged across files survives remove-and-undo.
  const removeEntry = useCallback((id: number) => {
    commitModel((current: Model) => {
      const entry = current.entries.find((e) => e.id === id);
      if (!entry) return current;
      setAnnouncement(formatMessage(t.fileRemoved, { name: entry.file.name }));
      return { ...current, entries: current.entries.filter((e) => e.id !== id), plan: removeFile(current.plan, id) };
    });
    recordAction('remove_file');
    reportEdit('merge');
  }, [commitModel, t.fileRemoved]);

  useEffect(() => () => {
    if (pickedUpTimerRef.current) clearTimeout(pickedUpTimerRef.current);
    if (shortcutsTimerRef.current) clearTimeout(shortcutsTimerRef.current);
  }, []);

  const onFirstKeyboardFocus = useCallback(() => {
    if (shortcutsShownRef.current) return;
    shortcutsShownRef.current = true;
    setShowShortcutsHint(true);
    shortcutsTimerRef.current = setTimeout(() => setShowShortcutsHint(false), 6000);
  }, []);

  const reset = useCallback(() => {
    clearWorkspace();
    void clearDraftRef.current?.();
    setAnnouncement(t.cleared);
    recordAction('clear_all');
  }, [clearWorkspace, t.cleared]);

  const reorderEntries = useCallback((next: FileEntry[], mode: SortMode, message: string) => {
    commitModel((current: Model) => ({ entries: next, plan: regroupPlan(current.plan, next.map((e) => e.id)), sortMode: mode }));
    setAnnouncement(message);
    reportEdit('merge');
  }, [commitModel]);

  const moveFileEntry = useCallback((id: number, delta: number) => {
    commitModel((current: Model) => {
      const index = current.entries.findIndex((e) => e.id === id);
      const newIndex = index + delta;
      if (index === -1 || newIndex < 0 || newIndex >= current.entries.length) return current;
      const next = [...current.entries];
      const [moved] = next.splice(index, 1);
      next.splice(newIndex, 0, moved);
      setAnnouncement(formatMessage(t.fileMovedTo, { name: moved.file.name, position: newIndex + 1, total: next.length }));
      return { entries: next, plan: regroupPlan(current.plan, next.map((e) => e.id)), sortMode: 'added' };
    });
    recordAction('reorder');
    reportEdit('merge');
  }, [commitModel, t.fileMovedTo]);

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

  const onSortChange = useCallback((value: string) => {
    const mode = value as SortMode;
    const sorted = mode === 'nameAsc'
      ? sortByName(entries, 'asc')
      : mode === 'nameDesc'
        ? sortByName(entries, 'desc')
        : mode === 'dateAsc'
          ? sortByDate(entries, 'asc')
          : mode === 'dateDesc'
            ? sortByDate(entries, 'desc')
            : mode === 'reversed'
              ? [...entries].reverse()
              : [...entries].sort((a, b) => a.id - b.id);
    reorderEntries(sorted, mode, t.filesReordered);
    recordAction('sort');
  }, [entries, reorderEntries, t.filesReordered]);

  const resetPageOrder = useCallback(() => {
    commitModel((current: Model) => ({ ...current, plan: regroupPlan(current.plan, current.entries.map((e) => e.id)) }));
    setAnnouncement(t.filesReordered);
    recordAction('sort');
    reportEdit('merge');
  }, [commitModel, t.filesReordered]);

  // Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z are bound by useDocumentHistory, which stands down while
  // focus is in an input (the page-numbers checkbox, the rename field). The prepared output
  // follows the plan on its own (usePreparedMerge keys on it), so nothing is cleared here.

  const onPageNumbersChange = useCallback((event: Event) => {
    const next = (event.target as HTMLInputElement).checked;
    setAddPageNumbers(next);
    rememberOptions({ addPageNumbers: next });
    recordAction('change_setting');
  }, []);

  // MERGE-11: the rename itself lives in the shell's OutputName. '' means the
  // person emptied it, which goes back to the automatic name.
  const renameOutput = useCallback((next: string) => {
    setCustomOutputName(next.length > 0 ? next : null);
  }, []);

  const scrollToCaption = useCallback((fileId: number) => {
    const container = documentRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-caption-for="${fileId}"]`)
      ?? container?.querySelector<HTMLElement>(`[data-key^="${fileId}:"]`);
    target?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);


  /* MERGE-07 and MERGE-10: insert where dropped. BasePdfTool's card catches
     the drop and calls addFiles; this listener only works out, during the
     native drag, which row of the rail list or which cell of the grid the
     pointer is over, paints the insertion line straight onto the DOM (a
     gesture-time DOM write, not state), and leaves the index in a ref for
     addFiles to read once, on drop. */
  useEffect(() => {
    if (entries.length === 0) return undefined;
    const paint = (container: HTMLElement | null, index: number) => {
      if (!container) return;
      const items = Array.from(container.querySelectorAll<HTMLElement>(':scope > [data-id], :scope > [data-key]'));
      items.forEach((item, i) => {
        if (i === index) item.setAttribute('data-insert-before', '');
        else item.removeAttribute('data-insert-before');
      });
      if (index === items.length && items.length > 0) container.setAttribute('data-insert-end', '');
      else container.removeAttribute('data-insert-end');
    };
    const clear = () => {
      insertIndexRef.current = -1;
      stripInsertIndexRef.current = -1;
      paint(listRef.current, -1);
      paint(stripRef.current, -1);
    };
    const within = (rect: DOMRect, x: number, y: number, slack: number) =>
      x >= rect.left - slack && x <= rect.right + slack && y >= rect.top - slack && y <= rect.bottom + slack;
    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event.dataTransfer)) return;
      const list = listRef.current;
      const strip = stripRef.current;
      if (list && within(list.getBoundingClientRect(), event.clientX, event.clientY, 8)) {
        const rows = Array.from(list.children) as HTMLElement[];
        let index = rows.length;
        for (let i = 0; i < rows.length; i += 1) {
          const r = rows[i].getBoundingClientRect();
          if (event.clientY < r.top + r.height / 2) {
            index = i;
            break;
          }
        }
        if (index !== insertIndexRef.current || stripInsertIndexRef.current !== -1) {
          stripInsertIndexRef.current = -1;
          paint(strip, -1);
          insertIndexRef.current = index;
          paint(list, index);
        }
        return;
      }
      if (strip && within(strip.getBoundingClientRect(), event.clientX, event.clientY, 8)) {
        const cards = Array.from(strip.querySelectorAll<HTMLElement>(':scope > [data-key]'));
        const rtl = getComputedStyle(strip).direction === 'rtl';
        let index = cards.length;
        for (let i = 0; i < cards.length; i += 1) {
          const r = cards[i].getBoundingClientRect();
          const before = rtl ? event.clientX > r.left + r.width / 2 : event.clientX < r.left + r.width / 2;
          if (before) {
            index = i;
            break;
          }
        }
        if (index !== stripInsertIndexRef.current || insertIndexRef.current !== -1) {
          insertIndexRef.current = -1;
          paint(list, -1);
          stripInsertIndexRef.current = index;
          paint(strip, index);
        }
        return;
      }
      clear();
    };
    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) clear();
    };
    // `drop` on window fires after BasePdfTool's card handler has already
    // called addFiles with the refs still set; this only tidies up.
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', clear);
    window.addEventListener('dragend', clear);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', clear);
      window.removeEventListener('dragend', clear);
    };
  }, [entries.length > 0]);

  // MERGE-17: the browser's own install prompt, if it offers one. Read the
  // platform in an effect, never in render (see platform.ts).
  useEffect(() => {
    setOnIos(isIOSDevice(typeof navigator === 'undefined' ? null : navigator));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  useEffect(() => {
    if (prepared.status !== 'ready' || showInstallLine || firstResultSeen()) return;
    markFirstResultSeen();
    setShowInstallLine(true);
  }, [prepared.status, showInstallLine]);

  const requestInstall = useCallback(() => {
    const prompt = installPrompt;
    setInstallPrompt(null);
    // expected: the install prompt is an optional browser API and the person may dismiss it
    prompt?.prompt().catch(() => {});
  }, [installPrompt]);

  const hasFiles = entries.length > 0;
  // A reload with files loaded (the draft brings them back) would put the
  // page back at its old offset, measured against a layout the restore then
  // grows by a whole document; the browser keeps retrying that offset as the
  // page grows. Measured at 375px it landed below the grid, where nothing was
  // near enough to render, and the merge looked like it had no thumbnails.
  // Set the mode while files are on the page, ahead of any reload. WebKit
  // does not apply it reliably, so a restored workspace also resets the
  // stale offset once its async grid has mounted (the effect above).
  useEffect(() => {
    if (typeof history === 'undefined' || !('scrollRestoration' in history)) return;
    history.scrollRestoration = hasFiles ? 'manual' : 'auto';
  }, [hasFiles]);

  const rearranged = hasFiles && (!grouped || !listOrdered);
  const showSortControls = entries.length >= 2 && !rearranged;

  const detail = downloadDetail(prepared, outputPageCount(plan), sm, t.dir);
  // A file flagged by inspection (encrypted, unreadable) is the person's file,
  // not a failed operation; a failure of the merge run itself, which
  // usePreparedMerge reports, still counts.
  const analyticsStatus = prepared.status === 'error' ? 'error' : tap;

  const draftStatusLabel = draftState.draftSaveState === 'saved' ? sm.draftSaved
    : draftState.draftSaveState === 'pending' ? sm.draftSaving
      : draftState.draftSaveState === 'error' ? sm.draftNotSaved
        : draftState.draftSaveState === 'conflict' ? sm.draftConflict
          : null;

  // Heading and Download-element counts: the merge OUTPUT (skipped pages
  // excluded), never the raw plan length - a skipped page still gets a
  // "1 skipped" addendum, never inflates the page count itself (PART 2:
  // this fixed "Preparing 27 pages…" counting a skipped page). Rendering
  // progress ("7 of 9 rendered") is a separate figure: it tracks every cell
  // that needs a thumbnail, skipped ones included, and disappears once done.
  const outputCount = outputPageCount(plan);
  const skippedCount = plan.length - outputCount;
  const renderTotal = plan.length;
  const stillRendering = renderTotal > 0 && renderedCount < renderTotal;
  // Beside the history buttons, only one line lives in the header slot at a time: the
  // restore sentence (its phone placement - review P2, item 3) wins over the
  // once-only shortcuts hint.
  const pickedUpHintVisible = showPickedUpSentence;
  const shortcutsHintVisible = !pickedUpHintVisible && showShortcutsHint;
  const sortOptions = [
    { value: 'added', label: t.sortAsAdded },
    { value: 'reversed', label: t.sortReversed },
    { value: 'nameAsc', label: t.sortNameAsc },
    { value: 'nameDesc', label: t.sortNameDesc },
    { value: 'dateAsc', label: t.sortDateAsc },
    { value: 'dateDesc', label: t.sortDateDesc },
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
      checkingDraft={!hasFiles && draftState.isRestoring}
      hideIdentity
    >
      {DraftPersistence && (
        <DraftPersistence
          entries={entries}
          plan={plan}
          options={draftOptions}
          title={title}
          outputName={customOutputName}
          restoreHydrationComplete={restoreHydrationComplete}
          onRestore={onDraftRestore}
          onStateChange={setDraftState}
          registerClear={(clear) => { clearDraftRef.current = clear; }}
        />
      )}

      {rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {rejectedFiles.length === 1
            ? formatMessage(t.skippedOne, { name: isolateName(rejectedFiles[0], t.dir) })
            : formatMessage(t.skippedMany, { count: rejectedFiles.length })}
        </p>
      )}

      {duplicates.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          <span>{duplicates.map((f) => formatMessage(t.alreadyAdded, { name: isolateName(f.name, t.dir) })).join(' ')}</span>{' '}
          <button type="button" class={pdfToolStyles['quiet-link']} onClick={() => addFiles(duplicates, { force: true })}>
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
                'data-merge-restored-workspace': isRestoredWorkspace || undefined,
              }}
              layoutRef={setLayoutEl}
              documentRef={documentRef}
              phoneBar={(
                <>
                  <p class="sr-only" id="reorder-hint">{t.reorderHint}</p>

                  {/* Phone and tablet chip row: replaces the rail's file list below
                      1024px. The controls that used to sit behind "⋯" remain
                      visible in the compact toolbar below. */}
                  <div class={workspaceStyles['chip-bar']}>
                    <ul class={docStyles['chip-row']} ref={chipListRef}>
                      {entries.map((entry, index) => (
                        <li
                          key={entry.id}
                          class={docStyles.chip}
                          data-id={entry.id}
                        >
                          <span class={docStyles['chip-pill']}>
                            <span class={docStyles['chip-tag']} style={{ '--tag-color': `var(--color-tag-${(index % 6) + 1})` } as any} aria-hidden="true" />
                            <FileName name={entry.file.name} className={docStyles['chip-name']} extension={false} />
                            <span class={docStyles['chip-pages']}>{entry.pageCount ?? '…'}</span>
                            <button
                              type="button"
                              class={docStyles['chip-remove']}
                              aria-label={formatMessage(t.removeLabel, { name: entry.file.name })}
                              onClick={() => removeEntry(entry.id)}
                            >
                              <XIcon size={14} aria-hidden="true" />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                    {/* MERGE-24 (2026-10-23): the quiet Download at the sticky bar's
                        inline end, doing exactly what the completion row's Download
                        element does in each state (same link, same handlers). */}
                    <PhoneFinish
                      flow={downloadFlow}
                      prepared={prepared}
                      fileName={fileName}
                      detail={detail}
                      handoffs={[
                        { tool: 'compress', label: t.handoffCompress, Icon: Shrink, ...(prepared.blob ? { detail: formatFileSize(prepared.blob.size) } : {}) },
                        { tool: 'sign', label: t.handoffSign, Icon: FileSignature },
                      ]}
                      labels={{ download: t.downloadShort, ready: t.mergedReady, closeStrip: t.closeStrip, handoffFailed: t.handoffFailed, nothing: t.allSkipped }}
                      stripAttrs={{ 'data-merge-done-strip': true }}
                    >
                      {rating}
                    </PhoneFinish>
                  </div>
                </>
              )}
              /* These use the rail's existing control styles and handlers in one
                 row that wraps to two lines on a phone. Sort stays visible after a
                 page-level rearrangement: sorting files regroups the plan,
                 while Reset order explicitly restores it. */
              phoneControls={(
                <div class={workspaceStyles['mobile-file-controls']} data-merge-file-controls>
                  <div class={workspaceStyles['quiet-row']}>
                    <button type="button" class={workspaceStyles['quiet-button']} onClick={requestReplace}><FilePlus size={16} aria-hidden="true" />{sm.addLabel}</button>
                    <button type="button" class={workspaceStyles['quiet-button']} onClick={requestClear}><Trash2 size={16} aria-hidden="true" />{sm.clearLabel}</button>
                  </div>
                  {entries.length >= 2 && (
                    <SortMenu label={t.sortFilesLabel} ariaLabel={t.sortLabel} value={sortMode} options={sortOptions} onChange={onSortChange} hideLabel />
                  )}
                  {entries.length >= 2 && rearranged && (
                    <div class={railStyles['rearranged-note']} role="status">
                      <span>{t.pagesRearranged}</span>
                      <button type="button" class={railStyles['reset-order']} onClick={resetPageOrder}>
                        {t.resetOrder}
                      </button>
                    </div>
                  )}
                </div>
              )}
              /* Coarse pointer only (CSS-gated, PageWorkspace.module.css): the
                 chip row and the page grid below both drag on press-and-hold
                 (SortableJS's delayOnTouchOnly), with no grip icon standing in
                 for the gesture the way the desktop rail's handle does, so
                 nothing tells a phone that dragging works at all. Gated on
                 having something worth reordering, same threshold as the
                 desktop rail's own Sort control. */
              touchHint={(entries.length > 1 || outputCount > 1) && t.touchDragHint}
              heading={needsUnlock ? null : (
                <h2 class={workspaceStyles['doc-heading']} id="page-grid-heading">
                  {/* MERGE-11 (Shlomi's WYSIWYG rebuild, 2026-09-13): the
                      visible name IS the editable output file name - one
                      span, at rest identical to the old plain heading text,
                      that becomes contenteditable in place on click. This
                      sr-only lead-in keeps the region announcing what it is
                      for anyone not reading the name itself. */}
                  <span class="sr-only">{t.documentHeading}</span>
                  <OutputName
                    name={title}
                    label={t.fileNameEditableLabel}
                    onRename={renameOutput}
                    onEditingChange={setIsRenamingOutputName}
                    wrapOnPhone
                  >
                    <span class={workspaceStyles['doc-heading-count']}>
                      {' · '}{pagesLabel(outputCount, sm)}
                      {skippedCount > 0 ? ` · ${skippedLabel(skippedCount, t)}` : ''}
                    </span>
                    {stillRendering && (
                      <span class={docStyles['doc-heading-progress']}>
                        {' · '}{formatMessage(t.renderedCount, { count: renderedCount })}
                      </span>
                    )}
                  </OutputName>
                </h2>
              )}
              headerStatus={needsUnlock ? null : (
                <>
                  <HistoryButtons canUndo={canUndo} canRedo={canRedo} onUndo={handleUndo} onRedo={handleRedo} labels={t} />
                  {pickedUpHintVisible ? (
                    /* Review P2, item 3: the rail's own "Picked up..." sentence
                       lives in `.rail-scroll`, which is CSS-hidden on phones,
                       so it never showed there. This is the phone placement -
                       same sentence, its own 5-second window, then nothing
                       (never the persistent "Draft saved" chip, which stays a
                       desktop-rail-only affordance) - CSS-hidden at 768px and
                       up so the two placements never show at once. */
                    <span class={docStyles['header-draft-chip']} role="status">
                      {t.pickedUp}
                      {' '}
                      <button type="button" class={docStyles['start-fresh']} onClick={requestClear}>{t.startFresh}</button>
                    </span>
                  ) : shortcutsHintVisible ? (
                    <span class={docStyles['shortcuts-hint']} role="status">{t.shortcutsLine}</span>
                  ) : isRestoredWorkspace ? (
                    /* QUAL-10: below 768px this slot is its own row and
                       `:empty` folds it away, so the sentence timing out
                       would lift the grid. Keep one silent child in the slot. */
                    <span class={docStyles['header-draft-chip']} aria-hidden="true" />
                  ) : null}
                </>
              )}
              railContent={(
                <>
                    <ul class={railStyles['file-list']} ref={listRef} aria-describedby="reorder-hint">
                      {entries.map((entry, index) => (
                        <li
                          key={entry.id}
                          class={railStyles['file-row']}
                          data-id={entry.id}
                          data-file-id={entry.id}
                          data-link-row
                          data-error={entry.error || undefined}
                          onClick={() => scrollToCaption(entry.id)}
                        >
                          {/* A whole-file move is also the quickest way back from
                              an interleaved page plan: it regroups that file's
                              pages in the newly selected file order. */}
                          {canReorderFiles && (
                            <span
                              class={railStyles.grip}
                              tabIndex={0}
                              role="button"
                              aria-label={formatMessage(t.dragHandleLabel, { name: entry.file.name, position: index + 1, total: entries.length })}
                              onKeyDown={(e) => { e.stopPropagation(); onRowKeyDown(e, entry.id); }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <circle cx="5" cy="3" r="1.4" fill="currentColor" />
                                <circle cx="11" cy="3" r="1.4" fill="currentColor" />
                                <circle cx="5" cy="8" r="1.4" fill="currentColor" />
                                <circle cx="11" cy="8" r="1.4" fill="currentColor" />
                                <circle cx="5" cy="13" r="1.4" fill="currentColor" />
                                <circle cx="11" cy="13" r="1.4" fill="currentColor" />
                              </svg>
                            </span>
                          )}
                          <span class={railStyles['tag-square']} style={{ '--tag-color': `var(--color-tag-${(index % 6) + 1})` } as any} aria-hidden="true" />
                          <FileName name={entry.file.name} className={railStyles['file-name']} />
                          <span class={railStyles['file-pages']}>
                            <FileIcon size={12} aria-hidden="true" />
                            {entry.pageCount ?? '…'}
                          </span>
                          <button
                            type="button"
                            class={railStyles['file-remove']}
                            aria-label={formatMessage(t.removeLabel, { name: entry.file.name })}
                            onClick={(e) => { e.stopPropagation(); removeEntry(entry.id); }}
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>

                    {rearranged ? (
                      <div class={railStyles['rearranged-note']} role="status">
                        <span>{t.pagesRearranged}</span>
                        <button type="button" class={railStyles['reset-order']} onClick={resetPageOrder}>
                          {t.resetOrder}
                        </button>
                      </div>
                    ) : showSortControls && (
                      <div class={railStyles['list-controls']}>
                        <SortMenu label={t.sortFilesLabel} ariaLabel={t.sortLabel} value={sortMode} options={sortOptions} onChange={onSortChange} />
                      </div>
                    )}

                    {/* Shlomi (2026-09-13): "Draft saved" (or the restore
                        sentence) on its own line, end-aligned, so its width never
                        moves Add files / Clear all below it and the Hebrew
                        edition mirrors it for free (text-align: end is a logical
                        property). */}
                    {/* QUAL-10: a restored workspace keeps this row after the
                        sentence's five seconds are up (blank, then "Draft saved"
                        on the first real edit), so its going never pulls the rows
                        below it up. A fresh pick has no row until its first save. */}
                    {(showPickedUpSentence || draftStatusLabel || isRestoredWorkspace) && (
                      <div class={railStyles['draft-status-row']}>
                        {showPickedUpSentence ? (
                          <>
                            {t.pickedUp} <button type="button" class={workspaceStyles['quiet-button']} onClick={requestClear}>{t.startFresh}</button>
                          </>
                        ) : draftStatusLabel ? (
                          <>
                            <span>{draftStatusLabel}</span>
                            {draftState.draftSaveState !== 'error' && draftState.draftSaveState !== 'conflict' && (
                              <DraftRetentionHint label={sm.draftRetentionInfo} />
                            )}
                          </>
                        ) : '\u00a0'}
                      </div>
                    )}

                    <div class={workspaceStyles['quiet-row']}>
                      {/* Shlomi (2026-09-13): the two actions are bordered
                          buttons now, so the "·" that used to separate them as
                          text links is gone; the row's gap does the separating. */}
                      <button type="button" class={workspaceStyles['quiet-button']} onClick={requestReplace}><FilePlus size={16} aria-hidden="true" />{sm.addLabel}</button>
                      <button type="button" class={workspaceStyles['quiet-button']} onClick={requestClear}><Trash2 size={16} aria-hidden="true" />{sm.clearLabel}</button>
                    </div>
                </>
              )}
              railPinned={(
                <>
                  {/* Direction A follow-up (review P1): the page-numbers row and
                      the hand-off row only make sense once a merge is possible -
                      with one file the Download element's own text-plus-
                      button state is the whole story, so both are held back
                      until there are two files. Shlomi (2026-09-13): the Options
                      disclosure is gone entirely - a plain checkbox row directly
                      above Download, no summary, no chevron, nothing to open.
                      MERGE-24 (2026-10-23): shown at every width, since below
                      1024px this rail is the completion row under the pages. */}
                  {entries.length >= 2 && (
                    <PageNumbersRow checked={addPageNumbers} onChange={onPageNumbersChange} label={t.addPageNumbers} />
                  )}

                  <DownloadElement
                    state={downloadState}
                    href={prepared.status === 'ready' ? prepared.url : null}
                    fileName={fileName}
                    detail={detail}
                    renderedCount={renderedCount}
                    totalCount={renderTotal}
                    pageCount={outputCount}
                    progress={prepared.progress}
                    errorMessage={failedEntry ? undefined : t.buildFailed}
                    messages={t}
                    chooseFilesLabel={sm.chooseFilesMany}
                    onChooseFiles={requestReplace}
                    onPreparingTap={onRowPreparingTap}
                    onWarm={prepared.prepareNow}
                    onDownloadClick={onDownloadTap}
                    isOutputNameBeingRenamed={isRenamingOutputName}
                  />

                  {entries.length >= 2 && (
                    <FinishRow
                      ready={prepared.status === 'ready'}
                      shareReady={shareReady}
                      onShare={handleShare}
                      busy={handoffBusy}
                      onHandoff={(tool) => { void requestHandoff(tool); }}
                      onWarm={prepared.prepareNow}
                      labels={{ share: t.shareLabel, compress: t.handoffCompress, sign: t.handoffSign }}
                    />
                  )}

                  {downloadedOnce && (
                    <button type="button" class={railStyles['start-again']} onClick={reset}>
                      {t.startAgain}
                    </button>
                  )}

                  {handoffFailed && (
                    <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">{t.handoffFailed}</p>
                  )}

                  {downloadState === 'saved' && showInstallLine && (
                    <p class={railStyles['install-line']} data-install-line>
                      {t.installLine}{' '}
                      {installPrompt ? (
                        t.installWithPrompt.split('{install}').map((part, index) =>
                          index === 0 ? part : (
                            <>
                              <button type="button" class={pdfToolStyles['quiet-link']} onClick={requestInstall}>{t.installLink}</button>
                              {part}
                            </>
                          ))
                      ) : onIos ? t.installIos : t.installOther}
                    </p>
                  )}
                </>
              )}
            >
              {needsUnlock && (
                <NeedsUnlock
                  kind={needsUnlock.kind}
                  file={needsUnlock.file}
                  bytes={needsUnlock.bytes}
                  from="merge"
                  toolName="Merge"
                  verb="merge"
                  replace={false}
                  messages={{
                    title: needsUnlock.kind === 'needs-password' ? t.protectedNeedsPasswordTitle : t.protectedOwnerOnlyTitle,
                    body: needsUnlock.kind === 'needs-password' ? t.protectedNeedsPasswordBody : t.protectedOwnerOnlyBody,
                    unlockIt: t.protectedUnlockIt,
                    handoffFailed: t.protectedHandoffFailed,
                  }}
                />
              )}

              {!needsUnlock && probeSettled && failedEntry && failedReason && (
                <ErrorMessage>
                  {formatMessage(failedReason === 'encrypted' ? t.errorEncrypted : t.errorUnreadable, { name: isolateName(failedEntry.file.name, t.dir) })}
                  {' '}
                  {failedReason === 'encrypted' && (
                    <>
                      <a href={unlockHref}>{t.unlockLink}</a>
                      {' '}
                    </>
                  )}
                  <button type="button" class={pdfToolStyles['quiet-link']} onClick={() => removeEntry(failedEntry.id)}>
                    {t.removeAndMergeRest}
                  </button>
                </ErrorMessage>
              )}

              {!needsUnlock && otherError && <ErrorMessage>{t.errorTooLarge}</ErrorMessage>}

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
                  onRenderedCountChange={setRenderedCount}
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
}
