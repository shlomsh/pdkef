import { useState, useRef, useEffect, useMemo, useCallback } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import PdfPageCanvas from '../../editor-ui/PdfPageCanvas.tsx';
import { uniqueId, seedUniqueId } from '../../editor/model/ids.ts';
import { applyPageEdits } from '../../editor/adapters/pdf/applyPageEdits.js';
import { loadPdf as loadEditorPdf } from '../../editor/workspace/loadPdf.ts';
import { cacheRecentFile } from '../../lib/drafts/draftStore.js';
import { startGesture } from '../../lib/gestures/controller.ts';
import usePdfCoordinates from '../../editor-ui/hooks/usePdfCoordinates.js';
import { redactionDrawingPreviewStyle } from '../../editor/registry/redactionSurface.ts';
import { useEditorDraftPersistence, type EditorDraftInitialState } from '../../editor/workspace/useEditorDraftPersistence.ts';
import { isDraftElement } from '../../editor/registry/draftValidation.ts';
import { getEditorPreference, setEditorPreference, subscribeToEditorPreference } from '../../editor/workspace/preferenceStore.ts';
import useDeletableObjects from './useDeletableObjects.js';
import RedactToolbar from './RedactToolbar.tsx';
import EditorExportActions from '../../editor-ui/EditorExportActions.tsx';
import RedactBox from './RedactBox.tsx';
import DeleteMark from './DeleteMark.tsx';
import DeletableObjectOverlay from './DeletableObjectOverlay.tsx';
import type { DeletablePdfObject } from './DeletableObjectOverlay.tsx';
import EditorPageHeader from '../../editor-ui/EditorPageHeader.tsx';
import UndoHistoryModal from '../../editor-ui/UndoHistoryModal.tsx';
import {
  applyHistoryEntries,
  captureAddedElement,
  captureElementSnapshots,
  createActionEntry,
  revertHistoryEntries,
  type ActionHistoryEntry,
  type HistoryLogger,
} from '../../editor/model/actionHistory.ts';
import { useHistoryShortcuts } from '../../lib/history/useHistoryShortcuts.js';
import { usePdfShare } from '../../lib/usePdfShare.js';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import workspaceStyles from '../../editor-ui/Workspace.module.css';
import styles from './PdfRedactTool.module.css';
import { describeFile } from '../../lib/format.js';
import useCurrentPage from '../../editor-ui/hooks/useCurrentPage.js';
import type { RedactToolType } from '../../editor/model/editorModel.ts';

type RedactHistoryElement = {
  id: string;
  pageIndex: number;
  type: RedactToolType;
  [field: string]: unknown;
};

const REDACT_ELEMENT_TYPES: ReadonlySet<string> = new Set<RedactToolType>(['whiteout', 'blackout', 'blur', 'delete']);

function isRedactHistoryElement(value: unknown): value is RedactHistoryElement {
  return isDraftElement(value) && REDACT_ELEMENT_TYPES.has(value.type);
}

type DrawnRedactTool = Exclude<RedactToolType, 'delete'>;

interface RedactDrawingState {
  pageIndex: number;
  startX: number;
  startY: number;
  type: DrawnRedactTool;
  color?: string;
}

type RedactPointerEvent = (MouseEvent | TouchEvent) & { currentTarget: HTMLElement };

// Redact design-review finding #3: one Undo chip, one slot, timed the same as
// Merge's own (PdfMergeTool.tsx's UNDO_WINDOW_MS/registerUndo) - a second
// eligible action before this elapses replaces the first's chip rather than
// stacking a second one.
const UNDO_WINDOW_MS = 5000;

interface RedactUndoAction {
  message: string;
  entryId: string;
}

