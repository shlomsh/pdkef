import { useState, useRef, useEffect, useMemo } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import BasePdfTool from './BasePdfTool.tsx';
import PdfPageCanvas from './PdfPageCanvas.tsx';
import { uniqueId, seedUniqueId } from '../editor/model/ids.ts';
import { applyPageEdits } from '../editor/adapters/pdf/applyPageEdits.js';
import { loadPdf as loadEditorPdf } from '../editor/workspace/loadPdf.ts';
import { startGesture } from '../editor/gestures/controller.ts';
import usePdfCoordinates from '../lib/usePdfCoordinates.js';
import { redactionDrawingPreviewStyle } from '../editor/registry/redactionSurface.ts';
import { useEditorDraftPersistence, type EditorDraftInitialState } from '../editor/workspace/useEditorDraftPersistence.ts';
import { isDraftElement } from '../editor/registry/draftValidation.ts';
import { getEditorPreference, setEditorPreference, subscribeToEditorPreference } from '../editor/workspace/preferenceStore.ts';
import useDeletableObjects from '../lib/useDeletableObjects.js';
import RedactToolbar from './RedactToolbar.tsx';
import RedactBox from './RedactBox.tsx';
import DeleteMark from './DeleteMark.tsx';
import DeletableObjectOverlay from './DeletableObjectOverlay.tsx';
import type { DeletablePdfObject } from './DeletableObjectOverlay.tsx';
import EditorPageHeader from './EditorPageHeader.tsx';
import UndoHistoryModal from './UndoHistoryModal.tsx';
import {
  captureAddedElement,
  captureElementSnapshots,
  createActionEntry,
  revertHistoryEntries,
  type ActionHistoryEntry,
  type HistoryLogger,
} from '../editor/model/actionHistory.ts';
import { useUndoShortcut } from '../lib/useUndoShortcut.js';
import { usePdfShare } from '../lib/usePdfShare.js';
import ErrorMessage from './ErrorMessage.tsx';
import pdfToolStyles from './PdfTool.module.css';
import workspaceStyles from './SignTool/Workspace.module.css';
import styles from './PdfRedactTool.module.css';
import { describeFile } from '../lib/format.js';
import useCurrentPage from '../lib/useCurrentPage.js';
import type { RedactToolType } from '../editor/model/editorModel.ts';

type RedactHistoryElement = {
  id: string;
  pageIndex: number;
  type: string;
  [field: string]: unknown;
};

type DrawnRedactTool = Exclude<RedactToolType, 'delete'>;

interface RedactDrawingState {
  pageIndex: number;
  startX: number;
  startY: number;
  type: DrawnRedactTool;
  color?: string;
}

type RedactPointerEvent = (MouseEvent | TouchEvent) & { currentTarget: HTMLElement };

