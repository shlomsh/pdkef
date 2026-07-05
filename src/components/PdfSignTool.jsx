import { useState, useRef, useEffect } from 'preact/hooks';
import BasePdfTool from './BasePdfTool.jsx';
import DraggableOverlayElement from './DraggableOverlayElement.jsx';
import PdfPageCanvas from './PdfPageCanvas.jsx';
import FloatingToolbar from './FloatingToolbar.jsx';
import SignatureDialog from './SignatureDialog.jsx';
import { getPdfjs, uniqueId, seedUniqueId, signPdf } from '../lib/sign.js';
import { pxToPercent, pxDeltaToPercent, widthPercentToHeightPercent } from '../lib/coords.js';
import { useSignDraftPersistence } from './useSignDraftPersistence.js';

// Tools created by a press-drag-release gesture (draw the element out under the
// cursor) rather than a single click-to-place. Handled by handleOverlayPointerDown.
const DRAG_DRAWN_TOOLS = ['whiteout', 'line', 'ellipse', 'rectangle'];

export default function PdfSignTool() {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageSizes, setPageSizes] = useState([]); // Array of { width, height } in PDF points
  const [elements, setElements] = useState([]);
  const [activeElementId, setActiveElementId] = useState(null);
  const [selectedTool, setSelectedTool] = useState(null); // 'select' | 'text' | 'signature' | 'symbol' | 'whiteout' | 'line' | 'ellipse' | 'rectangle'
  const [status, setStatus] = useState('idle'); // idle | loading | editing | signing | done | error
  const [progress, setProgress] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [actionHistory, setActionHistory] = useState([]);
  const [undoModalOpen, setUndoModalOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [undoSelection, setUndoSelection] = useState(new Set());
  const [announcement, setAnnouncement] = useState('');

  // Last color picked for any element, remembered across new placements
  const [lastColor, setLastColor] = useState('#000000');

  // Last font family picked for a text element, remembered across new placements
  const [lastFont, setLastFont] = useState('Arimo');

  // Last font size picked for a text element, remembered across new placements
  const [lastFontSize, setLastFontSize] = useState(12);

  // Last manually-toggled text direction, remembered across new placements —
  // lets a form filled in the same language keep predicting direction
  // without re-toggling per field. null means "no manual override yet",
  // so new elements fall back to content-based auto-detection.
  const [lastDirection, setLastDirection] = useState(null);

  // Last chosen stroke thickness, remembered across new placements
  const [lastThickness, setLastThickness] = useState(3);

  // Saved signatures and active signature state
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [activeSignature, setActiveSignature] = useState(null);

  // Refs
  // Live DOM nodes for each page wrapper, read imperatively at event time (e.g.
  // placeSignatureAt reads getBoundingClientRect to size a dropped signature).
  // These are NOT passed to overlay elements for sizing — each element measures its
  // own container via the DOM instead (see DraggableOverlayElement), so there's no
  // render-time dependency on this array being populated yet.
  const pageWrapperRefs = useRef([]);
  const copiedElementRef = useRef(null);
  const workspaceRef = useRef(null);
  const undoDialogRef = useRef(null);
  const resetDialogRef = useRef(null);
  const fileBytesRef = useRef(null);
  const loadIdRef = useRef(0);
  // Whichever of {manual file pick, draft restore} happens first (in call order) wins
  // outright; the other is skipped entirely. This closes the gap the loadId guard alone
  // doesn't cover: a slow draft restore that resolves *after* a fast manual pick has
  // already finished editing would otherwise still be "the newer call" and clobber it.
  const loadStartedRef = useRef(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [tempPlacement, setTempPlacement] = useState(null);

  // Track fullscreen state (also covers exiting via Esc, not just our own button)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Open the Undo / Start-over dialogs with showModal() rather than the `open`
  // attribute. showModal() promotes the dialog into the browser's top layer, which
  // paints above the Fullscreen API element — a plain <dialog open> renders in
  // normal stacking and is invisible while the workspace is in real full screen
  // (that's why the modal SignatureDialog showed but these didn't).
  useEffect(() => {
    const d = undoDialogRef.current;
    if (!d) return;
    if (undoModalOpen && !d.open) d.showModal();
    else if (!undoModalOpen && d.open) d.close();
  }, [undoModalOpen]);

  useEffect(() => {
    const d = resetDialogRef.current;
    if (!d) return;
    if (confirmResetOpen && !d.open) d.showModal();
    else if (!confirmResetOpen && d.open) d.close();
  }, [confirmResetOpen]);

  // Escape precedence while a dialog is open in full screen: close the dialog
  // FIRST, and only let a subsequent Escape exit full screen. Without this the
  // browser's default Escape (exit fullscreen) and the dialog's own Escape race,
  // and full screen tends to win. Capturing Escape here (capture phase) lets us
  // close the modal ourselves and preventDefault/stopImmediatePropagation so
  // neither the fullscreen-exit default nor the global tool/selection Escape
  // handler also fires on the same press.
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

  const logAction = (type, elId, pageIndex, description) => {
    setActionHistory((prev) => [
      { id: uniqueId(), type, elementId: elId, pageIndex, description, timestamp: Date.now() },
      ...prev
    ]);
  };

  const handleRevertSelected = () => {
    const idsToRevert = Array.from(undoSelection);
    if (idsToRevert.length === 0) return;
    const elementIdsToRemove = actionHistory
      .filter(action => idsToRevert.includes(action.id))
      .map(action => action.elementId);
    setElements((prev) => prev.filter(el => !elementIdsToRemove.includes(el.id)));
    setActionHistory((prev) => prev.filter(action => !idsToRevert.includes(action.id)));
    setUndoSelection(new Set());
    setUndoModalOpen(false);
    setAnnouncement('Reverted selected actions.');
  };


  // Load saved signatures from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pdf-toolkit:signatures');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSavedSignatures(parsed);
        if (parsed.length > 0) {
          setActiveSignature(parsed[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load saved signatures from localStorage:', e);
    }
  }, []);

  // Load last-used element color from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pdf-toolkit:lastColor');
      if (stored) setLastColor(stored);
    } catch (e) {
      console.error('Failed to load last color from localStorage:', e);
    }
  }, []);

  // Load last-used text font from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pdf-toolkit:lastFont');
      if (stored) setLastFont(stored);
    } catch (e) {
      console.error('Failed to load last font from localStorage:', e);
    }
  }, []);

  // Load last-used text font size from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pdf-toolkit:lastFontSize');
      if (stored) setLastFontSize(parseFloat(stored));
    } catch (e) {
      console.error('Failed to load last font size from localStorage:', e);
    }
  }, []);

  // Load last-used text direction override from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pdf-toolkit:lastDirection');
      if (stored) setLastDirection(stored);
    } catch (e) {
      console.error('Failed to load last text direction from localStorage:', e);
    }
  }, []);

  // Remember the color last picked, shared across text/symbol/signature, for future placements
  const rememberColor = (color) => {
    setLastColor(color);
    try {
      localStorage.setItem('pdf-toolkit:lastColor', color);
    } catch (e) {
      console.error('Failed to persist last color to localStorage:', e);
    }
  };

  // Remember the font last picked for a text element, for future placements
  const rememberFont = (fontFamily) => {
    setLastFont(fontFamily);
    try {
      localStorage.setItem('pdf-toolkit:lastFont', fontFamily);
    } catch (e) {
      console.error('Failed to persist last font to localStorage:', e);
    }
  };

  // Remember the font size last picked for a text element, for future placements
  const rememberFontSize = (fontSize) => {
    setLastFontSize(fontSize);
    try {
      localStorage.setItem('pdf-toolkit:lastFontSize', String(fontSize));
    } catch (e) {
      console.error('Failed to persist last font size to localStorage:', e);
    }
  };

  // Remember the text direction last manually toggled, for future placements
  const rememberDirection = (textDirection) => {
    setLastDirection(textDirection);
    try {
      localStorage.setItem('pdf-toolkit:lastDirection', textDirection);
    } catch (e) {
      console.error('Failed to persist last text direction to localStorage:', e);
    }
  };

  // Save new signature to list & localStorage
  const saveNewSignature = (dataUrl, aspectRatio) => {
    const newSig = {
      id: `sig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      dataUrl,
      aspectRatio
    };
    const updated = [newSig, ...savedSignatures].slice(0, 10);
    setSavedSignatures(updated);
    try {
      localStorage.setItem('pdf-toolkit:signatures', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to persist signatures to localStorage:', e);
    }
    return newSig;
  };

  // Delete saved signature
  const deleteSavedSignature = (id, e) => {
    if (e) e.stopPropagation();
    const updated = savedSignatures.filter((sig) => sig.id !== id);
    setSavedSignatures(updated);
    try {
      localStorage.setItem('pdf-toolkit:signatures', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to persist signatures to localStorage:', e);
    }
    if (activeSignature && activeSignature.id === id) {
      const fallback = updated.length > 0 ? updated[0] : null;
      setActiveSignature(fallback);
      if (!fallback && selectedTool === 'signature') {
        setSelectedTool(null);
      }
    }
  };

  // Core loader shared by fresh file picks and draft restore. `bytes` is the source
  // PDF's ArrayBuffer; `preset` seeds restored elements/action history.
  const loadPdf = async (selected, bytes, preset = {}, restored = false) => {
    const loadId = ++loadIdRef.current;
    const presetElements = preset.elements || [];
    setFile(selected);
    setStatus('loading');
    setProgress(0);
    setElements(presetElements);
    setActionHistory(preset.actionHistory || []);
    setActiveElementId(null);
    setSelectedTool(null);
    seedUniqueId(presetElements);
    fileBytesRef.current = bytes;

    // pdf.js can hang indefinitely (not reject) on a corrupted/pathological file
    const timeoutId = setTimeout(() => {
      if (loadIdRef.current !== loadId) return;
      loadIdRef.current++;
      if (restored) clearDraft();
      setStatus('error');
      setAnnouncement('This PDF is taking too long to load — it may be corrupted. Please try a different file.');
    }, 20000);

    try {
      const lib = await getPdfjs();
      if (loadIdRef.current !== loadId) return;
      const doc = await lib.getDocument({ data: bytes.slice(0) }).promise;
      if (loadIdRef.current !== loadId) return;

      setPdfDocument(doc);
      setNumPages(doc.numPages);

      // Load all pages to read sizes
      const sizes = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        if (loadIdRef.current !== loadId) return;
        const { width, height } = page.getViewport({ scale: 1.0 });
        sizes.push({ width, height });
      }
      if (loadIdRef.current !== loadId) return;
      setPageSizes(sizes);
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

  // Handle PDF file selection
  const handleFilesAdded = async (fileList) => {
    const incoming = Array.from(fileList);
    const pdfs = incoming.filter((f) => f.type === 'application/pdf');

    if (pdfs.length === 0) {
      setAnnouncement('Please select a valid PDF file.');
      return;
    }

    const selected = pdfs[0];

    if (file) {
      setPendingFile(selected);
      setConfirmResetOpen(true);
      return;
    }

    loadStartedRef.current = true;
    const bytes = await selected.arrayBuffer();
    await loadPdf(selected, bytes, {});
  };

  // Setup draft persistence hook
  const { clearDraft } = useSignDraftPersistence({
    file,
    fileBytes: fileBytesRef.current,
    elements,
    actionHistory,
    status,
    loadStartedRef,
    loadPdf
  });

  // Place element on current page click
  const handlePageClick = (e, pageIndex) => {
    if (!selectedTool) return;
    // Whiteout, line, and shapes are draw-by-drag gestures handled in
    // handleOverlayPointerDown, not click-to-place.
    if (DRAG_DRAWN_TOOLS.includes(selectedTool)) return;
    e.stopPropagation();
    
    // Ignore clicks if clicking on a active element to edit it
    if (e.target.closest('.sign-element')) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const leftPercent = pxToPercent(e.clientX - rect.left, rect.width);
    const topPercent = pxToPercent(e.clientY - rect.top, rect.height);
    
    if (selectedTool === 'text') {
      const id = uniqueId();
      const newEl = {
        id,
        type: 'text',
        pageIndex,
        left: leftPercent,
        top: topPercent,
        text: '',
        fontSize: lastFontSize, // in PDF points
        fontFamily: lastFont,
        fontWeight: 'normal',
        fontStyle: 'normal',
        color: lastColor,
        textDirection: lastDirection
      };
      setElements((prev) => [...prev, newEl]);
      setActiveElementId(id);
      logAction('ADD_TEXT', id, pageIndex, 'Added text box');
      setAnnouncement('Added text box. Click or double click to type.');
    } else if (selectedTool === 'symbol') {
      const id = uniqueId();
      const widthPercent = 5;
      // Height% and width% are relative to different page dimensions (height vs.
      // width px), so a naive height: 5 makes the box a tall rectangle on a
      // portrait page — the square symbol icon then centers inside it, leaving a
      // vertical margin. Derive height from width with aspectRatio 1 (square in
      // px), the same conversion the resizer uses for symbols.
      const heightPercent = widthPercentToHeightPercent(widthPercent, 1, rect.width, rect.height);
      const newEl = {
        id,
        type: 'symbol',
        pageIndex,
        left: leftPercent - widthPercent / 2,
        top: topPercent - heightPercent / 2,
        width: widthPercent, // percentage
        height: heightPercent, // percentage
        color: lastColor
      };
      setElements((prev) => [...prev, newEl]);
      setActiveElementId(id);
      logAction('ADD_SYMBOL', id, pageIndex, 'Added symbol');
      setAnnouncement('Added symbol.');
    } else if (selectedTool === 'signature') {
      if (activeSignature) {
        placeSignatureAt(activeSignature.dataUrl, activeSignature.aspectRatio, pageIndex, leftPercent, topPercent);
      } else {
        // Save click location temporarily to place signature once generated
        setTempPlacement({ pageIndex, left: leftPercent, top: topPercent });
        setDialogOpen(true);
      }
    }
  };

  // Draw-by-drag creation for whiteout, line, ellipse, and rectangle: press to set
  // the first point, drag to the second point, release to commit. Line stores the
  // two points as ordered endpoints (x1,y1 -> x2,y2); box shapes store a normalized
  // bounding box (left/top + positive width/height). A click without a real drag
  // falls back to a sensible default size so the tool never leaves a zero-size element.
  const handleOverlayPointerDown = (e, pageIndex) => {
    if (!DRAG_DRAWN_TOOLS.includes(selectedTool)) return;
    if (e.target.closest('.sign-element')) return;
    e.stopPropagation();

    // Prevent default on mouse events to avoid selecting text
    if (!e.touches) e.preventDefault();

    const tool = selectedTool;
    const isLineTool = tool === 'line';
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const startLeftPercent = pxToPercent(clientX - rect.left, rect.width);
    const startTopPercent = pxToPercent(clientY - rect.top, rect.height);

    const id = uniqueId();
    const newEl = isLineTool
      ? {
          id, type: 'line', pageIndex,
          x1: startLeftPercent, y1: startTopPercent,
          x2: startLeftPercent, y2: startTopPercent,
          color: lastColor || '#1463ff',
          strokeWidth: lastThickness
        }
      : {
          id, type: tool, pageIndex,
          left: startLeftPercent, top: startTopPercent,
          width: 0, height: 0,
          ...(tool === 'whiteout'
            ? { color: '#ffffff' }
            : { color: lastColor || '#1463ff', strokeWidth: lastThickness })
        };

    setElements((prev) => [...prev, newEl]);
    setActiveElementId(id);

    const handlePointerMove = (moveEvent) => {
      const moveX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;

      if (isLineTool) {
        const x2 = Math.max(0, Math.min(100, pxToPercent(moveX - rect.left, rect.width)));
        const y2 = Math.max(0, Math.min(100, pxToPercent(moveY - rect.top, rect.height)));
        setElements((prev) => prev.map(el => el.id === id ? { ...el, x2, y2 } : el));
        return;
      }

      const widthPercent = pxDeltaToPercent(moveX - clientX, rect.width);
      const heightPercent = pxDeltaToPercent(moveY - clientY, rect.height);

      setElements((prev) => prev.map(el => {
        if (el.id === id) {
           return {
             ...el,
             left: widthPercent < 0 ? startLeftPercent + widthPercent : startLeftPercent,
             top: heightPercent < 0 ? startTopPercent + heightPercent : startTopPercent,
             width: Math.abs(widthPercent),
             height: Math.abs(heightPercent)
           };
        }
        return el;
      }));
    };

    const handlePointerUp = () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);

      // Fall back to a default footprint when the gesture was effectively a click
      // (no meaningful drag), so the tool never leaves a zero-size element behind.
      setElements((prev) => {
        const el = prev.find(e => e.id === id);
        if (!el) return prev;
        if (isLineTool) {
          const tiny = Math.hypot(el.x2 - el.x1, el.y2 - el.y1) < 1;
          if (tiny) {
            return prev.map(e => e.id === id ? {
              ...e,
              x1: Math.max(0, startLeftPercent - 6), y1: startTopPercent,
              x2: Math.min(100, startLeftPercent + 6), y2: startTopPercent
            } : e);
          }
          return prev;
        }
        if (el.width < 0.5 && el.height < 0.5) {
          if (tool === 'whiteout') {
            return prev.map(e => e.id === id ? { ...e, left: startLeftPercent - 5, top: startTopPercent - 2, width: 10, height: 4 } : e);
          }
          const defW = 8;
          const defH = widthPercentToHeightPercent(defW, 1, rect.width, rect.height);
          return prev.map(e => e.id === id ? { ...e, left: startLeftPercent - defW / 2, top: startTopPercent - defH / 2, width: defW, height: defH } : e);
        }
        return prev;
      });

      if (tool === 'whiteout') {
        logAction('ADD_WHITEOUT', id, pageIndex, 'Added whiteout box');
        setAnnouncement('Added whiteout box.');
      } else {
        logAction('ADD_SHAPE', id, pageIndex, `Added ${tool}`);
        setAnnouncement(`Added ${tool}.`);
        // Tool stays armed (like Text/Symbols/Whiteout) so you can draw several
        // shapes/lines in a row without reopening the Shapes menu each time.
      }
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
  };

  // Helper to place a signature at a specific location
  const placeSignatureAt = (dataUrl, aspectRatio, pageIdx, leftPercent, topPercent) => {
    const id = uniqueId();
    // Default size: width = 20% of page
    const widthPercent = 20;
    
    // Calculate page wrapper dimension
    let pageWrapperHeight = 800;
    let pageWrapperWidth = 600;
    
    const wrapper = pageWrapperRefs.current[pageIdx];
    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      pageWrapperWidth = rect.width;
      pageWrapperHeight = rect.height;
    }
    
    const heightPercent = widthPercentToHeightPercent(widthPercent, aspectRatio, pageWrapperWidth, pageWrapperHeight);
    
    const newEl = {
      id,
      type: 'signature',
      pageIndex: pageIdx,
      left: leftPercent - (widthPercent / 2),
      top: topPercent - (heightPercent / 2),
      width: widthPercent,
      height: heightPercent,
      aspectRatio,
      dataUrl
    };
    
    setElements((prev) => [...prev, newEl]);
    setActiveElementId(id);
    logAction('ADD_SIGNATURE', id, pageIdx, 'Added signature');
    setAnnouncement('Placed signature on page.');
  };

  // Add signature element from modal
  const handleAddSignatureElement = (dataUrl, aspectRatio) => {
    const newSig = saveNewSignature(dataUrl, aspectRatio);
    setActiveSignature(newSig);
    setSelectedTool('signature');
    
    const placement = tempPlacement || { pageIndex: 0, left: 40, top: 40 };
    placeSignatureAt(dataUrl, aspectRatio, placement.pageIndex, placement.left, placement.top);
    setDialogOpen(false);
    setTempPlacement(null);
  };

  // Update element position or content
  const updateElement = (id, changes) => {
    setElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, ...changes } : el))
    );
    if (changes.color) setLastColor(changes.color);
    if (changes.fontFamily) setLastFont(changes.fontFamily);
    if (changes.fontSize) setLastFontSize(changes.fontSize);
    if (changes.textDirection !== undefined) setLastDirection(changes.textDirection);
    if (changes.strokeWidth) setLastThickness(changes.strokeWidth);
  };

  // Delete placed element
  const deleteElement = (id) => {
    setElements((prev) => prev.filter((el) => el.id !== id));
    setActiveElementId(null);
    setAnnouncement('Removed element.');
  };

  // Global keyboard shortcuts (Escape, Undo, Delete)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Clear selected tool and active element on Escape
      if (e.key === 'Escape') {
        setSelectedTool(null);
        setActiveElementId(null);
        document.activeElement?.blur();
        return;
      }

      const tag = document.activeElement?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      // Undo (Cmd+Z or Ctrl+Z)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (isInput) return; // Let native undo handle text input editing
        e.preventDefault();
        
        setActionHistory((currentHistory) => {
          if (currentHistory.length === 0) return currentHistory;
          const lastAction = currentHistory[0];
          
          setElements((prevEls) => prevEls.filter(el => el.id !== lastAction.elementId));
          setActiveElementId((currentActive) => 
            currentActive === lastAction.elementId ? null : currentActive
          );
          setUndoSelection((currentSelection) => {
            if (!currentSelection.has(lastAction.id)) return currentSelection;
            const newSet = new Set(currentSelection);
            newSet.delete(lastAction.id);
            return newSet;
          });
          setAnnouncement(`Undid: ${lastAction.description}`);
          
          return currentHistory.slice(1);
        });
        return;
      }

      // Delete the active element via Backspace/Delete
      if (activeElementId && (e.key === 'Backspace' || e.key === 'Delete')) {
        if (isInput) return;
        e.preventDefault();
        deleteElement(activeElementId);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeElementId]);

  // Handle element copy and paste actions
  useEffect(() => {
    const handleCopy = (e) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        const selStart = document.activeElement.selectionStart;
        const selEnd = document.activeElement.selectionEnd;
        if (selStart !== selEnd) {
          return;
        }
      }

      if (!activeElementId) return;
      const elToCopy = elements.find((el) => el.id === activeElementId);
      if (elToCopy) {
        copiedElementRef.current = elToCopy;
        const textRepresentation = elToCopy.type === 'text' ? elToCopy.text : `[${elToCopy.type}]`;
        if (e.clipboardData) {
          e.clipboardData.setData('text/plain', textRepresentation);
        }
        e.preventDefault();
        setAnnouncement('Copied annotation element.');
      }
    };

    const handlePaste = (e) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        return;
      }

      if (!copiedElementRef.current) return;
      e.preventDefault();

      const id = uniqueId();
      const original = copiedElementRef.current;
      const clone = {
        ...original,
        id,
        left: Math.min(90, original.left + 4),
        top: Math.min(90, original.top + 4)
      };

      setElements((prev) => [...prev, clone]);
      setActiveElementId(id);
      logAction('DUPLICATE_ELEMENT', id, original.pageIndex, `Duplicated ${original.type}`);
      setAnnouncement('Pasted cloned element.');
    };

    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
    };
  }, [activeElementId, elements]);

  // Apply signing and export PDF
  const handleSavePdf = async () => {
    if (!file) return;
    setStatus('signing');
    setProgress(0);
    setAnnouncement('Writing signatures and text layers into PDF...');

    try {
      const signedBlob = await signPdf(file, elements, (p) => setProgress(p));

      const url = URL.createObjectURL(signedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signed_${file.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus('editing');
      setAnnouncement('PDF signed successfully! Download started.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Failed to write and export PDF document.');
    }
  };

  const reset = () => {
    clearDraft();
    fileBytesRef.current = null;
    setFile(null);
    setPdfDocument(null);
    setElements([]);
    setActionHistory([]);
    setActiveElementId(null);
    setStatus('idle');
    setProgress(0);
    setAnnouncement('Cleared workspace.');
  };

  const hasFiles = !!file;

  return (
    <BasePdfTool hasFiles={hasFiles} onFilesAdded={handleFilesAdded} multiple={false}>
      {hasFiles && status !== 'loading' && (
        <div className={`sign-workspace ${isPseudoFullscreen ? 'pseudo-fullscreen' : ''}`} ref={workspaceRef}>
          
          {/* Header Controls */}
          <div className="list-header" style={{ width: '100%' }}>
            <span className="list-count" style={{ fontWeight: '600' }}>
              Signing: {file.name}
            </span>
          </div>

          {status === 'editing' && (
            <>
              {/* Floating Toolbar Component */}
              <FloatingToolbar
                selectedTool={selectedTool}
                setSelectedTool={setSelectedTool}
                setAnnouncement={setAnnouncement}
                savedSignatures={savedSignatures}
                activeSignature={activeSignature}
                setActiveSignature={setActiveSignature}
                onDeleteSavedSignature={deleteSavedSignature}
                setDialogOpen={setDialogOpen}
                setUndoModalOpen={setUndoModalOpen}
                actionHistory={actionHistory}
                toggleFullscreen={toggleFullscreen}
                isFullscreen={isFullscreen || isPseudoFullscreen}
                setConfirmResetOpen={setConfirmResetOpen}
                onSavePdf={handleSavePdf}
              />

              {/* PDF Pages rendering container */}
              <div className="sign-pages-container" onClick={() => setActiveElementId(null)}>
                {Array.from({ length: numPages }).map((_, pageIdx) => {
                  const size = pageSizes[pageIdx] || { width: 612, height: 792 };
                  
                  return (
                    <div
                      key={pageIdx}
                      ref={(el) => (pageWrapperRefs.current[pageIdx] = el)}
                      className="sign-page-wrapper"
                      style={{ aspectRatio: `${size.width} / ${size.height}` }}
                    >
                      <PdfPageCanvas
                        pdfDocument={pdfDocument}
                        pageNum={pageIdx + 1}
                      />
                      
                      <div
                        className="sign-page-overlay"
                        onClick={(e) => handlePageClick(e, pageIdx)}
                        onMouseDown={(e) => handleOverlayPointerDown(e, pageIdx)}
                        onTouchStart={(e) => handleOverlayPointerDown(e, pageIdx)}
                      >
                        {elements
                          .filter((el) => el.pageIndex === pageIdx)
                          .map((el) => (
                            <DraggableOverlayElement
                              key={el.id}
                              element={el}
                              isActive={activeElementId === el.id}
                              onSelect={(e) => {
                                e.stopPropagation();
                                setActiveElementId(el.id);
                              }}
                              onChange={(fields) => {
                                updateElement(el.id, fields);
                                if (fields.color) rememberColor(fields.color);
                                if (fields.fontFamily) rememberFont(fields.fontFamily);
                                if (fields.fontSize) rememberFontSize(fields.fontSize);
                                if (fields.textDirection) rememberDirection(fields.textDirection);
                              }}
                              onDelete={() => deleteElement(el.id)}
                              onClone={(cloneInfo) => {
                                 setElements((prev) => [...prev, cloneInfo]);
                                 setActiveElementId(cloneInfo.id);
                                 logAction('DUPLICATE_ELEMENT', cloneInfo.id, cloneInfo.pageIndex, `Duplicated ${cloneInfo.type}`);
                              }}
                              pageWidthPoints={size.width}
                            />
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Complete signing button */}
              <button
                type="button"
                className="merge-button"
                style={{ marginTop: '2rem' }}
                onClick={handleSavePdf}
              >
                Download
              </button>
            </>
          )}

          {/* Signing state */}
          {status === 'signing' && (
            <div style={{ textAlign: 'center', width: '100%', padding: '3rem 0' }}>
              <span className="merge-button-progress" style={{ color: 'var(--color-text)' }}>
                <svg className="progress-ring" width="22" height="22" viewBox="0 0 40 40">
                  <circle className="progress-ring-track" cx="20" cy="20" r="18" stroke="var(--color-border-strong)" />
                </svg>
                Saving document layers… {Math.round(progress * 100)}%
              </span>
            </div>
          )}


          {/* Error Message */}
          {status === 'error' && (
            <div className="error-message" role="alert" style={{ width: '100%' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
                <path d="M12 8v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
              <span>
                <strong>Signing failed.</strong> The PDF may be password-protected or encrypted.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {status === 'loading' && (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <p style={{ color: 'var(--color-muted)', fontWeight: '600' }}>Loading PDF document...</p>
        </div>
      )}

      {/* Signature Creation Modal Component */}
      <SignatureDialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setTempPlacement(null);
        }}
        onSaveSignature={handleAddSignatureElement}
      />

      {/* Undo History Modal */}
      <dialog
        ref={undoDialogRef}
        className="sig-dialog"
        onClose={() => setUndoModalOpen(false)}
        onClick={(e) => { if (e.target === e.currentTarget) setUndoModalOpen(false); }}
        aria-labelledby="undo-dialog-title"
      >
            <div className="sig-dialog-header">
              <h3 id="undo-dialog-title">Undo changes</h3>
              <button type="button" className="sig-dialog-close" onClick={() => setUndoModalOpen(false)} aria-label="Close dialog">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
            
            <div className="sig-dialog-body" style={{ padding: '0.75rem 1.5rem 1.5rem' }}>
              <div className="undo-history-list">
                {actionHistory.map((action) => {
                   const time = new Date(action.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                   const isSelected = undoSelection.has(action.id);
                   return (
                     <label key={action.id} className="undo-history-item">
                       <input 
                         type="checkbox" 
                         checked={isSelected}
                         onChange={(e) => {
                            const newSet = new Set(undoSelection);
                            if (e.target.checked) newSet.add(action.id);
                            else newSet.delete(action.id);
                            setUndoSelection(newSet);
                         }} 
                       />
                       <div className="undo-history-details">
                         <span className="undo-history-desc">{action.description}</span>
                         <span className="undo-history-time">{time}</span>
                         <span className="undo-history-page">Page {action.pageIndex + 1}</span>
                       </div>
                     </label>
                   );
                })}
              </div>
            </div>
            
            <div className="sig-dialog-footer">
              <button
                type="button"
                className="sig-btn sig-btn-primary"
                style={{ background: 'var(--color-success)' }}
                onClick={handleRevertSelected}
                disabled={undoSelection.size === 0}
              >
                Revert selected
              </button>
            </div>
      </dialog>

      {/* Start-over confirmation */}
      <dialog
        ref={resetDialogRef}
        className="sig-dialog"
        style={{ maxWidth: '26rem' }}
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
            <div className="sig-dialog-body" style={{ padding: '0.5rem 1.5rem 1.25rem' }}>
              <p style={{ margin: 0, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                This clears the current document and removes your saved draft. Your annotations can’t be recovered afterwards.
              </p>
            </div>
            <div className="sig-dialog-footer">
              <button type="button" className="sig-btn sig-btn-secondary" onClick={() => {
                setConfirmResetOpen(false);
                setPendingFile(null);
              }}>
                Cancel
              </button>
              <button
                type="button"
                className="sig-btn sig-btn-primary"
                style={{ background: 'var(--color-danger)' }}
                onClick={async () => {
                  setConfirmResetOpen(false);
                  if (pendingFile) {
                    const bytes = await pendingFile.arrayBuffer();
                    loadStartedRef.current = true;
                    await loadPdf(pendingFile, bytes, {});
                    setPendingFile(null);
                  } else {
                    reset();
                  }
                }}
              >
                Discard &amp; start over
              </button>
            </div>
      </dialog>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