export default function PdfRedactTool() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [elements, setElements] = useState<RedactHistoryElement[]>([]);
  // A returning person already knows this editor contains saved work. Do not
  // spend the identity row repeating the neutral newcomer tip after that work
  // restores; tool-specific instructions remain available whenever a tool is
  // armed. Manual picks deliberately reset this to the welcoming default.
  const [showWelcomeTip, setShowWelcomeTip] = useState(true);
  // Draft persistence needs an editor-owned baseline, not a guess based on
  // when a File object first appeared. A load/restoration captures the current
  // revision; every real document operation advances it.
  const [documentRevision, setDocumentRevision] = useState(0);
  const [draftBaselineRevision, setDraftBaselineRevision] = useState(0);
  const documentRevisionRef = useRef(documentRevision);
  documentRevisionRef.current = documentRevision;
  const markDocumentEdited = () => setDocumentRevision((revision) => revision + 1);
  const [status, setStatus] = useState('idle'); // idle | loading | editing | redacting | error
  // Export errors are recoverable without unmounting the editor - status stays
  // 'editing' and this renders alongside the workspace. A failed document load
  // still uses status='error', which unmounts the workspace (see below).
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const { canSharePdf, shareReady, prepare, clearPrepared, download, downloadPrepared, sharePrepared } = usePdfShare();
  const { getPointerPercent } = usePdfCoordinates();

  // null | 'delete' | 'blackout' | 'blur' | 'whiteout'. Null - nothing armed -
  // is the resting state, exactly as it is in the Sign tool: a tool arms for one
  // box and disarms itself once that box is committed, unless it has been locked
  // on. Before this the tool was permanently armed (it even started on Delete),
  // so there was no state in which a drag on the document meant anything but
  // "draw a box" - which on a phone meant the page could not be scrolled.
  const [activeStyle, setActiveStyle] = useState<RedactToolType | null>(null);
  const [toolLocked, setToolLocked] = useState(false);
  const [activeColor, setActiveColor] = useState('#ffffff');

  // The single entry point for arming: `setTool('blur')` for one box,
  // `setTool('blur', true)` to keep it on. Locking is meaningless without a
  // tool, so disarming always clears it.
  const setTool = (tool: RedactToolType | null, locked = false) => {
    setActiveStyle(tool);
    setToolLocked(tool ? locked : false);
  };

  // Fired once a placement is committed. A locked tool ignores it and stays
  // armed - the same contract as the Sign reducer's DISARM_TOOL.
  const disarmTool = () => {
    if (!toolLocked) setTool(null);
  };
  const [drawingState, setDrawingState] = useState<RedactDrawingState | null>(null);
  const drawingPreviewRef = useRef<HTMLDivElement | null>(null);
  const cancelDrawingRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelDrawingRef.current?.(), []);

  useEffect(() => {
    const stored = getEditorPreference('lastWhiteoutColor');
    if (stored) setActiveColor(stored);
    return subscribeToEditorPreference('lastWhiteoutColor', ({ value }) => {
      if (value) setActiveColor(value);
    });
  }, []);

  const rememberColor = (color: string) => {
    setActiveColor(color);
    setEditorPreference('lastWhiteoutColor', color);
  };
  // Which existing box shows its delete/resize controls — set on hover (desktop) or
  // on touch/drag interaction (mobile has no hover), so the controls stay hidden
  // otherwise and don't clutter pages full of redaction boxes.
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  // Which box shows its whiteout color-picker toolbar. Deliberately a separate,
  // click-driven *sticky* selection (cleared only by clicking elsewhere), not tied to
  // hover like activeBoxId above. ColorPickerMenu's Popover portals its open dropdown
  // to document.body, which is outside the box's DOM subtree — if this were hover-based,
  // moving the mouse from the swatch trigger into the portaled color grid would fire the
  // box's mouseleave and unmount the toolbar (and the open popover with it) before a
  // color could be picked. Mirrors the Sign tool's activeElementId, which is click-set
  // and never cleared on mouseleave for the same reason.
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);

  // Undo history mirrors the Sign tool's atomic add/delete commands (see
  // actionHistory.ts, useHistoryShortcuts.js, UndoHistoryModal.tsx). Add
  // commands remove their captured elements; delete and clear-page commands
  // restore complete snapshots at their original stacking indexes. Edits
  // (color, move, resize) remain deliberately outside this required undo
  // slice.
  //
  // redoHistory (newest-undone-first, in-memory only, never persisted -
  // mirrors src/editor/model/historyStack.ts's `future`) only ever gains an
  // entry from undoLast's single most-recent-command step (applyRevert's
  // 'push' redoBehavior below). Every place a new command is pushed onto
  // actionHistory (logAction, and deleteElement/clearPage's own direct
  // pushes) clears it instead, and so do the modal's selective revert and the
  // undo chip (which targets a command by id, not necessarily the newest one
  // still on the stack) via applyRevert's 'clear' redoBehavior - for the same
  // reason historyStack.ts's dropCommands does: a stale future entry could
  // re-insert an element a still-live later command assumed was gone.
  const [actionHistory, setActionHistory] = useState<ActionHistoryEntry<RedactHistoryElement>[]>([]);
  const [redoHistory, setRedoHistory] = useState<ActionHistoryEntry<RedactHistoryElement>[]>([]);
  const [undoSelection, setUndoSelection] = useState<Set<string>>(new Set());
  const [undoModalOpen, setUndoModalOpen] = useState(false);

  const logAction: HistoryLogger<RedactHistoryElement> = (operation, type, pageIndex, description, snapshots) => {
    setActionHistory(prev => [createActionEntry({ operation, type, pageIndex, description, elements: snapshots }), ...prev]);
    setRedoHistory([]);
  };

  // Redact design-review finding #3: deleteElement and clearPage used to
  // change elements with no announcement and no way back short of the full
  // history modal or Cmd/Ctrl+Z. This chip mirrors Merge's own
  // (PdfMergeTool.tsx's undoAction/registerUndo): a short-lived pill in the
  // toolbar's status slot, naming the entry it can revert by id rather than
  // "whatever is newest" - correct even if another action lands before it is
  // clicked (see runUndoChip below).
  const [undoAction, setUndoAction] = useState<RedactUndoAction | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redact design-review finding #4: the exported (redacted) bytes an
  // in-toolbar "Compress it" hand-off can act on, set once a save actually
  // succeeds and cleared - same as usePdfShare's own prepared file - whenever
  // the source or the boxes change under it (see the clearPrepared effect
  // below), so it never hands Compress a stale export.
  const [exportedForHandoff, setExportedForHandoff] = useState<{ blob: Blob; name: string } | null>(null);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffFailed, setHandoffFailed] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Escape precedence while the Undo modal is open in full screen: close the
  // modal FIRST, and only let a subsequent Escape exit full screen. Without this
  // the browser's default Escape (exit fullscreen) races the dialog's own
  // Escape, and full screen tends to win, leaving the dialog orphaned open
  // behind it. The confirmations handle this for themselves in ConfirmDialog.
  useEffect(() => {
    if (!undoModalOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setUndoModalOpen(false);
    };
    window.addEventListener('keydown', onEsc, { capture: true });
    return () => window.removeEventListener('keydown', onEsc, { capture: true });
  }, [undoModalOpen]);

  // Escape disarms the tool and drops the selection, matching the Sign editor.
  // It is a shortcut for the status line's Stop chip, not the only way out: a
  // phone has no Escape key, which is exactly why that chip exists.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (undoModalOpen) return; // the capture-phase handler above owns this press
      if (!activeStyle && !activeBoxId && !selectedBoxId) return;
      setTool(null);
      setActiveBoxId(null);
      setSelectedBoxId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoModalOpen, activeStyle, activeBoxId, selectedBoxId]);

  const toggleFullscreen = () => {
    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false);
      return;
    }

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (workspaceRef.current?.requestFullscreen && document.fullscreenEnabled !== false) {
      const promise = workspaceRef.current.requestFullscreen();
      if (promise) {
        promise.catch(() => setIsPseudoFullscreen(true));
      }
    } else {
      setIsPseudoFullscreen(true);
    }
  };

  const pageWrapperRefs = useRef<(HTMLDivElement | null)[]>([]);
  // The restored document's 77 page canvases acquire their intrinsic size
  // asynchronously. Keep the informational content below the editor out of
  // paint until all of those dimensions are real: otherwise it visibly walks
  // down once per canvas while Redact reconstructs a long saved document.
  // This is deliberately Redact-local; Sign's workspace has its own render
  // path and this is not a layout contract shared with Merge.
  const renderedPageNumbersRef = useRef(new Set<number>());
  const [sizedPageCount, setSizedPageCount] = useState(0);
  const fileBytesRef = useRef<ArrayBuffer | null>(null);
  const loadIdRef = useRef(0);
  const loadControllerRef = useRef<import('../../editor/workspace/loadPdf.ts').PdfLoadController | null>(null);
  // Whichever of {manual file pick, draft restore} happens first (in call order) wins
  // outright; the other is skipped entirely. This closes the gap the loadId guard alone
  // doesn't cover: a slow draft restore that resolves *after* a fast manual pick has
  // already finished editing would otherwise still be "the newer call" and clobber it.
  const loadStartedRef = useRef(false);

  useEffect(() => () => {
    loadIdRef.current++;
    loadControllerRef.current?.cancel();
  }, []);

  const handlePageViewportReady = useCallback((pageNum: number) => {
    // PdfPageCanvas calls this immediately after it gives the canvas its real
    // viewport dimensions. A Set makes repeated React effects harmless and
    // correctly accepts a legitimate 300×150 PDF page.
    if (renderedPageNumbersRef.current.has(pageNum)) return;
    renderedPageNumbersRef.current.add(pageNum);
    setSizedPageCount(renderedPageNumbersRef.current.size);
  }, []);

  // What the Delete tool can offer to click on: images and text runs the PDF
  // itself stores as a single object, found by parsing the source file's own
  // content streams (not what's on the page after any edits this session has
  // queued - the source never changes until export, only `elements` does).
  const deletableObjects: DeletablePdfObject[] = useDeletableObjects(file, fileBytesRef.current);
  const markedForDeletionIds = useMemo(
    () => new Set<string>(elements.flatMap((element) => (
      element.type === 'delete' && typeof element.sourceObjectId === 'string'
        ? [element.sourceObjectId]
        : []
    ))),
    [elements],
  );

  const isFullscreenActive = isFullscreen || isPseudoFullscreen;
  const currentPage = useCurrentPage({
    active: isFullscreenActive,
    rootRef: workspaceRef,
    pageRefs: pageWrapperRefs,
    numPages,
  });

  // A generated PDF must match the current source and redaction boxes - the
  // "Compress it" hand-off's own prepared bytes go stale on exactly the same
  // change, so it is cleared alongside usePdfShare's own prepared file.
  useEffect(() => {
    clearPrepared();
    setExportedForHandoff(null);
  }, [file, elements, clearPrepared]);

  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  // Core loader shared by fresh file picks and draft restore. `bytes` is the source
  // PDF's ArrayBuffer; `presetElements` seeds restored redaction boxes.
  //
  // Draft restore reads from IndexedDB asynchronously, so it can still be in flight
  // when the user drops/picks a fresh file — two overlapping loadPdf calls would
  // otherwise race, and whichever's awaits happened to resolve last would silently
  // clobber the other's state. Tag each call with an id and ignore any state updates
  // from a call that's been superseded by a newer one.
  const loadPdf = async (
    selected: File,
    bytes: ArrayBuffer,
    preset: EditorDraftInitialState<RedactHistoryElement> = { elements: [], actionHistory: [] },
    restored = false,
  ) => {
    // Restored drafts arrive already migrated (legacy `style`-keyed elements
    // renamed to `type`) and validated - see useEditorDraftPersistence.ts.
    const presetElements = preset.elements || [];
    await loadEditorPdf({
      file: selected, bytes, restored, loadIdRef, loadControllerRef, clearDraft, setStatus, setAnnouncement,
      initialize: () => {
        renderedPageNumbersRef.current = new Set();
        setSizedPageCount(0);
        setShowWelcomeTip(!restored);
        setFile(selected);
        setPdfDocument(null);
        setNumPages(0);
        setErrorDetail(null);
        setProgress(0);
        setElements(presetElements);
        setActionHistory(preset.actionHistory);
        setRedoHistory([]); // a restored draft has no redoable future - future is never persisted
        setDraftBaselineRevision(documentRevisionRef.current);
        setUndoSelection(new Set());
        seedUniqueId(presetElements);
        fileBytesRef.current = bytes;
      },
      onDocument: (doc, isCurrent) => {
        if (!isCurrent()) return;
        setPdfDocument(doc);
        setNumPages(doc.numPages);
        void cacheRecentFile('redact', {
          fileName: selected.name,
          fileType: selected.type || 'application/pdf',
          fileBytes: bytes,
        });
      },
    });
  };

  const handleFilesAdded = async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const pdfs = incoming.filter((f) => f.type === 'application/pdf');

    if (pdfs.length === 0) {
      setAnnouncement('Please select a valid PDF file.');
      return;
    }

    // BasePdfTool has already asked about anything a replacement would cost, so
    // reaching here means the swap is agreed. Claim the load slot synchronously,
    // before the arrayBuffer() await, so a draft restore resolving in that gap
    // sees the claim and backs off instead of racing us.
    loadStartedRef.current = true;

    const selected = pdfs[0];
    const bytes = await selected.arrayBuffer();
    await loadPdf(selected, bytes);
  };

  const { clearDraft, isRestoring, draftSaveState } = useEditorDraftPersistence({
    tool: 'redact',
    file,
    fileBytes: fileBytesRef.current,
    elements,
    actionHistory,
    status,
    isDirty: documentRevision !== draftBaselineRevision,
    loadStartedRef,
    loadPdf,
    isElement: isRedactHistoryElement,
  });

  const handlePointerDown = (e: RedactPointerEvent, pageIndex: number) => {
    // No tool armed: a press on the page is a scroll or a deselect, never a new
    // box. Delete mode has its own click targets (DeletableObjectOverlay /
    // DeleteMark below) and never draws one either, so neither may start the
    // drag gesture this function owns.
    if (!activeStyle || activeStyle === 'delete') return;

    const target = e.target as Element | null;
    if (target?.closest(`.${styles['redact-box']}`)) {
      return; // Ignore clicks on an existing box or its floating toolbar
    }

    setActiveBoxId(null); // clicking blank page area deselects/hides any box's controls
    setSelectedBoxId(null);
    e.preventDefault();
    const container = e.currentTarget;
    const origin = getPointerPercent(e, container);
    const type = activeStyle;
    const color = type === 'whiteout' ? activeColor : (type === 'blackout' ? '#000000' : undefined);
    setDrawingState({ pageIndex, startX: origin.x, startY: origin.y, type, color });
    cancelDrawingRef.current?.();
    cancelDrawingRef.current = startGesture({
      computePatch: (moveEvent) => {
        if ('touches' in moveEvent && moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
        const point = getPointerPercent(moveEvent, container);
        const x = Math.max(0, Math.min(100, point.x));
        const y = Math.max(0, Math.min(100, point.y));
        return { left: Math.min(origin.x, x), top: Math.min(origin.y, y), width: Math.abs(x - origin.x), height: Math.abs(y - origin.y) };
      },
      writeDOM: (patch) => {
        const preview = drawingPreviewRef.current;
        if (!preview) return;
        preview.style.left = `${patch.left}%`;
        preview.style.top = `${patch.top}%`;
        preview.style.width = `${patch.width}%`;
        preview.style.height = `${patch.height}%`;
      },
      commit: (patch) => {
        cancelDrawingRef.current = null;
        setDrawingState(null);
        // A press that drew nothing has not spent the tool's one placement, so
        // it stays armed - otherwise a mistimed tap would silently disarm and
        // the next real drag would do nothing at all.
        if (!patch || patch.width <= 1 || patch.height <= 1) return;
        const id = uniqueId();
        const element: RedactHistoryElement = { id, pageIndex, ...patch, type, color };
        setElements(prev => [...prev, element]);
        markDocumentEdited();
        logAction('add', `ADD_${type.toUpperCase()}`, pageIndex, `Added ${type} box`, [captureAddedElement(element, elements.length)]);
        setAnnouncement(`Added ${type} box.`);
        disarmTool();
      },
      cancel: () => {
        cancelDrawingRef.current = null;
        setDrawingState(null);
      },
    });
  };

  // Registers a short-lived Undo chip for a delete/clear command already
  // pushed onto actionHistory, and announces it through the live region.
  // Shared by deleteElement and clearPage (finding #3) - both are complete
  // atomic commands by the time this runs, so this only has to surface what
  // already happened, not perform it.
  const registerUndo = (message: string, entry: ActionHistoryEntry<RedactHistoryElement>) => {
    setAnnouncement(`${message}.`);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction({ message, entryId: entry.id });
    undoTimerRef.current = setTimeout(() => setUndoAction(null), UNDO_WINDOW_MS);
  };

  const clearUndoChip = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setUndoAction(null);
  };

  // Reverts a set of history entries against current state and keeps every
  // dependent piece in sync - selection, the action history list, and the
  // "Undo changes" modal's own checklist. Shared by Cmd/Ctrl+Z (undoLast),
  // the modal's selective revert (handleRevertSelected) and the short-lived
  // undo chip (runUndoChip) so the three triggers cannot drift on what
  // reverting actually does.
  //
  // `redoBehavior` is an explicit, required choice by every caller rather
  // than something this function infers from `entries`, on purpose: the
  // three callers are only safe to share revert logic at all because they
  // agree on what reverting *means*, and whether that revert is safe to redo
  // is a different question with a different answer per caller (see each
  // call site). 'push' puts the reverted entries onto the front of
  // `redoHistory` so `redoLast` can bring them back; 'clear' drops
  // `redoHistory` entirely, same as historyStack.ts's `dropCommands`.
  const applyRevert = (
    entries: ActionHistoryEntry<RedactHistoryElement>[],
    announcement: string,
    redoBehavior: 'push' | 'clear',
  ) => {
    const nextElements = revertHistoryEntries(elements, entries);
    const survivingIds = new Set(nextElements.map((element) => element.id));
    setElements(nextElements);
    markDocumentEdited();
    setActiveBoxId(prev => (prev && !survivingIds.has(prev) ? null : prev));
    setSelectedBoxId(prev => (prev && !survivingIds.has(prev) ? null : prev));
    const revertedIds = new Set(entries.map((entry) => entry.id));
    setActionHistory(prev => prev.filter((action) => !revertedIds.has(action.id)));
    setRedoHistory(prev => (redoBehavior === 'push' ? [...entries, ...prev] : []));
    setUndoSelection((currentSelection) => {
      if (![...revertedIds].some((id) => currentSelection.has(id))) return currentSelection;
      const next = new Set(currentSelection);
      revertedIds.forEach((id) => next.delete(id));
      return next;
    });
    setAnnouncement(announcement);
  };

  const deleteElement = (id: string) => {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    const snapshots = captureElementSnapshots(elements, (element) => element.id === id);
    setElements(prev => prev.filter(el => el.id !== id));
    markDocumentEdited();
    setActiveBoxId(prev => (prev === id ? null : prev));
    setSelectedBoxId(prev => (prev === id ? null : prev));
    const entry = createActionEntry<RedactHistoryElement>({
      operation: 'delete', type: 'DELETE_ELEMENT', pageIndex: el.pageIndex, description: `Deleted ${el.type} box`, elements: snapshots,
    });
    setActionHistory(prev => [entry, ...prev]);
    setRedoHistory([]); // a new command, same as logAction - any undone future is now stale
    registerUndo('Removed 1 box', entry);
  };

  const updateElement = (id: string, changes: Partial<RedactHistoryElement>) => {
    setElements(prev => prev.map(el => (el.id === id ? { ...el, ...changes } : el)));
    markDocumentEdited();
  };

  // Delete tool: clicking a highlighted object queues it for removal by
  // recording the byte span pdfObjects.js found for it. Clicking an
  // already-marked object again un-marks it, through the same deleteElement
  // path a regular redaction box's × button uses, so it gets the same
  // undo-history treatment for free.
  const toggleObjectDeletion = (object: DeletablePdfObject) => {
    const existing = elements.find((el) => el.type === 'delete' && el.sourceObjectId === object.id);
    if (existing) {
      deleteElement(existing.id);
      return;
    }
    const id = uniqueId();
    const element: RedactHistoryElement = {
      id,
      pageIndex: object.pageIndex,
      type: 'delete',
      sourceObjectId: object.id,
      kind: object.kind,
      preview: object.preview,
      left: object.rect.left,
      top: object.rect.top,
      width: object.rect.width,
      height: object.rect.height,
      start: object.start,
      end: object.end,
    };
    setElements(prev => [...prev, element]);
    markDocumentEdited();
    logAction(
      'add',
      'ADD_DELETE',
      object.pageIndex,
      object.kind === 'image' ? 'Marked image for deletion' : 'Marked text for deletion',
      [captureAddedElement(element, elements.length)],
    );
    setAnnouncement(object.kind === 'image' ? 'Image marked for deletion.' : 'Text marked for deletion.');
    // Marking is this tool's placement, so it spends the arming. Un-marking
    // above deliberately does not: that is a correction, and dropping the tool
    // mid-correction is the opposite of what you asked for.
    disarmTool();
  };

  // Cmd/Ctrl+Z: undo the single most recent atomic command through the same
  // pure reverter used by selective history. This is the one caller where
  // "the entry just reverted" and "the newest entry on the stack" are
  // provably the same thing (actionHistory[0], by construction), so it is
  // also the one caller where redoing it back is safe: 'push' onto
  // redoHistory.
  const undoLast = () => {
    if (actionHistory.length === 0) return;
    const lastAction = actionHistory[0];
    applyRevert([lastAction], `Undid: ${lastAction.description}`, 'push');
  };

  // "Undo changes" modal: checked commands remain newest-first, matching the
  // result of pressing Cmd/Ctrl+Z for each of those commands in sequence.
  // This can revert an arbitrary checked set from the *middle* of the stack,
  // so it always clears redoHistory - see historyStack.ts's dropCommands doc
  // comment for why a surviving future entry would not be safe to redo here.
  const handleRevertSelected = () => {
    const idsToRevert = Array.from(undoSelection);
    if (idsToRevert.length === 0) return;
    const revertedActions = actionHistory.filter(action => idsToRevert.includes(action.id));
    applyRevert(revertedActions, 'Reverted selected actions.', 'clear');
    setUndoModalOpen(false);
  };

  // The undo chip's own Undo button (finding #3): reverts the exact command
  // it named, by id, rather than "whatever is newest" - if another action
  // landed after this one and before the chip was clicked, undoLast() would
  // silently revert the wrong thing. A stale id (the entry already reverted
  // some other way while the chip was still showing) is a silent no-op.
  //
  // That same by-id targeting is why this clears redoHistory rather than
  // pushing: the chip stays live for UNDO_WINDOW_MS after a delete/clear
  // command, and any other command logged in that window (a new box, another
  // delete) sits *above* the chip's entry on the stack by the time it is
  // clicked. Reverting a non-newest entry is exactly the "middle of the
  // stack" case handleRevertSelected is in above, so it gets the same
  // answer.
  const runUndoChip = () => {
    if (!undoAction) return;
    const entry = actionHistory.find((action) => action.id === undoAction.entryId);
    clearUndoChip();
    if (!entry) return;
    applyRevert([entry], `Undid: ${entry.description}`, 'clear');
  };

  // Shift+Cmd/Ctrl+Z or Ctrl+Y: reapplies the single most recently undone
  // command, the exact mirror of undoLast. applyHistoryEntries is
  // revertHistoryEntries' mirror (an 'add' entry is restored, a 'delete'
  // entry is re-removed), so the same surviving-id reconciliation applies:
  // an id the redo just removed again is cleared from selection.
  const redoLast = () => {
    if (redoHistory.length === 0) return;
    const nextAction = redoHistory[0];
    const nextElements = applyHistoryEntries(elements, [nextAction]);
    const survivingIds = new Set(nextElements.map((element) => element.id));
    setElements(nextElements);
    markDocumentEdited();
    setActiveBoxId(prev => (prev && !survivingIds.has(prev) ? null : prev));
    setSelectedBoxId(prev => (prev && !survivingIds.has(prev) ? null : prev));
    setActionHistory(prev => [nextAction, ...prev]);
    setRedoHistory(prev => prev.slice(1));
    setAnnouncement(`Redid: ${nextAction.description}`);
  };

  useHistoryShortcuts(undoLast, redoLast);

  // Passed to ElementToolbar's onChange for whiteout boxes: applies the color and
  // remembers it, same as the Sign tool's whiteout tool.
  const changeElementColor = (id: string, color: string) => {
    updateElement(id, { color });
    rememberColor(color);
  };

  // Shared by all three redaction types' toolbar duplicate button (E7.5's
  // toolbar-parity fix generalized this from whiteout-only): ElementToolbar's
  // onClone already hands back a full clone (new id, offset left/top, same
  // type), so this only has to append it and make it the new selection.
  const cloneElement = (cloned: RedactHistoryElement) => {
    setElements(prev => [...prev, cloned]);
    markDocumentEdited();
    setSelectedBoxId(cloned.id);
    setActiveBoxId(cloned.id);
    logAction('add', 'DUPLICATE_ELEMENT', cloned.pageIndex, `Duplicated ${cloned.type} box`, [captureAddedElement(cloned, elements.length)]);
  };

  const clearPage = (pageIndex: number) => {
    const removed = elements.filter(el => el.pageIndex === pageIndex);
    if (removed.length === 0) return;
    const snapshots = captureElementSnapshots(elements, (element) => element.pageIndex === pageIndex);
    const removedIds = removed.map(el => el.id);
    setElements(prev => prev.filter(el => el.pageIndex !== pageIndex));
    markDocumentEdited();
    setActiveBoxId(prev => (prev && removedIds.includes(prev) ? null : prev));
    setSelectedBoxId(prev => (prev && removedIds.includes(prev) ? null : prev));
    const description = `Cleared ${removed.length} box${removed.length === 1 ? '' : 'es'} on page ${pageIndex + 1}`;
    const entry = createActionEntry<RedactHistoryElement>({
      operation: 'delete', type: 'CLEAR_PAGE', pageIndex, description, elements: snapshots,
    });
    setActionHistory(prev => [entry, ...prev]);
    setRedoHistory([]); // a new command, same as logAction - any undone future is now stale
    registerUndo(description, entry);
  };

  const handleSavePdf = async (exportAction = 'download') => {
    if (!file) return;
    if (elements.length === 0) {
      setAnnouncement('Please add at least one redaction box.');
      return;
    }

    setErrorDetail(null);
    setStatus('redacting');
    setProgress(0);
    const hasBoxes = elements.some((el) => el.type !== 'delete');
    setAnnouncement(
      hasBoxes ? 'Applying redactions and flattening pages...' : 'Removing selected content...',
    );

    try {
      const redactedBlob = await applyPageEdits(file, elements, (p) => setProgress(p));
      const filename = `redacted_${file.name}`;
      // Finding #4: a successful export (either export path - Download or
      // Share - counts) is what unlocks the "Compress it" hand-off below.
      setExportedForHandoff({ blob: redactedBlob, name: filename });

      if (exportAction === 'share' && prepare(redactedBlob, filename)) {
        setStatus('editing');
        setAnnouncement('Your redacted PDF is ready to share.');
      } else {
        download(redactedBlob, filename);
        setStatus('editing');
        setAnnouncement('PDF redacted successfully. Download started.');
      }
    } catch (err) {
      console.error(err);
      // Recoverable: keep the workspace mounted so the boxes that caused the
      // failure are still there to fix, instead of unmounting the editor
      // behind a dead-end error screen (status='error' is reserved for a
      // failed document load, which never gets this far).
      setStatus('editing');
      const detail = 'Could not export the PDF. Your edits are still here. Try again.';
      setErrorDetail(detail);
      setAnnouncement(`Redaction stopped. ${detail}`);
    }
  };

  // Skips regenerating the redacted PDF when a Share-prepared file already
  // matches the current elements (usePdfShare.downloadPrepared - cleared
  // automatically by the effect above whenever file/elements change, so this
  // never serves a stale export). Mirrors PdfSignTool's handleDownloadPdf.
  const handleDownloadPdf = () => {
    setErrorDetail(null);
    if (downloadPrepared()) {
      setAnnouncement('Download started.');
      return;
    }
    handleSavePdf('download');
  };

  const handleSharePdf = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') {
      setAnnouncement('PDF shared successfully.');
    } else if (result.status === 'canceled') {
      setAnnouncement('Sharing canceled. Your redacted PDF is still ready to share.');
    } else if (result.status === 'error') {
      console.error(result.error);
      setAnnouncement('Could not open the share sheet. Please try again.');
    }
  };

  // Finding #4: hands the exported redacted bytes to Compress without
  // re-picking, the same one-shot baton Merge's own hand-off uses
  // (draftStore.js's saveHandoff/takeHandoff, consumed on the other end by
  // useHandoffIntake.ts) - reused here rather than copied, since Redact is
  // a tool and cannot import another tool's PdfMergeTool.tsx (module
  // boundaries). Disabled until exportedForHandoff exists (an export has
  // actually succeeded), mirroring Merge's own `prepared.status !== 'ready'`
  // gate on its hand-off buttons.
  const requestCompressHandoff = async () => {
    if (handoffBusy || !exportedForHandoff) return;
    setHandoffBusy(true);
    setHandoffFailed(false);
    try {
      const { saveHandoff } = await import('../../lib/drafts/draftStore.js');
      const saved = await saveHandoff('compress', {
        fileName: exportedForHandoff.name,
        fileType: 'application/pdf',
        fileBytes: await exportedForHandoff.blob.arrayBuffer(),
      });
      if (!saved) throw new Error('handoff');
      window.location.href = '/compress/';
    } catch (err) {
      console.error(err);
      setHandoffFailed(true);
      setHandoffBusy(false);
    }
  };

  return (
    <BasePdfTool
      hasFiles={!!file}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      accept=".pdf,application/pdf"
      emptyStateMessage="Select or drop a PDF to redact"
      file={file}
      // Finding #5/#6: a real page-1 thumbnail (FilePreview.tsx, via `file`)
      // instead of the generic glyph, and the identity row names what
      // Download will actually produce once there is something to redact -
      // rename-in-place is not required, so this stays derived rather than
      // becoming its own editable field the way Merge's output name is.
      fileLabel={elements.length > 0 && file ? `redacted_${file.name}` : file?.name}
      fileMeta={describeFile(file, numPages, isFullscreenActive ? currentPage : null)}
      draftSaveState={draftSaveState}
      ownsShell
      checkingDraft={isRestoring}
    >
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {/* No loading-state message: pdf.js parses fast enough that a text block
          here just added its own undersized-then-replaced flicker (see
          Workspace.module.css's fade-in on .workspace, which softens the real
          jump from nothing to a loaded document instead). */}

      {(status === 'editing' || status === 'redacting') && pdfDocument && (
        <div
          className={`${workspaceStyles.workspace}${isPseudoFullscreen ? ` ${workspaceStyles['pseudo-fullscreen']}` : ''}${status === 'redacting' ? ` ${workspaceStyles['is-processing']}` : ''}`}
          ref={workspaceRef}
          aria-busy={status === 'redacting'}
          data-redact-workspace-ready={numPages > 0 && sizedPageCount === numPages ? 'true' : 'false'}
        >
          <RedactToolbar
            activeStyle={activeStyle}
            toolLocked={toolLocked}
            setTool={setTool}
            setAnnouncement={setAnnouncement}
            toggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen || isPseudoFullscreen}
            handleDownloadPdf={handleDownloadPdf}
            handlePrepareShare={() => handleSavePdf('share')}
            handleSharePdf={handleSharePdf}
            canSharePdf={canSharePdf}
            shareReady={shareReady}
            elementsCount={elements.length}
            actionHistory={actionHistory}
            setUndoModalOpen={setUndoModalOpen}
            exporting={status === 'redacting'}
            undoAction={undoAction}
            onUndoAction={runUndoChip}
            handoffReady={!!exportedForHandoff}
            handoffBusy={handoffBusy}
            onCompressHandoff={() => { void requestCompressHandoff(); }}
            showWelcomeTip={showWelcomeTip}
          />

          <div className={workspaceStyles['pages-container']}>
            {Array.from({ length: numPages }).map((_, i) => (
              <div key={i} data-editor-page-card>
                <EditorPageHeader
                  pageNumber={i + 1}
                  onClear={elements.some(el => el.pageIndex === i) ? () => clearPage(i) : null}
                  clearTitle="Clear all redactions on this page"
                />
                <div
                  className={`${workspaceStyles['page-wrapper']} redact-draw-area`}
                  ref={(el) => { pageWrapperRefs.current[i] = el; }}
                  onMouseDown={(e) => handlePointerDown(e, i)}
                  onTouchStart={(e) => handlePointerDown(e, i)}
                  /* touch-action is armed with the tool, not left off wholesale.
                     A drawing tool has to own the touch so a drag draws instead
                     of scrolling - but this used to be unconditional, and since
                     a style was always selected, that meant a phone could never
                     scroll the document at all. Delete places by tapping, so it
                     keeps the browser's own panning. */
                  style={{
                    touchAction: activeStyle && activeStyle !== 'delete' ? 'none' : 'auto',
                    cursor: activeStyle && activeStyle !== 'delete' ? 'crosshair' : 'default',
                    position: 'relative',
                  }}
                >
                  <PdfPageCanvas
                    pdfDocument={pdfDocument}
                    pageNum={i + 1}
                    onViewportReady={handlePageViewportReady}
                  />

                  {/* Render existing redaction boxes (delete marks render separately below - they
                      have no color/drag/resize, so RedactBox and the registry it draws through
                      don't apply to them) */}
                  {elements.filter(el => el.pageIndex === i && el.type !== 'delete').map(el => (
                    <RedactBox
                      key={el.id}
                      el={el}
                      isSelected={el.id === selectedBoxId}
                      isActiveHover={el.id === activeBoxId}
                      onSelect={(id: string) => { setActiveBoxId(id); setSelectedBoxId(id); }}
                      onChange={updateElement}
                      getPageWrapper={() => pageWrapperRefs.current[el.pageIndex]}
                      onHoverEnter={() => setActiveBoxId(el.id)}
                      onHoverLeave={() => setActiveBoxId((prev) => (prev === el.id ? null : prev))}
                      onDelete={deleteElement}
                      onChangeColor={changeElementColor}
                      onClone={cloneElement}
                    />
                  ))}

                  {/* Objects already queued for deletion - shown regardless of the active
                      tool, same as redaction boxes above, so switching tools doesn't hide
                      queued work. */}
                  {elements.filter(el => el.pageIndex === i && el.type === 'delete').map(el => (
                    <DeleteMark key={el.id} el={el} onDelete={deleteElement} />
                  ))}

                  {/* Delete tool's hover targets: only shown while that tool is active,
                      and only for objects not already marked (DeleteMark covers those). */}
                  {activeStyle === 'delete' && (
                    <DeletableObjectOverlay
                      objects={deletableObjects.filter((object) => object.pageIndex === i)}
                      markedIds={markedForDeletionIds}
                      onSelect={toggleObjectDeletion}
                    />
                  )}

                  {/* Render active drawing box */}
                  {drawingState && drawingState.pageIndex === i && (
                    <div
                      ref={drawingPreviewRef}
                      className="redact-drawing-preview"
                      style={{
                        position: 'absolute',
                        left: `${drawingState.startX}%`, top: `${drawingState.startY}%`, width: 0, height: 0,
                        ...redactionDrawingPreviewStyle(drawingState.type, drawingState.color),
                        zIndex: 20,
                        pointerEvents: 'none'
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Finding #5: an honest count beside the always-visible completion
              pair, updated live off `elements.length` - the Download control
              used to never say what it would produce. */}
          {elements.length > 0 && (
            <p className={styles['export-count']}>
              {elements.length} box{elements.length === 1 ? '' : 'es'} marked
            </p>
          )}

          {/* Keep the document-completion actions available after the last
              page, matching Sign. On mobile the compact toolbar prioritizes
              editing controls and can hide Download when native file sharing
              is available, so this is the reliable place to finish either
              way. */}
          <EditorExportActions
            variant="completion"
            canShare={canSharePdf}
            shareReady={shareReady}
            disabled={elements.length === 0 || status === 'redacting'}
            onDownload={handleDownloadPdf}
            onPrepareShare={() => handleSavePdf('share')}
            onShare={handleSharePdf}
            downloadTitle={elements.length === 0 ? 'Add at least one redaction box first' : 'Apply redactions and download'}
            shareTitle={elements.length === 0
              ? 'Add at least one redaction box first'
              : (shareReady ? 'Share the redacted PDF' : 'Apply redactions and prepare the PDF for sharing')}
          />

          {/* Export error - recoverable, so it renders alongside the still-mounted
              workspace instead of replacing it (see handleSavePdf's catch). */}
          {errorDetail && (
            <ErrorMessage title="Redaction stopped." fullWidth>
              {errorDetail}
            </ErrorMessage>
          )}

          {/* Finding #4: mirrors Merge's own handoffFailed line - the hand-off
              is a nice-to-have next step, not the primary export, so a failed
              save-to-IndexedDB reports itself quietly here rather than as a
              blocking error. */}
          {handoffFailed && (
            <p className={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">
              Could not hand this off to Compress. Download it instead and open it there.
            </p>
          )}
        </div>
      )}

      {/* Redacting progress */}
      {status === 'redacting' && (
        <div className={pdfToolStyles['status-block--compact']}>
          <span className={`${pdfToolStyles['tool-primary-action-progress']} ${pdfToolStyles['tool-primary-action-progress--standalone']}`}>
            <svg className={pdfToolStyles['progress-ring']} width="22" height="22" viewBox="0 0 40 40">
              <circle className={pdfToolStyles['progress-ring-track']} cx="20" cy="20" r="18" stroke="var(--color-border-strong)" />
            </svg>
            Applying redactions… {Math.round(progress * 100)}%
          </span>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <ErrorMessage title="Redaction failed." fullWidth>
          The PDF may be password-protected or corrupted.
        </ErrorMessage>
      )}

      <UndoHistoryModal
        open={undoModalOpen}
        onClose={() => setUndoModalOpen(false)}
        actionHistory={actionHistory}
        undoSelection={undoSelection}
        setUndoSelection={setUndoSelection}
        onRevertSelected={handleRevertSelected}
        onRedo={redoLast}
        canRedo={redoHistory.length > 0}
        redoDescription={redoHistory[0]?.description}
      />

    </BasePdfTool>
  );
}
