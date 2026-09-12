import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import Sortable from 'sortablejs';
import { inspectPdf, MergeFileError } from '../lib/merge.js';
import {
  insertPages,
  isGrouped,
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
import { describeFile, formatFileSize } from '../lib/format.js';
import { usePdfShare } from '../lib/usePdfShare.js';
import { isIOSDevice } from '../lib/platform.ts';
import BasePdfTool from './BasePdfTool.tsx';
import ConfirmDialog from './ConfirmDialog.tsx';
import styles from './FileList.module.css';
import pdfToolStyles from './PdfTool.module.css';
import sortToolbarStyles from './SortToolbar.module.css';
import PdfShareButton from './PdfShareButton.tsx';
import ProgressRing from './ProgressRing.tsx';
import ErrorMessage from './ErrorMessage.tsx';
import DownloadButton from './DownloadButton.tsx';
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
   * file until a page crosses a file boundary in the strip. */
  plan: PlanEntry[];
}

type SortMode = 'added' | 'name' | 'date';

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

/* The five seconds "Removed X · Undo" stays on screen (MERGE-07). Long
   enough to read and act on, short enough that the row is not haunted by a
   status line for a file the person clearly meant to drop. */
const UNDO_WINDOW_MS = 5000;

interface RemovedFile {
  entry: FileEntry;
  index: number;
  planEntries: { entry: PlanEntry; index: number }[];
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
   on Shlomi's read: after page-level reorder and skip in the strip, splitting
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
  const [removed, setRemoved] = useState<RemovedFile | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [addPageNumbers, setAddPageNumbers] = useState(() => readRememberedOptions().addPageNumbers);
  const [sortMode, setSortMode] = useState<SortMode>('added');
  /* MERGE-12 analytics: the person's intent is the Download tap, which is
     what Merge used to mean; pre-merges are not counted. See ANALYTICS.md. */
  const [tap, setTap] = useState<'idle' | 'merging' | 'done'>('idle');
  const [pendingDownload, setPendingDownload] = useState(false);
  const [downloadedOnce, setDownloadedOnce] = useState(false);
  const { shareReady, prepare, clearPrepared, sharePrepared, download } = usePdfShare();
  const listRef = useRef<HTMLUListElement | null>(null);
  const stripRef = useRef<HTMLUListElement | null>(null);
  const sortableRef = useRef<Sortable | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insertIndexRef = useRef(-1);
  /* MERGE-10: a file dropped onto the strip lands at that page position. The
     plan index is recorded per new entry and consumed when its page count
     arrives, because the pages cannot be placed before the count is known. */
  const stripInsertIndexRef = useRef(-1);
  const pendingPlanIndexRef = useRef(new Map<number, number>());
  /* MERGE-08: the strip, the preview dialog and (MERGE-13) the draft hook all
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
  /* MERGE-14: hand the result to Compress, Sign or Split without re-picking. */
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

  // Drag-to-reorder: SortableJS owns the DOM order during a drag; on drop
  // we read its final order back into Preact state, which becomes the
  // source of truth again for every subsequent render. Reordering a file
  // regroups the plan around the new file order (MERGE-09).
  useEffect(() => {
    if (!listRef.current) return undefined;
    sortableRef.current?.destroy();
    sortableRef.current = Sortable.create(listRef.current, {
      animation: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      handle: `.${styles['drag-handle']}`,
      ghostClass: styles['is-ghost'],
      chosenClass: styles['is-chosen'],
      dragClass: styles['is-dragging'],
      forceFallback: false,
      onEnd(evt: Sortable.SortableEvent) {
        if (evt.oldIndex === evt.newIndex || evt.oldIndex == null || evt.newIndex == null) return;
        setModel((current) => {
          const next = [...current.entries];
          const [moved] = next.splice(evt.oldIndex as number, 1);
          next.splice(evt.newIndex as number, 0, moved);
          return { entries: next, plan: regroupPlan(current.plan, next.map((e) => e.id)) };
        });
        setSortMode('added');
      },
    });
    return () => sortableRef.current?.destroy();
  }, [entries.length > 0]);

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

  // Once pages have been rearranged across files the list can no longer be
  // dragged as whole files; SortableJS is told so rather than the handles
  // being hidden, so the rows keep their shape.
  useEffect(() => {
    sortableRef.current?.option('disabled', !grouped);
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
    // MERGE-10: dropped onto the strip, the pages go at that position. At a
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

  const clearUndo = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setRemoved(null);
  }, []);

