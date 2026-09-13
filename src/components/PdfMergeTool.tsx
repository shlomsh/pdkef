import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren, ComponentType } from 'preact';
import Sortable from 'sortablejs';
import { inspectPdf, MergeFileError } from '../lib/merge.js';
import {
  insertPages,
  isGrouped,
  isInListOrder,
  mergedFileName,
  mergedTitle,
  outputPageCount,
  planForFile,
  regroupPlan,
  removeFile,
  type PlanEntry,
} from '../lib/mergePlan.ts';
import { deriveFileKind } from '../lib/fileKind.js';
import { sortByDate, sortByName } from '../lib/sort.js';
import { renderThumbnail } from '../lib/thumbnails.js';
import { formatFileSize } from '../lib/format.js';
import { usePdfShare } from '../lib/usePdfShare.js';
import { isIOSDevice } from '../lib/platform.ts';
import BasePdfTool from './BasePdfTool.tsx';
import ConfirmDialog from './ConfirmDialog.tsx';
import { useToolShell } from './ToolShell.tsx';
import pdfToolStyles from './PdfTool.module.css';
import docStyles from './MergeTool/MergeDocument.module.css';
import railStyles from './MergeTool/MergeRail.module.css';
import PdfShareButton from './PdfShareButton.tsx';
import ErrorMessage from './ErrorMessage.tsx';
import DownloadElement, { type DownloadElementState } from './MergeTool/DownloadElement.tsx';
import FileName from './MergeTool/FileName.tsx';
import { usePreparedMerge } from './MergeTool/usePreparedMerge.ts';
import type { PageStripProps } from './MergeTool/PageStrip.tsx';
import type { MergeDraftPersistenceProps } from './MergeTool/MergeDraftPersistence.tsx';
import type { MergeDraftRestore, MergeDraftSaveState } from './MergeTool/useMergeDraft.ts';
import {
  englishMergeMessages,
  englishShellMessages,
  formatMessage,
  type MergeMessages,
  type ShellMessages,
} from '../i18n/toolMessages';

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
    return { addPageNumbers: false };
  }
}

