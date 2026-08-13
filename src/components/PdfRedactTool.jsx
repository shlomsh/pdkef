import { useState, useRef, useEffect } from 'preact/hooks';
import BasePdfTool from './BasePdfTool.jsx';
import PdfPageCanvas from './PdfPageCanvas.jsx';
import { uniqueId, seedUniqueId } from '../lib/sign.js';
import { redactPdf } from '../lib/redact.js';
import { loadPdf as loadEditorPdf } from '../editor/workspace/loadPdf.ts';
import { startGesture } from '../editor/gestures/controller.ts';
import usePdfCoordinates from '../lib/usePdfCoordinates.js';
import { redactionDrawingPreviewStyle } from '../editor/registry/redactionSurface.ts';
import { useEditorDraftPersistence } from '../editor/workspace/useEditorDraftPersistence.js';
import RedactToolbar from './RedactToolbar.jsx';
import RedactBox from './RedactBox.jsx';
import UndoHistoryModal from './UndoHistoryModal.jsx';
import { createActionEntry } from '../lib/actionHistory.js';
import { useUndoShortcut } from '../lib/useUndoShortcut.js';
import { usePdfShare } from '../lib/usePdfShare.js';
import ErrorMessage from './ErrorMessage.jsx';
import pdfToolStyles from './PdfTool.module.css';
import workspaceStyles from './SignTool/Workspace.module.css';
import styles from './PdfRedactTool.module.css';
import { describeFile } from '../lib/format.js';
import useCurrentPage from '../lib/useCurrentPage.js';