  const removeEntry = useCallback((id: number) => {
    setModel((current) => {
      const index = current.entries.findIndex((e) => e.id === id);
      if (index === -1) return current;
      const entry = current.entries[index];
      const planEntries = current.plan
        .map((p, i) => ({ entry: p, index: i }))
        .filter(({ entry: p }) => p.fileId === id);
      setRemoved({ entry, index, planEntries });
      setAnnouncement(formatMessage(t.fileRemoved, { name: entry.file.name }));
      return { entries: current.entries.filter((e) => e.id !== id), plan: removeFile(current.plan, id) };
    });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setRemoved(null), UNDO_WINDOW_MS);
  }, [t.fileRemoved]);

  // Undo puts the file and its pages back where they were (MERGE-07). The
  // plan entries return to their old indices, so a page order that has been
  // rearranged across files survives a remove-and-undo.
  const undoRemove = useCallback(() => {
    if (!removed) return;
    const { entry, index, planEntries } = removed;
    clearUndo();
    setModel((current) => {
      const nextEntries = [...current.entries];
      nextEntries.splice(Math.min(index, nextEntries.length), 0, entry);
      const nextPlan = [...current.plan];
      for (const { entry: p, index: i } of planEntries) nextPlan.splice(Math.min(i, nextPlan.length), 0, p);
      return { entries: nextEntries, plan: nextPlan };
    });
    if (entry.pageCount == null) inspectEntry(entry);
    setAnnouncement(formatMessage(t.filesAddedOne, {}));
  }, [removed, clearUndo, inspectEntry, t.filesAddedOne]);

  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);

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
    pendingPlanIndexRef.current.clear();
    void clearDraftRef.current?.();
    setAnnouncement(t.cleared);
  }, [clearPrepared, clearUndo, t.cleared]);

  const reorderEntries = useCallback((next: FileEntry[], message: string) => {
    setModel((current) => ({ entries: next, plan: regroupPlan(current.plan, next.map((e) => e.id)) }));
    setAnnouncement(message);
  }, []);

  const moveEntry = useCallback((id: number, delta: number) => {
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

  const onItemKeyDown = useCallback(
    (event: KeyboardEvent, id: number) => {
      if (!grouped) return;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveEntry(id, -1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveEntry(id, 1);
      }
    },
    [moveEntry, grouped],
  );

  const onSortChange = useCallback((event: Event) => {
    const mode = (event.currentTarget as HTMLSelectElement).value as SortMode;
    setSortMode(mode);
    const sorted = mode === 'name'
      ? sortByName(entries, 'asc')
      : mode === 'date'
        ? sortByDate(entries, 'asc')
        : [...entries].sort((a, b) => a.id - b.id);
    reorderEntries(sorted, t.filesReordered);
  }, [entries, reorderEntries, t.filesReordered]);

  const reverseOrder = useCallback(() => {
    reorderEntries([...entries].reverse(), t.filesReordered);
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

  /* MERGE-07 and MERGE-10: insert where dropped. BasePdfTool's card catches
     the drop and calls addFiles; this listener only works out, during the
     native drag, which row of the list or which page of the strip the pointer
     is over, paints the insertion line straight onto the DOM (a gesture-time
     DOM write, not state), and leaves the index in a ref for addFiles to
     read once, on drop. */
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
      // stays out of the eager graph like the strip and the draft hook.
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

  // A tap on a ready Download: 'merging' renders once so BasePdfTool reports
  // tool_operation_started, then 'done' reports tool_result_ready.
  useEffect(() => {
    if (tap === 'merging' && !pendingDownload && prepared.status === 'ready') setTap('done');
  }, [tap, pendingDownload, prepared.status]);

  const onDownloadTap = useCallback(() => {
    setTap('merging');
    setDownloadedOnce(true);
    setAnnouncement(t.mergedReady);
  }, [t.mergedReady]);

  const onPreparingTap = useCallback(() => {
    setTap('merging');
    setPendingDownload(true);
  }, []);

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
  const totalPages = entries.every((e) => e.pageCount != null) ? entries.reduce((sum, e) => sum + (e.pageCount ?? 0), 0) : null;
  const pagesLabel = (count: number) => (count === 1 ? sm.pageCountOne : formatMessage(sm.pageCountOther, { count }));
  const totalSize = formatFileSize(entries.reduce((total, entry) => total + entry.file.size, 0));
  const fileSummary = entries.length === 1 ? t.fileSummaryOne : formatMessage(t.fileSummaryMany, { count: entries.length });
  const fileMeta = totalPages != null && entries.length > 0 ? `${pagesLabel(totalPages)} · ${totalSize}` : totalSize;
  const downloadDetail = prepared.status === 'ready' ? `${pagesLabel(prepared.pageCount)} · ${formatFileSize(prepared.size)}` : undefined;
  const analyticsStatus = failedEntry || otherError ? 'error' : tap;

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      analyticsTool="merge"
      analyticsStatus={analyticsStatus}
      onFilesAdded={addFiles}
      fileLabel={fileSummary}
      fileMeta={fileMeta}
      onClearAll={reset}
      clearSummary={fileSummary}
      shellMessages={shellMessages}
      checkingDraft={!hasFiles && draftState.isRestoring}
      draftSaveState={hasFiles ? draftState.draftSaveState : 'idle'}
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
          <span class={styles['status-row']}>
            <span>{duplicates.map((f) => formatMessage(t.alreadyAdded, { name: f.name })).join(' ')}</span>
            <button type="button" class={styles['status-action']} onClick={() => addFiles(duplicates, { force: true })}>
              {t.addAnyway}
            </button>
          </span>
        </p>
      )}

      {removed && (
        <p class={pdfToolStyles['hint-message']} role="status">
          <span class={styles['status-row']}>
            <span>{formatMessage(t.removedUndo, { name: removed.entry.file.name })}</span>
            <button type="button" class={styles['status-action']} onClick={undoRemove}>
              {t.undo}
            </button>
          </span>
        </p>
      )}

      {hasFiles && (
        <>
          {grouped ? (
            <div class={sortToolbarStyles.toolbar} role="toolbar" aria-label={t.sortLabel}>
              <label class={sortToolbarStyles['sort-label']} for="merge-sort">{t.sortLabel}</label>
              <select id="merge-sort" class={sortToolbarStyles['sort-select']} aria-label={t.sortLabel} value={sortMode} onChange={onSortChange}>
                <option value="added">{t.sortAsAdded}</option>
                <option value="name">{t.sortByName}</option>
                <option value="date">{t.sortByDate}</option>
              </select>
              <button type="button" class={sortToolbarStyles.button} onClick={reverseOrder}>
                {t.reverseOrder}
              </button>
            </div>
          ) : (
            <div class={sortToolbarStyles.toolbar} role="status">
              <span class={sortToolbarStyles.note}>{t.pagesRearranged}</span>
              <button type="button" class={sortToolbarStyles.button} onClick={resetPageOrder}>
                {t.resetOrder}
              </button>
            </div>
          )}

          <p class="sr-only" id="reorder-hint">
            {t.reorderHint}
          </p>

          <ul class={styles['file-list']} ref={listRef} aria-describedby="reorder-hint">
            {entries.map((entry, index) => (
              <li key={entry.id} class={styles['file-item']} data-id={entry.id} data-error={entry.error || undefined}>
                <span
                  class={styles['drag-handle']}
                  tabIndex={0}
                  role="button"
                  aria-label={formatMessage(t.dragHandleLabel, { name: entry.file.name, position: index + 1, total: entries.length })}
                  onKeyDown={(e) => onItemKeyDown(e, entry.id)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="5" cy="3" r="1.4" fill="currentColor" />
                    <circle cx="11" cy="3" r="1.4" fill="currentColor" />
                    <circle cx="5" cy="8" r="1.4" fill="currentColor" />
                    <circle cx="11" cy="8" r="1.4" fill="currentColor" />
                    <circle cx="5" cy="13" r="1.4" fill="currentColor" />
                    <circle cx="11" cy="13" r="1.4" fill="currentColor" />
                  </svg>
                </span>

                {entry.thumbnail ? (
                  <img class={`${styles.thumb} ${styles['is-page']} ${styles['is-loaded']}`} src={entry.thumbnail} alt="" width="44" height="58" />
                ) : (
                  <span class={`${styles.thumb} ${styles['is-page']} ${pdfToolStyles['thumb-placeholder']}`} aria-hidden="true" />
                )}

                <span class={styles['file-text']}>
                  <span class={styles['file-name']}>{entry.file.name}</span>
                  <span class={styles['file-meta']}>
                    {entry.error === 'encrypted'
                      ? t.rowEncrypted
                      : entry.error === 'unreadable'
                        ? t.rowUnreadable
                        : entry.pageCount == null
                          ? `${t.pageCountUnknown} · ${formatFileSize(entry.file.size)}`
                          : describeFile(entry.file, entry.pageCount, undefined, sm)}
                  </span>
                </span>

                <button
                  type="button"
                  class={styles['remove-button']}
                  aria-label={formatMessage(t.removeLabel, { name: entry.file.name })}
                  onClick={() => removeEntry(entry.id)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          {PageStrip && plan.length > 0 && (
            <PageStrip
              entries={entries}
              plan={plan}
              onPlanChange={onPlanChange}
              announce={setAnnouncement}
              messages={t}
              countLabel={pagesLabel(outputPageCount(plan))}
              editing={editingPages}
              onToggleEditing={() => setEditingPages((current) => !current)}
              stripRef={stripRef}
            />
          )}

          <details class={sortToolbarStyles.options}>
            <summary class={sortToolbarStyles['options-summary']}>
              <svg class={sortToolbarStyles['options-chevron']} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              {t.optionsSummary}
            </summary>
            <div class={sortToolbarStyles['options-body']}>
              <label class={pdfToolStyles['page-numbers-toggle']}>
                <input type="checkbox" checked={addPageNumbers} onChange={onPageNumbersChange} />
                <span>{t.addPageNumbers}</span>
              </label>
              <p class={sortToolbarStyles.note}>{formatMessage(t.savesAs, { name: fileName })}</p>
            </div>
          </details>

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

          {otherError && (
            <ErrorMessage>{t.errorTooLarge}</ErrorMessage>
          )}

          <div class={pdfToolStyles['action-row']}>
            {entries.length < 2 ? (
              <button type="button" class={pdfToolStyles['tool-primary-action']} disabled>
                {t.addOneMore}
              </button>
            ) : failedEntry || otherError ? null : prepared.status === 'ready' && prepared.url ? (
              <DownloadButton
                href={prepared.url}
                download={fileName}
                label={t.downloadLabel}
                detail={downloadDetail}
                onClick={onDownloadTap}
              />
            ) : (
              <button
                type="button"
                class={`${pdfToolStyles['tool-primary-action']}${pendingDownload ? ` ${pdfToolStyles['is-processing']}` : ''}`}
                aria-busy={pendingDownload || undefined}
                onClick={onPreparingTap}
              >
                {pendingDownload ? <ProgressRing progress={prepared.progress} label={t.preparing} /> : t.downloadLabel}
              </button>
            )}

            {prepared.status === 'ready' && <PdfShareButton visible={shareReady} onShare={handleShare} />}
          </div>

          {/* Under the pinned row on phones, in flow: the quiet hand-off verbs
              (MERGE-14), Start again, and the one-time install line (MERGE-17).
              Only the primary control sticks to the bottom edge. */}
          <div>
            {prepared.status === 'ready' && (
              <div class={pdfToolStyles['action-row-secondary']} aria-busy={handoffBusy || undefined}>
                {/* Buttons, not links: each parks the merged bytes for the
                    other tool and then moves there; it is an action on the
                    result, not a plain navigation. */}
                {(['compress', 'sign'] as HandoffTool[]).map((tool) => (
                  <button
                    key={tool}
                    type="button"
                    class={pdfToolStyles['quiet-link']}
                    disabled={handoffBusy}
                    onClick={() => { void requestHandoff(tool); }}
                  >
                    {tool === 'compress' ? t.handoffCompress : t.handoffSign}
                  </button>
                ))}
                {downloadedOnce && (
                  <button type="button" class={pdfToolStyles['quiet-link']} onClick={reset}>
                    {t.startAgain}
                  </button>
                )}
              </div>
            )}

            {handoffFailed && (
              <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">{t.handoffFailed}</p>
            )}

            {showInstallLine && (
              <p class={pdfToolStyles['install-line']} data-install-line>
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
        </>
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