function rememberOptions(options: { addPageNumbers: boolean }) {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // Remembering is a convenience; a blocked localStorage must not stop a merge.
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

/* Direction A: one Undo chip, one slot - file removal and page actions
   (skip, rotate, move) all register through the same `registerUndo`, so a
   second action's undo silently replaces the first's rather than stacking. */
const UNDO_WINDOW_MS = 5000;

interface UndoAction {
  message: string;
  perform: () => void;
}

function hasFilePayload(event: DragEvent) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

/* MERGE-17: the one quiet line after the first result in this browser. The
   flag is set the moment the line is shown, so it never returns. */
const FIRST_RESULT_KEY = 'pdf-toolkit:merge:first-result-seen';

function firstResultSeen(): boolean {
  try {
    return localStorage.getItem(FIRST_RESULT_KEY) === '1';
  } catch {
    return true;
  }
}

function markFirstResultSeen() {
  try {
    localStorage.setItem(FIRST_RESULT_KEY, '1');
  } catch {
    // A blocked localStorage just means the line shows again next time.
  }
}

/* MERGE-14: Compress and Sign only. Split was in the first cut and came out
   on Shlomi's read: after page-level reorder and skip in the grid, splitting
   the result is not the next step anyone takes. */
type HandoffTool = 'compress' | 'sign';

/* MERGE-13: the same synchronous hint ToolPageLayout.astro's pre-paint script
   and useDraftPersistence read, so the empty state can be held back on the
   first render, before the draft module (a dynamic import) has even loaded. */
function hasMergeDraftHint(): boolean {
  try {
    return localStorage.getItem('pdf-toolkit:workspace:has-draft:merge') === '1';
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<unknown>;
}

interface PdfMergeToolProps {
  /** LOC-02: server-rendered by src/pages/[locale]/[tool].astro for a
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
  /** Tests only: shortens the idle wait before a pre-merge (MERGE-12). */
  prepareDelayMs?: number;
  /** Tests only: jsdom cannot navigate. */
  navigate?: (href: string) => void;
}

const DEFAULT_HANDOFF_HREFS: Record<HandoffTool, string> = { compress: '/compress/', sign: '/sign/' };

/** BasePdfTool's file input, replace confirmation and clear confirmation are
 * all reached through ToolShellContext, which only reaches components
 * actually rendered inside <BasePdfTool>'s children - not PdfMergeTool's own
 * function body, which is BasePdfTool's parent. This tiny bridge is that one
 * descendant, so "Choose files" (add bar, Download's one-file state, the
 * rail's "Add files") and "Start fresh" / "Clear all" (the rail) all go
 * through the exact same picker and confirmation every other tool uses. */
function ToolShellBridge({ children }: {
  children: (shell: { requestReplace: () => void; requestClear: () => void }) => ComponentChildren;
}) {
  const { requestReplace, requestClear } = useToolShell();
  return <>{children({ requestReplace, requestClear })}</>;
}

export default function PdfMergeTool({
  messages: messagesProp,
  shellMessages,
  unlockHref = '/unlock/',
  handoffHrefs,
  prepareDelayMs,
  navigate = (href) => { window.location.href = href; },
}: PdfMergeToolProps = {}) {
  const hrefs: Record<HandoffTool, string> = { ...DEFAULT_HANDOFF_HREFS, ...handoffHrefs };
  const t: MergeMessages = { ...englishMergeMessages, ...messagesProp };
  const sm: ShellMessages = { ...englishShellMessages, ...shellMessages };
  const [model, setModel] = useState<Model>({ entries: [], plan: [] });
  const { entries, plan } = model;
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<File[]>([]);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [addPageNumbers, setAddPageNumbers] = useState(() => readRememberedOptions().addPageNumbers);
  /* Direction A wave 4 (Shlomi, phone bottom-sheet measurement): one Options
   * disclosure, one open/closed state. Desktop still opens it by clicking
   * its own <summary>; the phone sheet's hand-off row gets a fourth
   * `flex:1` button (CSS-hidden at 768px and up) that flips the same state,
   * so there is exactly one options-body in the DOM for both. */
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('added');
  const [renderedCount, setRenderedCount] = useState(0);
  /* Direction A wave 2 (Shlomi): the restored-draft sentence shows once, for
   * five seconds, then gives way for good to the small "Draft saved" chip
   * that lives beside Add files / Clear all for the rest of the session. */
  const [showPickedUpSentence, setShowPickedUpSentence] = useState(false);
  const pickedUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* The shortcuts line shows once, for about six seconds, on the first
   * keyboard (not pointer) focus of a page cell, then never again this
   * mount; the undo chip takes the same header slot and wins if both are
   * pending at once. */
  const [showShortcutsHint, setShowShortcutsHint] = useState(false);
  const shortcutsShownRef = useRef(false);
  const shortcutsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* MERGE-12 analytics: the person's intent is the Download tap, which is
     what Merge used to mean; pre-merges are not counted. See ANALYTICS.md. */
  const [tap, setTap] = useState<'idle' | 'merging' | 'done'>('idle');
  const [pendingDownload, setPendingDownload] = useState(false);
  const [downloadedOnce, setDownloadedOnce] = useState(false);
  const { shareReady, prepare, clearPrepared, sharePrepared, download } = usePdfShare();
  const listRef = useRef<HTMLUListElement | null>(null);
  /* Phone chip row (Shlomi's reduction, wave 2): a second, independent
   * SortableJS list over the same `entries`, since the desktop rail's list
   * and the chip row are two different DOM lists shown one at a time via
   * CSS, not one list re-skinned. */
  const chipListRef = useRef<HTMLUListElement | null>(null);
  const chipSortableRef = useRef<Sortable | null>(null);
  const stripRef = useRef<HTMLUListElement | null>(null);
  const documentRef = useRef<HTMLDivElement | null>(null);
  const sortableRef = useRef<Sortable | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insertIndexRef = useRef(-1);
  /* MERGE-10: a file dropped onto the grid lands at that page position. The
     plan index is recorded per new entry and consumed when its page count
     arrives, because the pages cannot be placed before the count is known. */
  const stripInsertIndexRef = useRef(-1);
  const pendingPlanIndexRef = useRef(new Map<number, number>());
  /* MERGE-08: the grid, the preview dialog and (MERGE-13) the draft hook all
     arrive through dynamic import(), so the eager graph check-page-weight.js
     measures for /merge/ does not grow with them. */
  const [PageStrip, setPageStrip] = useState<ComponentType<PageStripProps> | null>(null);
  const [editingPages, setEditingPages] = useState(false);
  /* MERGE-13: crash-safe draft. The hook lives in MergeDraftPersistence,
     loaded through a dynamic import() on mount; until it reports, the hint
     alone decides whether the empty state is held back. */
  const [DraftPersistence, setDraftPersistence] = useState<ComponentType<MergeDraftPersistenceProps> | null>(null);
  const [draftState, setDraftState] = useState<{ isRestoring: boolean; draftSaveState: MergeDraftSaveState }>(
    () => ({ isRestoring: hasMergeDraftHint(), draftSaveState: 'idle' }),
  );
  const clearDraftRef = useRef<(() => Promise<boolean>) | null>(null);
  const draftOptions = useMemo(() => ({ addPageNumbers }), [addPageNumbers]);
  /* MERGE-14: hand the result to Compress or Sign without re-picking. */
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffFailed, setHandoffFailed] = useState(false);
  const [handoffConfirm, setHandoffConfirm] = useState<{ tool: HandoffTool; draftName: string } | null>(null);
  /* MERGE-17 */
  const [showInstallLine, setShowInstallLine] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [onIos, setOnIos] = useState(false);

  const grouped = useMemo(() => isGrouped(plan), [plan]);
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
  const title = entries.length > 0 ? mergedTitle(entries[0].file.name, entries.length - 1, t.outputName) : '';
  const fileName = entries.length > 0 ? mergedFileName(entries[0].file.name, entries.length - 1, t.outputName) : 'merged.pdf';

  const prepared = usePreparedMerge({
    files: readyFiles,
    plan,
    fileIds,
    addPageNumbers,
    title,
    debounceMs: prepareDelayMs,
  });

  // Once the plan is ready, any subsequent edit takes the Download element
  // back through preparing -> ready, without replaying its first-ready
  // animation (DownloadElement tracks that itself in a ref); this only has
  // to stop pretending a stale "saved" still applies to the new blob.
  useEffect(() => {
    if (prepared.status !== 'ready') setDownloadedOnce(false);
  }, [prepared.status]);

  const registerUndo = useCallback((message: string, perform: () => void) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction({ message, perform });
    undoTimerRef.current = setTimeout(() => setUndoAction(null), UNDO_WINDOW_MS);
  }, []);

  const clearUndo = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setUndoAction(null);
  }, []);

  const runUndo = useCallback(() => {
    const action = undoAction;
    if (!action) return;
    clearUndo();
    action.perform();
  }, [undoAction, clearUndo]);

  // Drag-to-reorder in the rail: SortableJS owns the DOM order during a drag;
  // on drop we read its final order back into Preact state, which becomes
  // the source of truth again for every subsequent render. Reordering a file
  // regroups the plan around the new file order (MERGE-09).
  const applyFileReorder = useCallback((oldIndex: number, newIndex: number) => {
    if (oldIndex === newIndex) return;
    setModel((current) => {
      const next = [...current.entries];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      return { entries: next, plan: regroupPlan(current.plan, next.map((e) => e.id)) };
    });
    setSortMode('added');
  }, []);

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
    return () => sortableRef.current?.destroy();
  }, [entries.length > 0, applyFileReorder]);

  // The phone chip row: the same whole-file reorder, but a press-and-hold
  // (delay, touch only) instead of a drag handle, since a chip has no grip
  // of its own - the whole chip is the handle. Review P2, item 2: the
  // "more" menu and the draft chip now live outside this list entirely (in
  // `.chip-pinned`, a sibling of this `<ul>`), so there is nothing left to
  // filter out.
  useEffect(() => {
    if (!chipListRef.current) return undefined;
    chipSortableRef.current?.destroy();
    chipSortableRef.current = Sortable.create(chipListRef.current, {
      animation: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      draggable: `.${docStyles.chip}`,
      delay: 150,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      onEnd(evt: Sortable.SortableEvent) {
        if (evt.oldIndex == null || evt.newIndex == null) return;
        applyFileReorder(evt.oldIndex, evt.newIndex);
      },
    });
    return () => chipSortableRef.current?.destroy();
  }, [entries.length > 0, applyFileReorder]);

  // ToolPageLayout's pre-paint script sets `html[data-draft-hint]` when a
  // draft exists, and Dropzone.module.css hides the empty-state dropzone under
  // it until hydration commits its real state. Sign never shows an empty state
  // after a restore (Replace loads another file), so its hook only clears the
  // attribute when nothing was restored; Merge does show one again, after
  // Clear all or Start again, so the attribute goes as soon as the check has
  // settled either way. Without this the card came back blank after Clear all.
  useEffect(() => {
    if (!draftState.isRestoring) document.documentElement.removeAttribute('data-draft-hint');
  }, [draftState.isRestoring]);

  useEffect(() => {
    let cancelled = false;
    import('./MergeTool/MergeDraftPersistence.tsx')
      .then((module) => { if (!cancelled) setDraftPersistence(() => module.default); })
      .catch(() => { if (!cancelled) setDraftState((current) => ({ ...current, isRestoring: false })); });
    return () => { cancelled = true; };
  }, []);

  // A restored draft: fresh entries for the stored files (the index doubles as
  // the id, which is what the stored plan's fileId already is), then the same
  // inspection a fresh pick gets, for thumbnails and to re-check each file.
  const onDraftRestore = useCallback((restored: MergeDraftRestore) => {
    const restoredEntries = restored.files.map((file) => toEntry(file));
    const idByIndex = restoredEntries.map((e) => e.id);
    const plan = restored.plan.map((p) => ({ ...p, fileId: idByIndex[p.fileId], key: `${idByIndex[p.fileId]}:${p.pageIndex}` }));
    setModel({ entries: restoredEntries, plan });
    setAddPageNumbers(restored.options.addPageNumbers);
    setShowPickedUpSentence(true);
    if (pickedUpTimerRef.current) clearTimeout(pickedUpTimerRef.current);
    pickedUpTimerRef.current = setTimeout(() => setShowPickedUpSentence(false), 5000);
    for (const entry of restoredEntries) inspectEntry(entry);
  }, []);

  useEffect(() => {
    if (entries.length === 0 || PageStrip) return;
    let cancelled = false;
    import('./MergeTool/PageStrip.tsx')
      .then((module) => { if (!cancelled) setPageStrip(() => module.default); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [entries.length > 0, PageStrip]);

  // Once pages have been rearranged across files the rail list can no longer
  // be dragged as whole files; SortableJS is told so rather than the handles
  // being hidden, so the rows keep their shape (aria-disabled instead).
  useEffect(() => {
    sortableRef.current?.option('disabled', !grouped);
    chipSortableRef.current?.option('disabled', !grouped);
  }, [grouped, entries.length > 0]);

  const inspectEntry = useCallback((entry: FileEntry) => {
    inspectPdf(entry.file)
      .then(({ pageCount, encrypted, creationDate }) => {
        setModel((current) => {
          if (!current.entries.some((e) => e.id === entry.id)) return current;
          const nextEntries = current.entries.map((e) =>
            e.id === entry.id
              ? { ...e, pageCount, pdfCreationDate: creationDate ?? null, error: encrypted ? ('encrypted' as const) : null }
              : e,
          );
          if (encrypted || current.plan.some((p) => p.fileId === entry.id)) return { entries: nextEntries, plan: current.plan };
          const recorded = pendingPlanIndexRef.current.get(entry.id);
          pendingPlanIndexRef.current.delete(entry.id);
          const at = recorded == null ? planInsertionIndex(current.plan, nextEntries, entry.id) : Math.min(recorded, current.plan.length);
          if (recorded != null) {
            // Files dropped together share one recorded index; the ones still
            // waiting for a count move past the pages just placed.
            for (const [id, index] of pendingPlanIndexRef.current) {
              if (index >= at) pendingPlanIndexRef.current.set(id, index + pageCount);
            }
          }
          return { entries: nextEntries, plan: insertPages(current.plan, planForFile(entry.id, pageCount), at) };
        });
      })
      .catch(() => {
        setModel((current) => ({
          ...current,
          entries: current.entries.map((e) => (e.id === entry.id ? { ...e, error: 'unreadable' as const } : e)),
        }));
      });
    // Thumbnails are nice-to-have, not blocking: render as they resolve
    // instead of waiting before the file appears.
    renderThumbnail(entry.file)
      .then((thumbnail) => {
        setModel((current) => ({
          ...current,
          entries: current.entries.map((e) => (e.id === entry.id ? { ...e, thumbnail } : e)),
        }));
      })
      .catch(() => {});
  }, []);

  const insertEntries = useCallback((newEntries: FileEntry[], atIndex: number) => {
    setModel((current) => {
      const next = [...current.entries];
      const index = atIndex < 0 || atIndex > next.length ? next.length : atIndex;
      next.splice(index, 0, ...newEntries);
      return { entries: next, plan: current.plan };
    });
    for (const entry of newEntries) inspectEntry(entry);
  }, [inspectEntry]);

  const addFiles = useCallback((fileList: FileList | File[], options: { force?: boolean } = {}) => {
    const incoming = Array.from(fileList);
    // MERGE-02: classify through deriveFileKind, which falls back to the
    // extension when a drag source or picker hands over a File with an
    // empty `type` - the exact case Compress already accepts.
    const pdfFiles = incoming.filter((f) => deriveFileKind(f) === 'pdf');
    const rejected = incoming.filter((f) => deriveFileKind(f) !== 'pdf');
    setRejectedFiles(rejected.length > 0 ? rejected.map((f) => f.name) : []);

    // MERGE-07: a file with the same name and size as one already in the
    // list is almost always the same file picked twice; nudge, do not refuse.
    let accepted = pdfFiles;
    if (!options.force) {
      const dupes = pdfFiles.filter((f) => entries.some((e) => e.file.name === f.name && e.file.size === f.size));
      setDuplicates(dupes);
      accepted = pdfFiles.filter((f) => !dupes.includes(f));
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
    setAnnouncement(
      newEntries.length === 1 ? t.filesAddedOne : formatMessage(t.filesAddedMany, { count: newEntries.length }),
    );
  }, [entries, plan, insertEntries, t.filesAddedOne, t.filesAddedMany]);

  const removeEntry = useCallback((id: number) => {
    setModel((current) => {
      const index = current.entries.findIndex((e) => e.id === id);
      if (index === -1) return current;
      const entry = current.entries[index];
      const planEntries = current.plan
        .map((p, i) => ({ entry: p, index: i }))
        .filter(({ entry: p }) => p.fileId === id);
      // Undo puts the file and its pages back where they were (MERGE-07). The
      // plan entries return to their old indices, so a page order that has
      // been rearranged across files survives a remove-and-undo.
      registerUndo(formatMessage(t.removedUndo, { name: entry.file.name }), () => {
        setModel((cur) => {
          const nextEntries = [...cur.entries];
          nextEntries.splice(Math.min(index, nextEntries.length), 0, entry);
          const nextPlan = [...cur.plan];
          for (const { entry: p, index: i } of planEntries) nextPlan.splice(Math.min(i, nextPlan.length), 0, p);
          return { entries: nextEntries, plan: nextPlan };
        });
        if (entry.pageCount == null) inspectEntry(entry);
        setAnnouncement(formatMessage(t.filesAddedOne, {}));
      });
      setAnnouncement(formatMessage(t.fileRemoved, { name: entry.file.name }));
      return { entries: current.entries.filter((e) => e.id !== id), plan: removeFile(current.plan, id) };
    });
  }, [t.fileRemoved, t.removedUndo, t.filesAddedOne, registerUndo, inspectEntry]);

  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
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
    setModel({ entries: [], plan: [] });
    clearPrepared();
    setRejectedFiles([]);
    setDuplicates([]);
    clearUndo();
    setTap('idle');
    setPendingDownload(false);
    setDownloadedOnce(false);
    setSortMode('added');
    setEditingPages(false);
    setRenderedCount(0);
    setShowPickedUpSentence(false);
    if (pickedUpTimerRef.current) clearTimeout(pickedUpTimerRef.current);
    setShowShortcutsHint(false);
    shortcutsShownRef.current = false;
    if (shortcutsTimerRef.current) clearTimeout(shortcutsTimerRef.current);
    pendingPlanIndexRef.current.clear();
    void clearDraftRef.current?.();
    setAnnouncement(t.cleared);
  }, [clearPrepared, clearUndo, t.cleared]);

  const reorderEntries = useCallback((next: FileEntry[], message: string) => {
    setModel((current) => ({ entries: next, plan: regroupPlan(current.plan, next.map((e) => e.id)) }));
    setAnnouncement(message);
  }, []);

  const moveFileEntry = useCallback((id: number, delta: number) => {
    setModel((current) => {
      const index = current.entries.findIndex((e) => e.id === id);
      const newIndex = index + delta;
      if (index === -1 || newIndex < 0 || newIndex >= current.entries.length) return current;
      const next = [...current.entries];
      const [moved] = next.splice(index, 1);
      next.splice(newIndex, 0, moved);
      setAnnouncement(formatMessage(t.fileMovedTo, { name: moved.file.name, position: newIndex + 1, total: next.length }));
      return { entries: next, plan: regroupPlan(current.plan, next.map((e) => e.id)) };
    });
    setSortMode('added');
  }, [t.fileMovedTo]);

  const onRowKeyDown = useCallback(
    (event: KeyboardEvent, id: number) => {
      if (!grouped) return;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveFileEntry(id, -1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveFileEntry(id, 1);
      }
    },
    [moveFileEntry, grouped],
  );

  const onSortChange = useCallback((event: Event) => {
    const mode = (event.currentTarget as HTMLSelectElement).value as SortMode;
    setSortMode(mode);
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
    reorderEntries(sorted, t.filesReordered);
  }, [entries, reorderEntries, t.filesReordered]);

  const resetPageOrder = useCallback(() => {
    setModel((current) => ({ entries: current.entries, plan: regroupPlan(current.plan, current.entries.map((e) => e.id)) }));
    setAnnouncement(t.filesReordered);
  }, [t.filesReordered]);

  const onPlanChange = useCallback((update: (current: PlanEntry[]) => PlanEntry[]) => {
    setModel((current) => ({ entries: current.entries, plan: update(current.plan) }));
  }, []);

  const onPageNumbersChange = useCallback((event: Event) => {
    const next = (event.target as HTMLInputElement).checked;
    setAddPageNumbers(next);
    rememberOptions({ addPageNumbers: next });
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
      if (!hasFilePayload(event)) return;
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

  // A fresh blob is what Share hands out; an invalidated one is cleared so
  // the sheet never offers a stale order.
  useEffect(() => {
    if (prepared.status === 'ready' && prepared.blob) prepare(prepared.blob, fileName);
    else clearPrepared();
  }, [prepared.status, prepared.generation, fileName]);

  // The tap arrived while the pre-merge was still running: deliver the blob
  // the moment it exists, through the same download path Share uses.
  useEffect(() => {
    if (!pendingDownload || prepared.status !== 'ready' || !prepared.blob) return;
    setPendingDownload(false);
    download(prepared.blob, fileName);
    setTap('done');
    setDownloadedOnce(true);
    setAnnouncement(t.mergedReady);
  }, [pendingDownload, prepared.status, prepared.generation]);

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
    prompt?.prompt().catch(() => {});
  }, [installPrompt]);

  // MERGE-14: park the merged bytes for the target tool and navigate. The
  // merge draft stays (MERGE-13), so Back returns to the same set. Sign keeps
  // a draft of its own; if one exists, ask first, as the home page does.
  const performHandoff = useCallback(async (tool: HandoffTool, discardDraft: boolean) => {
    if (!prepared.blob) return;
    setHandoffBusy(true);
    setHandoffFailed(false);
    try {
      // The store is only needed once a result is being handed off, so it
      // stays out of the eager graph like the grid and the draft hook.
      const { saveHandoff, deleteDraft } = await import('../editor/workspace/draftStore.js');
      const saved = await saveHandoff(tool, {
        fileName,
        fileType: 'application/pdf',
        fileBytes: await prepared.blob.arrayBuffer(),
      });
      if (!saved) throw new Error('handoff');
      if (discardDraft && !(await deleteDraft(tool))) throw new Error('draft');
      navigate(hrefs[tool]);
    } catch {
      setHandoffFailed(true);
      setHandoffBusy(false);
    }
  }, [prepared.blob, fileName, hrefs.compress, hrefs.sign]);

  const requestHandoff = useCallback(async (tool: HandoffTool) => {
    if (handoffBusy || !prepared.blob) return;
    if (tool === 'sign') {
      const { loadDraft } = await import('../editor/workspace/draftStore.js');
      const draft = (await loadDraft('sign')) as { fileName?: string } | null;
      if (draft) {
        setHandoffConfirm({ tool, draftName: draft.fileName || '' });
        return;
      }
    }
    await performHandoff(tool, false);
  }, [handoffBusy, prepared.blob, performHandoff]);

  const onDownloadTap = useCallback(() => {
    setTap('merging');
    setDownloadedOnce(true);
    setAnnouncement(t.mergedReady);
  }, [t.mergedReady]);

  const onPreparingTap = useCallback(() => {
    setTap('merging');
    setPendingDownload(true);
  }, []);

  // A tap on a ready Download: 'merging' renders once so BasePdfTool reports
  // tool_operation_started, then 'done' reports tool_result_ready.
  useEffect(() => {
    if (tap === 'merging' && !pendingDownload && prepared.status === 'ready') setTap('done');
  }, [tap, pendingDownload, prepared.status]);

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') setAnnouncement(t.sharedSuccessfully);
    else if (result.status === 'canceled') setAnnouncement(t.sharingCanceled);
    else if (result.status === 'error') setAnnouncement(t.shareError);
  };

  // MERGE-04: which file failed, and why. Inspection catches most cases
  // before a merge is attempted; mergePdfs's MergeFileError is the second line.
  const failedEntry = entries.find((e) => e.error)
    ?? (prepared.error instanceof MergeFileError ? entries[prepared.error.fileIndex] ?? null : null);
  const failedReason: 'encrypted' | 'unreadable' | null = failedEntry
    ? (failedEntry.error ?? (prepared.error instanceof MergeFileError ? prepared.error.reason : 'unreadable'))
    : null;
  const otherError = !failedEntry && prepared.status === 'error';

  const hasFiles = entries.length > 0;
  // A reload with files loaded (the draft brings them back) would put the
  // page back at its old offset, measured against a layout the restore then
  // grows by a whole document; the browser keeps retrying that offset as the
  // page grows. Measured at 375px it landed below the grid, where nothing was
  // near enough to render, and the merge looked like it had no thumbnails.
  // The mode travels with the history entry, so it is set while files are on
  // the page, ahead of any reload, not on the reloaded page (too late there
  // for the first reload; verified on Chromium).
  useEffect(() => {
    if (typeof history === 'undefined' || !('scrollRestoration' in history)) return;
    history.scrollRestoration = hasFiles ? 'manual' : 'auto';
  }, [hasFiles]);

  const pagesLabel = (count: number) => (count === 1 ? sm.pageCountOne : formatMessage(sm.pageCountOther, { count }));
  const rearranged = hasFiles && (!grouped || !listOrdered);
  const showSortControls = entries.length >= 2 && !rearranged;

  const downloadState: DownloadElementState = entries.length < 2
    ? 'one-file'
    : (failedEntry || otherError)
      ? 'error'
      : prepared.status === 'ready'
        ? (downloadedOnce ? 'saved' : 'ready')
        : 'preparing';
  const downloadDetail = prepared.status === 'ready' ? `${pagesLabel(prepared.pageCount)} · ${formatFileSize(prepared.size)}` : undefined;
  const analyticsStatus = failedEntry || otherError ? 'error' : tap;

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
  // Only one thing lives in the header's right-hand slot at a time: the
  // undo chip wins over the restore sentence (its phone placement - review
  // P2, item 3), which in turn wins over the once-only shortcuts hint.
  const pickedUpHintVisible = !undoAction && showPickedUpSentence;
  const shortcutsHintVisible = !undoAction && !pickedUpHintVisible && showShortcutsHint;

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      analyticsTool="merge"
      analyticsStatus={analyticsStatus}
      onFilesAdded={addFiles}
      onClearAll={reset}
      clearSummary={entries.length === 1 ? t.fileSummaryOne : formatMessage(t.fileSummaryMany, { count: entries.length })}
      // Direction A wave 2 (Shlomi): with the add bar gone, dropping
      // anywhere on the page is the only invitation left, so the
      // drag-over overlay says so - a Merge-only override of the shared
      // shell copy, not a change to what Split/ImageToPdf/ToImage show.
      shellMessages={{ ...shellMessages, dropToAddMore: t.dropAnywhereNote }}
      emptyVariant="band"
      emptyBandHeading={t.emptyHeading}
      emptyBandBody={t.emptyBody}
      checkingDraft={!hasFiles && draftState.isRestoring}
      hideIdentity
    >
      {DraftPersistence && (
        <DraftPersistence
          entries={entries}
          plan={plan}
          options={draftOptions}
          title={title}
          onRestore={onDraftRestore}
          onStateChange={setDraftState}
          registerClear={(clear) => { clearDraftRef.current = clear; }}
        />
      )}

      {rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {rejectedFiles.length === 1
            ? formatMessage(t.skippedOne, { name: rejectedFiles[0] })
            : formatMessage(t.skippedMany, { count: rejectedFiles.length })}
        </p>
      )}

      {duplicates.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          <span>{duplicates.map((f) => formatMessage(t.alreadyAdded, { name: f.name })).join(' ')}</span>{' '}
          <button type="button" class={pdfToolStyles['quiet-link']} onClick={() => addFiles(duplicates, { force: true })}>
            {t.addAnyway}
          </button>
        </p>
      )}

      {hasFiles && (
        <ToolShellBridge>
          {({ requestReplace, requestClear }) => (
            <div class={docStyles.layout}>
          <p class="sr-only" id="reorder-hint">{t.reorderHint}</p>

          {/* Phone chip row (Shlomi's reduction, wave 2): replaces the add
              bar and stands in for the rail's file list, Sort/Clear all/Add
              files below 768px (CSS-hidden at 1024px and up alongside the
              rail's own chip-row twin visibility rule). Review P2, item 2:
              the "⋯" menu (and the draft chip beside it) are pinned OUTSIDE
              the scrolling list, at the row's end, so they are always
              reachable - only the file chips themselves scroll, under a
              right-edge fade that says so. */}
          <div class={docStyles['chip-bar']}>
            <ul class={docStyles['chip-row']} ref={chipListRef}>
              {entries.map((entry, index) => (
                <li
                  key={entry.id}
                  class={docStyles.chip}
                  data-id={entry.id}
                  onClick={() => scrollToCaption(entry.id)}
                >
                  <span class={docStyles['chip-pill']}>
                    <span class={docStyles['chip-tag']} style={{ '--tag-color': `var(--color-tag-${(index % 6) + 1})` } as any} aria-hidden="true" />
                    <FileName name={entry.file.name} className={docStyles['chip-name']} extension={false} />
                    <span class={docStyles['chip-pages']}>{entry.pageCount ?? '…'}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div class={docStyles['chip-pinned']}>
              <div class={docStyles.chip} data-more>
                <details class={docStyles['chip-menu']}>
                  <summary class={docStyles['chip-menu-summary']} aria-label={t.moreOptions}>⋯</summary>
                  <div class={docStyles['chip-menu-body']}>
                    {showSortControls && (
                      <select class={railStyles['sort-select']} aria-label={t.sortLabel} value={sortMode} onChange={onSortChange}>
                        <option value="added">{t.sortAsAdded}</option>
                        <option value="reversed">{t.sortReversed}</option>
                        <option value="nameAsc">{t.sortNameAsc}</option>
                        <option value="nameDesc">{t.sortNameDesc}</option>
                        <option value="dateAsc">{t.sortDateAsc}</option>
                        <option value="dateDesc">{t.sortDateDesc}</option>
                      </select>
                    )}
                    <button type="button" class={railStyles['quiet-button']} onClick={requestReplace}>{sm.addLabel}</button>
                    <button type="button" class={railStyles['quiet-button']} onClick={requestClear}>{sm.clearLabel}</button>
                  </div>
                </details>
              </div>
              {/* No draft chip here (2026-09-13): a phone's restore sentence
                  is the header's `.header-draft-chip` below, and "Draft
                  saved" stays a desktop-rail affordance. Measured with both:
                  the pinned block grew to 301px of 317 and the file chips
                  were left 6px wide. */}
            </div>
          </div>

          <div class={docStyles.main}>
            <div class={docStyles.document} ref={documentRef}>
              <div class={docStyles['doc-header']}>
                <div class={docStyles['heading-row']}>
                  <h2 class={docStyles['doc-heading']} id="merge-pages-heading">
                    {t.documentHeading}
                    <span class={docStyles['doc-heading-count']}>
                      {' · '}{pagesLabel(outputCount)}
                      {skippedCount > 0 ? ` · ${pagesLabel(skippedCount)} ${t.skippedBadge.toLowerCase()}` : ''}
                    </span>
                    {stillRendering && (
                      <span class={docStyles['doc-heading-progress']}>
                        {' · '}{formatMessage(t.renderedCount, { count: renderedCount })}
                      </span>
                    )}
                  </h2>
                  {/* Touch only (CSS-hidden for hover+fine-pointer devices),
                      same row as the heading on a phone rather than a line
                      of its own (wave 3). Drives PageStrip's own
                      `data-editing` through the same `editingPages` state. */}
                  <button
                    type="button"
                    class={docStyles['edit-toggle']}
                    aria-pressed={editingPages}
                    onClick={() => setEditingPages((current) => !current)}
                  >
                    {editingPages ? t.doneEditing : t.editPages}
                  </button>
                </div>
                <div class={docStyles['doc-header-right']}>
                  {undoAction ? (
                    <span class={docStyles['undo-chip']} role="status">
                      {undoAction.message}
                      <button type="button" onClick={runUndo}>{t.undo}</button>
                    </span>
                  ) : pickedUpHintVisible ? (
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
                  ) : null}
                </div>
              </div>

              {failedEntry && failedReason && (
                <ErrorMessage>
                  {formatMessage(failedReason === 'encrypted' ? t.errorEncrypted : t.errorUnreadable, { name: failedEntry.file.name })}
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

              {otherError && <ErrorMessage>{t.errorTooLarge}</ErrorMessage>}

              {PageStrip && plan.length > 0 && (
                <PageStrip
                  entries={entries}
                  plan={plan}
                  onPlanChange={onPlanChange}
                  announce={setAnnouncement}
                  messages={t}
                  grouped={grouped}
                  editing={editingPages}
                  stripRef={stripRef}
                  onRenderedCountChange={setRenderedCount}
                  onRegisterUndo={registerUndo}
                  onFirstKeyboardFocus={onFirstKeyboardFocus}
                />
              )}
            </div>

            <div class={railStyles.rail}>
              <div class={railStyles['rail-scroll']}>
                <ul class={railStyles['file-list']} ref={listRef} aria-describedby="reorder-hint">
                  {entries.map((entry, index) => (
                    <li
                      key={entry.id}
                      class={railStyles['file-row']}
                      data-id={entry.id}
                      data-error={entry.error || undefined}
                      onClick={() => scrollToCaption(entry.id)}
                    >
                      <span
                        class={railStyles.grip}
                        aria-disabled={!grouped || undefined}
                        tabIndex={grouped ? 0 : -1}
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
                      <span class={railStyles['tag-square']} style={{ '--tag-color': `var(--color-tag-${(index % 6) + 1})` } as any} aria-hidden="true" />
                      <FileName name={entry.file.name} className={railStyles['file-name']} />
                      <span class={railStyles['file-pages']}>{entry.pageCount ?? '…'}</span>
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
                    <select class={railStyles['sort-select']} aria-label={t.sortLabel} value={sortMode} onChange={onSortChange}>
                      <option value="added">{t.sortAsAdded}</option>
                      <option value="reversed">{t.sortReversed}</option>
                      <option value="nameAsc">{t.sortNameAsc}</option>
                      <option value="nameDesc">{t.sortNameDesc}</option>
                      <option value="dateAsc">{t.sortDateAsc}</option>
                      <option value="dateDesc">{t.sortDateDesc}</option>
                    </select>
                  </div>
                )}

                <div class={railStyles['quiet-row']}>
                  {/* Shlomi (2026-09-13): the two actions are bordered
                      buttons now, so the "·" that used to separate them as
                      text links is gone; the row's gap does the separating. */}
                  <button type="button" class={railStyles['quiet-button']} onClick={requestReplace}>{sm.addLabel}</button>
                  <button type="button" class={railStyles['quiet-button']} onClick={requestClear}>{sm.clearLabel}</button>
                  {(showPickedUpSentence || draftStatusLabel) && (
                    <span class={railStyles['draft-chip']}>
                      {showPickedUpSentence ? (
                        <>
                          {t.pickedUp} <button type="button" class={railStyles['quiet-button']} onClick={requestClear}>{t.startFresh}</button>
                        </>
                      ) : draftStatusLabel}
                    </span>
                  )}
                </div>
              </div>

              <div class={railStyles['rail-pinned']}>
                {/* Direction A follow-up (review P1): Options and the
                    hand-off row only make sense once a merge is possible -
                    with one file the Download element's own text-plus-
                    button state is the whole story, so both are held back
                    until there are two files. */}
                {entries.length >= 2 && (
                  /* One <details>, one options-body, for both breakpoints
                      (wave 4). Desktop opens it from its own <summary>; on
                      a phone the summary is hidden (the hand-off row's
                      Options button below is the control there instead) and
                      the whole element collapses to nothing while closed, so
                      it costs the sheet no height until opened. Controlled by
                      `optionsOpen` either way, so the two triggers can never
                      disagree about the state. */
                  <details
                    class={railStyles.options}
                    open={optionsOpen}
                    onToggle={(event) => setOptionsOpen((event.currentTarget as HTMLDetailsElement).open)}
                  >
                    <summary class={railStyles['options-summary']}>
                      {t.optionsSummary}
                      <svg class={railStyles['options-chevron']} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    </summary>
                    <div class={railStyles['options-body']}>
                      <label class={railStyles['page-numbers-row']}>
                        <input type="checkbox" checked={addPageNumbers} onChange={onPageNumbersChange} />
                        <span>{t.addPageNumbers}</span>
                      </label>
                      <p class={railStyles['saves-as']}>{formatMessage(t.savesAs, { name: fileName })}</p>
                    </div>
                  </details>
                )}

                <DownloadElement
                  state={downloadState}
                  href={prepared.status === 'ready' ? prepared.url : null}
                  fileName={fileName}
                  detail={downloadDetail}
                  renderedCount={renderedCount}
                  totalCount={renderTotal}
                  pagesToMerge={outputCount}
                  progress={prepared.progress}
                  errorMessage={failedEntry ? undefined : t.fixFileToMerge}
                  messages={t}
                  chooseFilesLabel={sm.chooseFilesMany}
                  onChooseFiles={requestReplace}
                  onPreparingTap={onPreparingTap}
                  onDownloadClick={onDownloadTap}
                />

                {entries.length >= 2 && (
                  <div class={railStyles['handoff-row']}>
                    {prepared.status === 'ready' && <PdfShareButton visible={shareReady} onShare={handleShare} label={t.shareLabel} className={railStyles['handoff-button']} />}
                    {(['compress', 'sign'] as HandoffTool[]).map((tool) => (
                      <button
                        key={tool}
                        type="button"
                        class={railStyles['handoff-button']}
                        disabled={handoffBusy || prepared.status !== 'ready'}
                        onClick={() => { void requestHandoff(tool); }}
                      >
                        {tool === 'compress' ? t.handoffCompress : t.handoffSign}
                      </button>
                    ))}
                    {/* Phone only (CSS-hidden at 768px and up, where the
                        details' own <summary> above is the control instead):
                        Options as the row's fourth equal button, per Shlomi's
                        sheet-height measurement. Toggles the same state the
                        <summary> does, so there is still exactly one
                        options-body in the DOM. */}
                    <button
                      type="button"
                      class={`${railStyles['handoff-button']} ${railStyles['options-toggle']}`}
                      aria-expanded={optionsOpen}
                      onClick={() => setOptionsOpen((current) => !current)}
                    >
                      {t.optionsSummary}
                    </button>
                  </div>
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
              </div>
            </div>
          </div>

          <ConfirmDialog
            open={!!handoffConfirm}
            titleId="merge-handoff-confirm"
            title={t.handoffConfirmTitle}
            confirmLabel={t.handoffConfirm}
            cancelLabel={sm.cancel}
            closeLabel={sm.closeDialog}
            onCancel={() => setHandoffConfirm(null)}
            onConfirm={() => {
              const target = handoffConfirm;
              setHandoffConfirm(null);
              if (target) void performHandoff(target.tool, true);
            }}
          >
            {formatMessage(t.handoffConfirmBody, { draft: handoffConfirm?.draftName ?? '' })}
          </ConfirmDialog>
            </div>
          )}
        </ToolShellBridge>
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
