import { useState, useRef, useEffect } from 'preact/hooks';
import BasePdfTool from './BasePdfTool.jsx';
import PdfPageCanvas from './PdfPageCanvas.jsx';
import { getPdfjs, uniqueId, seedUniqueId } from '../lib/sign.js';
import { redactPdf } from '../lib/redact.js';
import { pxToPercent, pxDeltaToPercent } from '../lib/coords.js';
import { useDraftPersistence } from '../lib/useDraftPersistence.js';
import RedactToolbar from './RedactToolbar.jsx';
import RedactBox from './RedactBox.jsx';
import UndoHistoryModal from './UndoHistoryModal.jsx';
import { MIN_SHAPE_SIZE_PCT, MAX_SHAPE_SIZE_PCT } from '../constants/signGeometry.js';
import { createActionEntry } from '../lib/actionHistory.js';
import { useUndoShortcut } from '../lib/useUndoShortcut.js';
import { usePdfShare } from '../lib/usePdfShare.js';
import pdfToolStyles from './PdfTool.module.css';

export default function PdfRedactTool() {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [elements, setElements] = useState([]); // Array of { id, pageIndex, left, top, width, height }
  const [status, setStatus] = useState('idle'); // idle | loading | editing | redacting | error
  const [progress, setProgress] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const { canSharePdf, shareReady, prepare, clearPrepared, download, sharePrepared } = usePdfShare();

  const [activeStyle, setActiveStyle] = useState('blackout'); // 'blackout' | 'blur' | 'whiteout'
  const [activeColor, setActiveColor] = useState('#ffffff');
  const [drawingState, setDrawingState] = useState(null); // { pageIndex, startX, startY, currentX, currentY }

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
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
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
  const resetDialogRef = useRef(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // showModal() places the dialog in the browser's top layer. A plain <dialog open>
  // remains in the normal stacking context and is invisible behind a real Fullscreen
  // API workspace, regardless of its z-index.
  useEffect(() => {
    const dialog = resetDialogRef.current;
    if (!dialog) return;
    if (confirmResetOpen && !dialog.open) dialog.showModal();
    else if (!confirmResetOpen && dialog.open) dialog.close();
  }, [confirmResetOpen]);

  // Escape precedence while an Undo or Start-over modal is open in full screen: close the modal
  // FIRST, and only let a subsequent Escape exit full screen. Without this the
  // browser's default Escape (exit fullscreen) races the dialog's own Escape, and
  // full screen tends to win, leaving the dialog orphaned open behind it. Mirrors
  // PdfSignTool.jsx's identical handling for its own Undo/Start-over dialogs.
  useEffect(() => {
    if (!undoModalOpen && !confirmResetOpen) return;
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (undoModalOpen) setUndoModalOpen(false);
      else setConfirmResetOpen(false);
    };
    window.addEventListener('keydown', onEsc, { capture: true });
    return () => window.removeEventListener('keydown', onEsc, { capture: true });
  }, [undoModalOpen, confirmResetOpen]);

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
    const loadId = ++loadIdRef.current;
    const presetElements = preset.elements || [];
    setFile(selected);
    setStatus('loading');
    setProgress(0);
    setElements(presetElements);
    setActionHistory(preset.actionHistory || []);
    setUndoSelection(new Set());
    seedUniqueId(presetElements);
    fileBytesRef.current = bytes;

    // pdf.js can hang indefinitely (not reject) on a corrupted/pathological file
    // instead of throwing — with no timeout that leaves the user staring at an
    // infinite "Loading PDF document..." spinner with no way out. Bail out after a
    // generous window instead. For a restore specifically, the file wasn't even a
    // choice the user made, so also drop the draft — otherwise a single bad
    // autosave permanently bricks the tool on every future visit.
    const timeoutId = setTimeout(() => {
      if (loadIdRef.current !== loadId) return;
      loadIdRef.current++; // invalidate this attempt so a late resolve/reject is ignored
      if (restored) clearDraft();
      setStatus('error');
      setAnnouncement('This PDF is taking too long to load - it may be corrupted. Please try a different file.');
    }, 20000);

    try {
      const lib = await getPdfjs();
      if (loadIdRef.current !== loadId) return;
      const doc = await lib.getDocument({ data: bytes.slice(0) }).promise;
      if (loadIdRef.current !== loadId) return;

      setPdfDocument(doc);
      setNumPages(doc.numPages);
      setStatus('editing');
      setAnnouncement(
        restored
          ? `Restored your last draft of "${selected.name}".`
          : `Loaded PDF "${selected.name}" with ${doc.numPages} pages.`
      );
    } catch (err) {
      if (loadIdRef.current !== loadId) return;
      console.error(err);
      if (restored) clearDraft();
      setStatus('error');
      setAnnouncement('Failed to load PDF file.');
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleFilesAdded = async (fileList) => {
    const incoming = Array.from(fileList);
    const pdfs = incoming.filter((f) => f.type === 'application/pdf');

    if (pdfs.length === 0) {
      setAnnouncement('Please select a valid PDF file.');
      return;
    }

    // Claim the load slot synchronously, before the arrayBuffer() await, so a draft
    // restore resolving in that gap sees the claim and backs off instead of racing us.
    loadStartedRef.current = true;

    const selected = pdfs[0];
    const bytes = await selected.arrayBuffer();
    await loadPdf(selected, bytes, {});
  };

  const { clearDraft } = useDraftPersistence({
    tool: 'redact',
    file,
    fileBytes: fileBytesRef.current,
    elements,
    extra: { actionHistory },
    status,
    onRestore: (record) => {
      // A manual pick already claimed the load slot (even if it hasn't finished loading
      // yet) — never let a silent background restore override explicit user intent.
      if (loadStartedRef.current) return;
      loadStartedRef.current = true;
      const restoredFile = new File([record.fileBytes], record.fileName, {
        type: record.fileType || 'application/pdf'
      });
      loadPdf(
        restoredFile,
        record.fileBytes,
        { elements: record.elements || [], actionHistory: record.extra?.actionHistory || [] },
        true
      );
    }
  });

  const handlePointerDown = (e, pageIndex) => {
    if (e.target.closest('.redact-element-btn') || e.target.closest('.redact-box')) {
      return; // Ignore clicks on existing boxes or buttons
    }

    setActiveBoxId(null); // clicking blank page area deselects/hides any box's controls
    setSelectedBoxId(null);
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const leftPercent = pxToPercent(clientX - rect.left, rect.width);
    const topPercent = pxToPercent(clientY - rect.top, rect.height);
    
    setDrawingState({
      pageIndex,
      startX: leftPercent,
      startY: topPercent,
      currentX: leftPercent,
      currentY: topPercent
    });
  };

  const handlePointerMove = (e, pageIndex) => {
    if (!drawingState || drawingState.pageIndex !== pageIndex) return;
    
    // Prevent scrolling while drawing on mobile
    if (e.cancelable) e.preventDefault();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const leftPercent = pxToPercent(clientX - rect.left, rect.width);
    const topPercent = pxToPercent(clientY - rect.top, rect.height);
    
    setDrawingState(prev => ({
      ...prev,
      currentX: Math.max(0, Math.min(100, leftPercent)),
      currentY: Math.max(0, Math.min(100, topPercent))
    }));
  };

  const handlePointerUp = () => {
    if (!drawingState) return;
    
    const left = Math.min(drawingState.startX, drawingState.currentX);
    const top = Math.min(drawingState.startY, drawingState.currentY);
    const width = Math.abs(drawingState.currentX - drawingState.startX);
    const height = Math.abs(drawingState.currentY - drawingState.startY);
    
    // Only create a box if it has some minimum size (e.g., > 1% of page width/height)
    if (width > 1 && height > 1) {
      const id = uniqueId();
      setElements(prev => [...prev, {
        id,
        pageIndex: drawingState.pageIndex,
        left,
        top,
        width,
        height,
        style: activeStyle,
        color: activeStyle === 'whiteout' ? activeColor : (activeStyle === 'blackout' ? '#000000' : undefined)
      }]);
      logAction(`ADD_${activeStyle.toUpperCase()}`, id, drawingState.pageIndex, `Added ${activeStyle} box`);
      setAnnouncement(`Added ${activeStyle} box.`);
    }
    
    setDrawingState(null);
  };
  
  // Need to bind mouseup/touchend to window in case they release outside the page
  useEffect(() => {
    const onGlobalUp = () => handlePointerUp();
    window.addEventListener('mouseup', onGlobalUp);
    window.addEventListener('touchend', onGlobalUp);
    return () => {
      window.removeEventListener('mouseup', onGlobalUp);
      window.removeEventListener('touchend', onGlobalUp);
    };
  }, [drawingState]);

  const deleteElement = (id) => {
    const el = elements.find(e => e.id === id);
    setElements(prev => prev.filter(el => el.id !== id));
    setActiveBoxId(prev => (prev === id ? null : prev));
    setSelectedBoxId(prev => (prev === id ? null : prev));
    if (el) logAction('DELETE_ELEMENT', id, el.pageIndex, `Deleted ${el.style} box`, [el]);
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

  // Passed to ElementToolbar's onClone (whiteout only). ElementToolbar builds the new
  // element object itself (new id, nudged position) and tags it with the rendering-only
  // `type: 'whiteout'` shim RedactBox passes in — strip that back out since Redact's
  // element model uses `style`, not `type`.
  const cloneWhiteoutElement = ({ type, ...cloned }) => {
    setElements(prev => [...prev, { ...cloned, style: 'whiteout' }]);
    setSelectedBoxId(cloned.id);
    setActiveBoxId(cloned.id);
    logAction('DUPLICATE_ELEMENT', cloned.id, cloned.pageIndex, 'Duplicated whiteout box');
  };

  // Drag an existing box to reposition it. Percentages are relative to the box's own
  // page wrapper, captured once at gesture start (it can't change mid-drag). We
  // stopPropagation so the page-level draw handler never starts a new box underneath.
  const handleBoxDragStart = (e, el) => {
    if (e.target.closest('.redact-element-btn') || e.target.closest('.redact-box-resizer') || e.target.closest('.sign-element-actions')) return;
    e.stopPropagation();
    e.preventDefault();
    setActiveBoxId(el.id); // reveal controls on touch/click, where there's no hover
    setSelectedBoxId(el.id); // pin the whiteout toolbar open (see selectedBoxId comment above)

    const wrapper = pageWrapperRefs.current[el.pageIndex];
    if (!wrapper) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const start = { x: clientX, y: clientY, left: el.left, top: el.top };

    const onMove = (ev) => {
      const mx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const my = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const rect = wrapper.getBoundingClientRect();
      let newLeft = start.left + pxDeltaToPercent(mx - start.x, rect.width);
      let newTop = start.top + pxDeltaToPercent(my - start.y, rect.height);
      newLeft = Math.max(0, Math.min(100 - el.width, newLeft));
      newTop = Math.max(0, Math.min(100 - el.height, newTop));
      updateElement(el.id, { left: newLeft, top: newTop });
      if (ev.cancelable) ev.preventDefault();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  // Drag a resize handle to resize an existing box. `handle` defaults to the single
  // bottom-right corner used by blackout/blur boxes (anchored top-left, only
  // width/height change). Whiteout boxes pass one of the 8 directions ElementResizers
  // emits (top/right/bottom/left + 4 corners), mirroring the shape-resize math in
  // SignTool/DraggableWrapper.jsx's handleResizeStart so the two behave identically.
  const handleBoxResizeStart = (e, el, handle = 'bottom-right') => {
    e.stopPropagation();
    e.preventDefault();

    const wrapper = pageWrapperRefs.current[el.pageIndex];
    if (!wrapper) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const start = { x: clientX, y: clientY, width: el.width, height: el.height, left: el.left, top: el.top };

    const onMove = (ev) => {
      const mx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const my = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const rect = wrapper.getBoundingClientRect();
      const dxPercent = pxDeltaToPercent(mx - start.x, rect.width);
      const dyPercent = pxDeltaToPercent(my - start.y, rect.height);

      let newWidth = start.width;
      let newHeight = start.height;
      let newLeft = start.left;
      let newTop = start.top;

      // On-page bounds, expressed per fixed edge rather than as a single
      // post-hoc left/top clamp — mirrors SignTool/DraggableWrapper.jsx's
      // handleResizeMove shape branch (see ca411be). A right/bottom-edge drag
      // never moves left/top at all (they stay pinned at start.left/start.top
      // above), so the only thing that can push the box off-page on that side
      // is width/height growing past what's left of the page from the
      // *anchored* (opposite) edge — cap the dimension itself instead of
      // moving the anchor. A left/top-edge drag derives its new left/top from
      // newWidth/newHeight (below), so capping the dimension there keeps the
      // derived left/top >= 0 for free, without ever touching the true anchor
      // (the opposite, un-dragged edge).
      const maxWidthFromRightGrowth = 100 - start.left;      // right edge anchored at start.left
      const maxWidthFromLeftGrowth = start.left + start.width; // left-edge drag: right edge anchored
      const maxHeightFromBottomGrowth = 100 - start.top;     // bottom edge anchored at start.top
      const maxHeightFromTopGrowth = start.top + start.height; // top-edge drag: bottom edge anchored

      if (handle === 'right') {
        newWidth = Math.max(MIN_SHAPE_SIZE_PCT, Math.min(MAX_SHAPE_SIZE_PCT, Math.min(maxWidthFromRightGrowth, start.width + dxPercent)));
      } else if (handle === 'left') {
        newWidth = Math.max(MIN_SHAPE_SIZE_PCT, Math.min(MAX_SHAPE_SIZE_PCT, Math.min(maxWidthFromLeftGrowth, start.width - dxPercent)));
        newLeft = start.left - (newWidth - start.width);
      } else if (handle === 'bottom') {
        newHeight = Math.max(MIN_SHAPE_SIZE_PCT, Math.min(MAX_SHAPE_SIZE_PCT, Math.min(maxHeightFromBottomGrowth, start.height + dyPercent)));
      } else if (handle === 'top') {
        newHeight = Math.max(MIN_SHAPE_SIZE_PCT, Math.min(MAX_SHAPE_SIZE_PCT, Math.min(maxHeightFromTopGrowth, start.height - dyPercent)));
        newTop = start.top - (newHeight - start.height);
      } else if (handle === 'bottom-right') {
        newWidth = Math.max(MIN_SHAPE_SIZE_PCT, Math.min(MAX_SHAPE_SIZE_PCT, Math.min(maxWidthFromRightGrowth, start.width + dxPercent)));
        newHeight = Math.max(MIN_SHAPE_SIZE_PCT, Math.min(MAX_SHAPE_SIZE_PCT, Math.min(maxHeightFromBottomGrowth, start.height + dyPercent)));
      } else if (handle === 'bottom-left') {
        newWidth = Math.max(MIN_SHAPE_SIZE_PCT, Math.min(MAX_SHAPE_SIZE_PCT, Math.min(maxWidthFromLeftGrowth, start.width - dxPercent)));
        newLeft = start.left - (newWidth - start.width);
        newHeight = Math.max(MIN_SHAPE_SIZE_PCT, Math.min(MAX_SHAPE_SIZE_PCT, Math.min(maxHeightFromBottomGrowth, start.height + dyPercent)));
      } else if (handle === 'top-right') {
        newWidth = Math.max(MIN_SHAPE_SIZE_PCT, Math.min(MAX_SHAPE_SIZE_PCT, Math.min(maxWidthFromRightGrowth, start.width + dxPercent)));
        newHeight = Math.max(MIN_SHAPE_SIZE_PCT, Math.min(MAX_SHAPE_SIZE_PCT, Math.min(maxHeightFromTopGrowth, start.height - dyPercent)));
        newTop = start.top - (newHeight - start.height);
      } else if (handle === 'top-left') {
        newWidth = Math.max(MIN_SHAPE_SIZE_PCT, Math.min(MAX_SHAPE_SIZE_PCT, Math.min(maxWidthFromLeftGrowth, start.width - dxPercent)));
        newLeft = start.left - (newWidth - start.width);
        newHeight = Math.max(MIN_SHAPE_SIZE_PCT, Math.min(MAX_SHAPE_SIZE_PCT, Math.min(maxHeightFromTopGrowth, start.height - dyPercent)));
        newTop = start.top - (newHeight - start.height);
      }

      updateElement(el.id, { width: newWidth, height: newHeight, left: newLeft, top: newTop });
      if (ev.cancelable) ev.preventDefault();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
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

  const reset = () => {
    clearDraft();
    clearPrepared();
    fileBytesRef.current = null;
    setFile(null);
    setPdfDocument(null);
    setElements([]);
    setActiveBoxId(null);
    setSelectedBoxId(null);
    setActionHistory([]);
    setUndoSelection(new Set());
    setUndoModalOpen(false);
    setStatus('idle');
    setProgress(0);
    setAnnouncement('Cleared workspace.');
  };

  return (
    <BasePdfTool
      hasFiles={!!file}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      accept=".pdf,application/pdf"
      emptyStateMessage="Select or drop a PDF to redact"
    >
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {(status === 'editing' || status === 'redacting') && pdfDocument && (
        <div
          className={`sign-workspace${isPseudoFullscreen ? ' pseudo-fullscreen' : ''}${status === 'redacting' ? ' is-processing' : ''}`}
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
            setConfirmResetOpen={setConfirmResetOpen}
            handleDownloadPdf={() => handleSavePdf('download')}
            handlePrepareShare={() => handleSavePdf('share')}
            handleSharePdf={handleSharePdf}
            canSharePdf={canSharePdf}
            shareReady={shareReady}
            elementsCount={elements.length}
            actionHistory={actionHistory}
            setUndoModalOpen={setUndoModalOpen}
          />

          <div className="sign-help-tip" style={{ color: 'var(--color-muted-light)' }}>
            <span>Click and drag on any page to hide sensitive text.</span>
          </div>

          <div className="sign-pages-container">
            {Array.from({ length: numPages }).map((_, i) => (
              <div key={i} className="sign-page-card">
                <div className="sign-page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.25rem' }}>
                  <span className="sign-page-number" style={{ fontWeight: 600, color: 'var(--color-text)' }}>Page {i + 1}</span>
                  {elements.some(el => el.pageIndex === i) && (
                    <button
                      type="button"
                      className={pdfToolStyles['clear-all']}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
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
                  className="sign-page-wrapper redact-draw-area"
                  ref={(el) => pageWrapperRefs.current[i] = el}
                  onMouseDown={(e) => handlePointerDown(e, i)}
                  onTouchStart={(e) => handlePointerDown(e, i)}
                  onMouseMove={(e) => handlePointerMove(e, i)}
                  onTouchMove={(e) => handlePointerMove(e, i)}
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
                      onDragStart={handleBoxDragStart}
                      onResizeStart={handleBoxResizeStart}
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
                      className="redact-drawing-preview"
                      style={{
                        position: 'absolute',
                        left: `${Math.min(drawingState.startX, drawingState.currentX)}%`,
                        top: `${Math.min(drawingState.startY, drawingState.currentY)}%`,
                        width: `${Math.abs(drawingState.currentX - drawingState.startX)}%`,
                        height: `${Math.abs(drawingState.currentY - drawingState.startY)}%`,
                        backgroundColor: activeStyle === 'blur' ? 'rgba(255,255,255,0.1)' : (activeStyle === 'whiteout' ? activeColor : 'rgba(0, 0, 0, 0.7)'),
                        opacity: activeStyle === 'whiteout' && activeColor !== '#000000' ? 0.7 : 1,
                        backdropFilter: activeStyle === 'blur' ? 'blur(8px)' : 'none',
                        WebkitBackdropFilter: activeStyle === 'blur' ? 'blur(8px)' : 'none',
                        border: activeStyle === 'blur' ? '2px dashed #000' : (activeStyle === 'whiteout' ? '2px dashed #000' : '2px dashed #ff4757'),
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
          <span className={pdfToolStyles['merge-button-progress']} style={{ color: 'var(--color-text)' }}>
            <svg className={pdfToolStyles['progress-ring']} width="22" height="22" viewBox="0 0 40 40">
              <circle className={pdfToolStyles['progress-ring-track']} cx="20" cy="20" r="18" stroke="var(--color-border-strong)" />
            </svg>
            Applying redactions… {Math.round(progress * 100)}%
          </span>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className={pdfToolStyles['error-message']} role="alert" style={{ width: '100%' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
            <path d="M12 8v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            <circle cx="12" cy="16" r="1" fill="currentColor" />
          </svg>
          <span>
            <strong>Redaction failed.</strong> The PDF may be password-protected or corrupted.
          </span>
        </div>
      )}

      <UndoHistoryModal
        open={undoModalOpen}
        onClose={() => setUndoModalOpen(false)}
        actionHistory={actionHistory}
        undoSelection={undoSelection}
        setUndoSelection={setUndoSelection}
        onRevertSelected={handleRevertSelected}
      />

      {/* Start-over confirmation */}
      <dialog
        ref={resetDialogRef}
        className="sig-dialog sig-dialog--narrow"
        onClose={() => setConfirmResetOpen(false)}
        onClick={(e) => { if (e.target === e.currentTarget) setConfirmResetOpen(false); }}
        aria-labelledby="confirm-reset-title"
      >
        <div className="sig-dialog-header">
          <h3 id="confirm-reset-title">Start over?</h3>
          <button type="button" className="sig-dialog-close" onClick={() => setConfirmResetOpen(false)} aria-label="Close dialog">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div className="sig-dialog-body sig-dialog-body--tight">
          <p className="sig-confirm-text">
            This clears the current document and removes your saved draft. Your redactions can’t be recovered afterwards.
          </p>
        </div>
        <div className="sig-dialog-footer">
          <button type="button" className="sig-btn sig-btn-secondary" onClick={() => setConfirmResetOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="sig-btn sig-btn-primary sig-btn-danger"
            onClick={() => {
              setConfirmResetOpen(false);
              reset();
            }}
          >
            Discard &amp; start over
          </button>
        </div>
      </dialog>
    </BasePdfTool>
  );
}