export default function PdfRedactTool() {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [elements, setElements] = useState([]); // Array of { id, pageIndex, left, top, width, height }
  const [status, setStatus] = useState('idle'); // idle | loading | editing | redacting | error
  const [progress, setProgress] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const { canSharePdf, shareReady, prepare, clearPrepared, download, sharePrepared } = usePdfShare();
  const { getPointerPercent } = usePdfCoordinates();

  const [activeStyle, setActiveStyle] = useState('blackout'); // 'blackout' | 'blur' | 'whiteout'
  const [activeColor, setActiveColor] = useState('#ffffff');
  const [drawingState, setDrawingState] = useState(null); // { pageIndex, startX, startY, type, color }
  const drawingPreviewRef = useRef(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('pdf-toolkit:lastWhiteoutColor');
      if (stored) setActiveColor(stored);
    } catch (e) {}
  }, []);

  const rememberColor = (color) => {
    setActiveColor(color);
    try {
      localStorage.setItem('pdf-toolkit:lastWhiteoutColor', color);
    } catch (e) {}
  };
  // Which existing box shows its delete/resize controls — set on hover (desktop) or
  // on touch/drag interaction (mobile has no hover), so the controls stay hidden
  // otherwise and don't clutter pages full of redaction boxes.
  const [activeBoxId, setActiveBoxId] = useState(null);
  // Which box shows its whiteout color-picker toolbar. Deliberately a separate,
  // click-driven *sticky* selection (cleared only by clicking elsewhere), not tied to
  // hover like activeBoxId above. ColorPickerMenu's Popover portals its open dropdown
  // to document.body, which is outside the box's DOM subtree — if this were hover-based,
  // moving the mouse from the swatch trigger into the portaled color grid would fire the
  // box's mouseleave and unmount the toolbar (and the open popover with it) before a
  // color could be picked. Mirrors the Sign tool's activeElementId, which is click-set
  // and never cleared on mouseleave for the same reason.
  const [selectedBoxId, setSelectedBoxId] = useState(null);

  // Undo history — mirrors the Sign tool's model exactly (see actionHistory.js,
  // useUndoShortcut.js, UndoHistoryModal.jsx): a log of creation events only
  // (drawing a box, duplicating a whiteout box). Undoing one just removes the
  // element it created; edits (color, move, resize) aren't logged or undoable.
  const [actionHistory, setActionHistory] = useState([]);
  const [undoSelection, setUndoSelection] = useState(new Set());
  const [undoModalOpen, setUndoModalOpen] = useState(false);

  const logAction = (type, elementId, pageIndex, description, snapshot = null) => {
    setActionHistory(prev => [createActionEntry(type, elementId, pageIndex, description, snapshot), ...prev]);
  };

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const workspaceRef = useRef(null);

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
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setUndoModalOpen(false);
    };
    window.addEventListener('keydown', onEsc, { capture: true });
    return () => window.removeEventListener('keydown', onEsc, { capture: true });
  }, [undoModalOpen]);

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

  const pageWrapperRefs = useRef([]);
  const fileBytesRef = useRef(null);
  const loadIdRef = useRef(0);
  // Whichever of {manual file pick, draft restore} happens first (in call order) wins
  // outright; the other is skipped entirely. This closes the gap the loadId guard alone
  // doesn't cover: a slow draft restore that resolves *after* a fast manual pick has
  // already finished editing would otherwise still be "the newer call" and clobber it.
  const loadStartedRef = useRef(false);

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
  const loadPdf = async (selected, bytes, preset = {}, restored = false) => {
    // Migrate drafts written before E4.4's flat type discriminant. New state is
    // always type-keyed; the compatibility read is intentionally at the boundary.
    const presetElements = (preset.elements || []).map(({ style, ...element }) => ({
      ...element,
      type: element.type || style || 'blackout',
    }));
    await loadEditorPdf({
      file: selected, bytes, restored, loadIdRef, clearDraft, setStatus, setAnnouncement,
      initialize: () => {
        setFile(selected);
        setProgress(0);
        setElements(presetElements);
        setActionHistory(preset.actionHistory || []);
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

  const handleFilesAdded = async (fileList) => {
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
    await loadPdf(selected, bytes, {});
  };

  const { clearDraft, isRestoring } = useEditorDraftPersistence({
    tool: 'redact',
    file,
    fileBytes: fileBytesRef.current,
    elements,
    actionHistory,
    status,
    loadStartedRef,
    loadPdf,
  });

  const handlePointerDown = (e, pageIndex) => {
    if (e.target.closest(`.${styles['redact-element-btn']}`) || e.target.closest(`.${styles['redact-box']}`)) {
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
    startGesture({
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
        setDrawingState(null);
        if (!patch || patch.width <= 1 || patch.height <= 1) return;
        const id = uniqueId();
        setElements(prev => [...prev, { id, pageIndex, ...patch, type, color }]);
        logAction(`ADD_${type.toUpperCase()}`, id, pageIndex, `Added ${type} box`);
        setAnnouncement(`Added ${type} box.`);
      },
    });
  };

  const deleteElement = (id) => {
    const el = elements.find(e => e.id === id);
    setElements(prev => prev.filter(el => el.id !== id));
    setActiveBoxId(prev => (prev === id ? null : prev));
    setSelectedBoxId(prev => (prev === id ? null : prev));
    if (el) logAction('DELETE_ELEMENT', id, el.pageIndex, `Deleted ${el.type} box`, [el]);
  };

  const updateElement = (id, changes) => {
    setElements(prev => prev.map(el => (el.id === id ? { ...el, ...changes } : el)));
  };

  // Cmd/Ctrl+Z: undo the single most recently logged action. Deletion entries
  // carry a snapshot of what was removed (see actionHistory.js) — undo restores
  // it instead of removing by id.
  const undoLast = () => {
    if (actionHistory.length === 0) return;
    const lastAction = actionHistory[0];
    if (lastAction.snapshot) {
      setElements(prev => [...prev, ...lastAction.snapshot]);
    } else {
      setElements(prev => prev.filter(el => el.id !== lastAction.elementId));
      setActiveBoxId(prev => (prev === lastAction.elementId ? null : prev));
      setSelectedBoxId(prev => (prev === lastAction.elementId ? null : prev));
    }
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

  // "Undo changes" modal: revert several checked actions at once. Creation
  // entries revert by removing the element they added; deletion entries
  // (snapshot set) revert by restoring it.
  const handleRevertSelected = () => {
    const idsToRevert = Array.from(undoSelection);
    if (idsToRevert.length === 0) return;
    const revertedActions = actionHistory.filter(action => idsToRevert.includes(action.id));
    const idsToRemove = revertedActions.filter(a => !a.snapshot).map(a => a.elementId);
    const elementsToRestore = revertedActions.filter(a => a.snapshot).flatMap(a => a.snapshot);
    setElements(prev => prev.filter(el => !idsToRemove.includes(el.id)).concat(elementsToRestore));
    setActiveBoxId(prev => (idsToRemove.includes(prev) ? null : prev));
    setSelectedBoxId(prev => (idsToRemove.includes(prev) ? null : prev));
    setActionHistory(prev => prev.filter(action => !idsToRevert.includes(action.id)));
    setUndoSelection(new Set());
    setUndoModalOpen(false);
    setAnnouncement('Reverted selected actions.');
  };

  // Passed to ElementToolbar's onChange for whiteout boxes: applies the color and
  // remembers it, same as the Sign tool's whiteout tool.
  const changeElementColor = (id, color) => {
    updateElement(id, { color });
    rememberColor(color);
  };

  const cloneWhiteoutElement = (cloned) => {
    setElements(prev => [...prev, cloned]);
    setSelectedBoxId(cloned.id);
    setActiveBoxId(cloned.id);
    logAction('DUPLICATE_ELEMENT', cloned.id, cloned.pageIndex, 'Duplicated whiteout box');
  };

  const clearPage = (pageIndex) => {
    const removed = elements.filter(el => el.pageIndex === pageIndex);
    if (removed.length === 0) return;
    const removedIds = removed.map(el => el.id);
    setElements(prev => prev.filter(el => el.pageIndex !== pageIndex));
    setActiveBoxId(prev => (removedIds.includes(prev) ? null : prev));
    setSelectedBoxId(prev => (removedIds.includes(prev) ? null : prev));
    logAction(
      'CLEAR_PAGE',
      null,
      pageIndex,
      `Cleared ${removed.length} box${removed.length === 1 ? '' : 'es'} on page ${pageIndex + 1}`,
      removed
    );
  };

  const handleSavePdf = async (exportAction = 'download') => {
    if (!file) return;
    if (elements.length === 0) {
      setAnnouncement('Please add at least one redaction box.');
      return;
    }
    
    setStatus('redacting');
    setProgress(0);
    setAnnouncement('Applying redactions and flattening pages...');

    try {
      const redactedBlob = await redactPdf(file, elements, (p) => setProgress(p));
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
      setStatus('error');
      setAnnouncement('Failed to redact PDF document.');
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
      draftSaved={status === 'editing'}
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
            setActiveStyle={setActiveStyle}
            activeColor={activeColor}
            setActiveColor={rememberColor}
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
          />

          <div className={workspaceStyles['pages-container']}>
            {Array.from({ length: numPages }).map((_, i) => (
              <div key={i} data-editor-page-card>
                <div data-editor-page-header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.25rem' }}>
                  <span data-editor-page-number style={{ fontWeight: 600, color: 'var(--color-text)' }}>Page {i + 1}</span>
                  {elements.some(el => el.pageIndex === i) && (
                    <button
                      type="button"
                      className={styles['clear-page']}
                      title="Clear all redactions on this page"
                      onClick={() => clearPage(i)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      Clear page
                    </button>
                  )}
                </div>
                <div
                  className={`${workspaceStyles['page-wrapper']} redact-draw-area`}
                  ref={(el) => pageWrapperRefs.current[i] = el}
                  onMouseDown={(e) => handlePointerDown(e, i)}
                  onTouchStart={(e) => handlePointerDown(e, i)}
                  style={{ touchAction: 'none', cursor: 'crosshair', position: 'relative' }}
                >
                  <PdfPageCanvas pdfDocument={pdfDocument} pageNum={i + 1} />
                  
                  {/* Render existing redaction boxes */}
                  {elements.filter(el => el.pageIndex === i).map(el => (
                    <RedactBox
                      key={el.id}
                      el={el}
                      isSelected={el.id === selectedBoxId}
                      isActiveHover={el.id === activeBoxId}
                      onSelect={(id) => { setActiveBoxId(id); setSelectedBoxId(id); }}
                      onChange={updateElement}
                      getPageWrapper={() => pageWrapperRefs.current[el.pageIndex]}
                      onHoverEnter={() => setActiveBoxId(el.id)}
                      onHoverLeave={() => setActiveBoxId((prev) => (prev === el.id ? null : prev))}
                      onDelete={deleteElement}
                      onChangeColor={changeElementColor}
                      onClone={cloneWhiteoutElement}
                    />
                  ))}
                  
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
        </div>
      )}

      {/* Redacting progress */}
      {status === 'redacting' && (
        <div style={{ textAlign: 'center', width: '100%', padding: '3rem 0' }}>
          <span className={pdfToolStyles['tool-primary-action-progress']} style={{ color: 'var(--color-text)' }}>
            <svg className={pdfToolStyles['progress-ring']} width="22" height="22" viewBox="0 0 40 40">
              <circle className={pdfToolStyles['progress-ring-track']} cx="20" cy="20" r="18" stroke="var(--color-border-strong)" />
            </svg>
            Applying redactions… {Math.round(progress * 100)}%
          </span>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <ErrorMessage title="Redaction failed." style={{ width: '100%' }}>
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