export default function PdfRedactTool() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [elements, setElements] = useState<RedactHistoryElement[]>([]);
  const [status, setStatus] = useState('idle'); // idle | loading | editing | redacting | error
  // Export errors are recoverable without unmounting the editor - status stays
  // 'editing' and this renders alongside the workspace. A failed document load
  // still uses status='error', which unmounts the workspace (see below).
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const { canSharePdf, shareReady, prepare, clearPrepared, download, sharePrepared } = usePdfShare();
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
  // actionHistory.ts, useUndoShortcut.js, UndoHistoryModal.tsx). Add commands
  // remove their captured elements; delete and clear-page commands restore
  // complete snapshots at their original stacking indexes. Edits (color,
  // move, resize) remain deliberately outside this required undo slice.
  const [actionHistory, setActionHistory] = useState<ActionHistoryEntry<RedactHistoryElement>[]>([]);
  const [undoSelection, setUndoSelection] = useState<Set<string>>(new Set());
  const [undoModalOpen, setUndoModalOpen] = useState(false);

  const logAction: HistoryLogger<RedactHistoryElement> = (operation, type, pageIndex, description, snapshots) => {
    setActionHistory(prev => [createActionEntry({ operation, type, pageIndex, description, elements: snapshots }), ...prev]);
  };

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
  const fileBytesRef = useRef<ArrayBuffer | null>(null);
  const loadIdRef = useRef(0);
  const loadControllerRef = useRef<import('../editor/workspace/loadPdf.ts').PdfLoadController | null>(null);
  // Whichever of {manual file pick, draft restore} happens first (in call order) wins
  // outright; the other is skipped entirely. This closes the gap the loadId guard alone
  // doesn't cover: a slow draft restore that resolves *after* a fast manual pick has
  // already finished editing would otherwise still be "the newer call" and clobber it.
  const loadStartedRef = useRef(false);

  useEffect(() => () => {
    loadIdRef.current++;
    loadControllerRef.current?.cancel();
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

  // A generated PDF must match the current source and redaction boxes.
  useEffect(() => {
    clearPrepared();
  }, [file, elements, clearPrepared]);

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
        setFile(selected);
        setPdfDocument(null);
        setNumPages(0);
        setErrorDetail(null);
        setProgress(0);
        setElements(presetElements);
        setActionHistory(preset.actionHistory);
        setUndoSelection(new Set());
        seedUniqueId(presetElements);
        fileBytesRef.current = bytes;
      },
      onDocument: (doc) => {
        setPdfDocument(doc);
        setNumPages(doc.numPages);
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
    loadStartedRef,
    loadPdf,
    isElement: (value): value is RedactHistoryElement => isDraftElement(value),
  });

  const handlePointerDown = (e: RedactPointerEvent, pageIndex: number) => {
    // No tool armed: a press on the page is a scroll or a deselect, never a new
    // box. Delete mode has its own click targets (DeletableObjectOverlay /
    // DeleteMark below) and never draws one either, so neither may start the
    // drag gesture this function owns.
    if (!activeStyle || activeStyle === 'delete') return;

    const target = e.target as Element | null;
    if (target?.closest(`.${styles['redact-element-btn']}`) || target?.closest(`.${styles['redact-box']}`)) {
      return; // Ignore clicks on existing boxes or buttons
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

  const deleteElement = (id: string) => {
    const el = elements.find(e => e.id === id);
    const snapshots = captureElementSnapshots(elements, (element) => element.id === id);
    setElements(prev => prev.filter(el => el.id !== id));
    setActiveBoxId(prev => (prev === id ? null : prev));
    setSelectedBoxId(prev => (prev === id ? null : prev));
    if (el) logAction('delete', 'DELETE_ELEMENT', el.pageIndex, `Deleted ${el.type} box`, snapshots);
  };

  const updateElement = (id: string, changes: Partial<RedactHistoryElement>) => {
    setElements(prev => prev.map(el => (el.id === id ? { ...el, ...changes } : el)));
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
  // pure reverter used by selective history.
  const undoLast = () => {
    if (actionHistory.length === 0) return;
    const lastAction = actionHistory[0];
    const nextElements = revertHistoryEntries(elements, [lastAction]);
    const survivingIds = new Set(nextElements.map((element) => element.id));
    setElements(nextElements);
    setActiveBoxId(prev => (prev && !survivingIds.has(prev) ? null : prev));
    setSelectedBoxId(prev => (prev && !survivingIds.has(prev) ? null : prev));
    setActionHistory(prev => prev.slice(1));
    setUndoSelection((currentSelection) => {
      if (!currentSelection.has(lastAction.id)) return currentSelection;
      const newSet = new Set(currentSelection);
      newSet.delete(lastAction.id);
      return newSet;
    });
    setAnnouncement(`Undid: ${lastAction.description}`);
  };
  useUndoShortcut(undoLast);

  // "Undo changes" modal: checked commands remain newest-first, matching the
  // result of pressing Cmd/Ctrl+Z for each of those commands in sequence.
  const handleRevertSelected = () => {
    const idsToRevert = Array.from(undoSelection);
    if (idsToRevert.length === 0) return;
    const revertedActions = actionHistory.filter(action => idsToRevert.includes(action.id));
    const nextElements = revertHistoryEntries(elements, revertedActions);
    const survivingIds = new Set(nextElements.map((element) => element.id));
    setElements(nextElements);
    setActiveBoxId(prev => (prev && !survivingIds.has(prev) ? null : prev));
    setSelectedBoxId(prev => (prev && !survivingIds.has(prev) ? null : prev));
    setActionHistory(prev => prev.filter(action => !idsToRevert.includes(action.id)));
    setUndoSelection(new Set());
    setUndoModalOpen(false);
    setAnnouncement('Reverted selected actions.');
  };

  // Passed to ElementToolbar's onChange for whiteout boxes: applies the color and
  // remembers it, same as the Sign tool's whiteout tool.
  const changeElementColor = (id: string, color: string) => {
    updateElement(id, { color });
    rememberColor(color);
  };

  const cloneWhiteoutElement = (cloned: RedactHistoryElement) => {
    setElements(prev => [...prev, cloned]);
    setSelectedBoxId(cloned.id);
    setActiveBoxId(cloned.id);
    logAction('add', 'DUPLICATE_ELEMENT', cloned.pageIndex, 'Duplicated whiteout box', [captureAddedElement(cloned, elements.length)]);
  };

  const clearPage = (pageIndex: number) => {
    const removed = elements.filter(el => el.pageIndex === pageIndex);
    if (removed.length === 0) return;
    const snapshots = captureElementSnapshots(elements, (element) => element.pageIndex === pageIndex);
    const removedIds = removed.map(el => el.id);
    setElements(prev => prev.filter(el => el.pageIndex !== pageIndex));
    setActiveBoxId(prev => (prev && removedIds.includes(prev) ? null : prev));
    setSelectedBoxId(prev => (prev && removedIds.includes(prev) ? null : prev));
    logAction(
      'delete',
      'CLEAR_PAGE',
      pageIndex,
      `Cleared ${removed.length} box${removed.length === 1 ? '' : 'es'} on page ${pageIndex + 1}`,
      snapshots
    );
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

  return (
    <BasePdfTool
      hasFiles={!!file}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      accept=".pdf,application/pdf"
      emptyStateMessage="Select or drop a PDF to redact"
      fileLabel={file?.name}
      fileMeta={describeFile(file, numPages, isFullscreenActive ? currentPage : null)}
      draftSaveState={draftSaveState}
      hasWork={elements.length > 0}
      workNoun="your redaction boxes"
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
        >
          <RedactToolbar
            activeStyle={activeStyle}
            toolLocked={toolLocked}
            setTool={setTool}
            setAnnouncement={setAnnouncement}
            toggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen || isPseudoFullscreen}
            handleDownloadPdf={() => handleSavePdf('download')}
            handlePrepareShare={() => handleSavePdf('share')}
            handleSharePdf={handleSharePdf}
            canSharePdf={canSharePdf}
            shareReady={shareReady}
            elementsCount={elements.length}
            actionHistory={actionHistory}
            setUndoModalOpen={setUndoModalOpen}
            exporting={status === 'redacting'}
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
                  <PdfPageCanvas pdfDocument={pdfDocument} pageNum={i + 1} />

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
                      onClone={cloneWhiteoutElement}
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

          {/* Export error - recoverable, so it renders alongside the still-mounted
              workspace instead of replacing it (see handleSavePdf's catch). */}
          {errorDetail && (
            <ErrorMessage title="Redaction stopped." fullWidth>
              {errorDetail}
            </ErrorMessage>
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
      />

    </BasePdfTool>
  );
}
