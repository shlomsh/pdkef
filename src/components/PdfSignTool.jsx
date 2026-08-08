import { useState, useRef, useEffect } from 'preact/hooks';
import BasePdfTool from './BasePdfTool.jsx';
import { SignToolProvider, useSignTool } from './SignTool/SignToolContext.jsx';
import PdfWorkspace from './SignTool/PdfWorkspace.jsx';
import SignatureDialog from './SignatureDialog.jsx';
import { uniqueId, seedUniqueId, signPdf } from '../lib/sign.js';
import { widthPercentToHeightPercent } from '../lib/coords.js';
import { DEFAULT_SYMBOL_WIDTH_PCT } from '../constants/signGeometry.js';
import { loadPdf as loadEditorPdf } from '../editor/workspace/loadPdf.ts';
import { useEditorDraftPersistence } from '../editor/workspace/useEditorDraftPersistence.js';
import { createActionEntry } from '../lib/actionHistory.js';
import { useUndoShortcut } from '../lib/useUndoShortcut.js';
import { usePdfShare } from '../lib/usePdfShare.js';
import UndoHistoryModal from './UndoHistoryModal.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { describeFile } from '../lib/format.js';

export default function PdfSignTool() {
  return (
    <SignToolProvider>
      <PdfSignToolInner />
    </SignToolProvider>
  );
}

function PdfSignToolInner() {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageSizes, setPageSizes] = useState([]); // Array of { width, height } in PDF points
  const { state: { selectedTool, elements, activeElementId, actionHistory }, dispatch } = useSignTool();
  const setSelectedTool = (tool) => dispatch({ type: 'SET_TOOL', payload: tool });
  const [status, setStatus] = useState('idle'); // idle | loading | editing | signing | done | error
  const [progress, setProgress] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [undoModalOpen, setUndoModalOpen] = useState(false);
  const [undoSelection, setUndoSelection] = useState(new Set());
  const [signatureToDelete, setSignatureToDelete] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const { canSharePdf, shareReady, prepare, clearPrepared, download, downloadPrepared, sharePrepared } = usePdfShare();

  // Last color picked for any element, remembered across new placements
  const [lastColor, setLastColor] = useState('#000000');

  // Last whiteout color picked, remembered across new placements
  const [lastWhiteoutColor, setLastWhiteoutColor] = useState('#ffffff');

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

  // Last symbol size (width as a % of page width), remembered across new
  // placements so repeated check marks on the same form keep the size the
  // user already dialed in instead of resetting to the default each time.
  const [lastSymbolWidth, setLastSymbolWidth] = useState(DEFAULT_SYMBOL_WIDTH_PCT);

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

  // A prepared export is only valid for the current annotation state. Any edit
  // requires a fresh PDF before it can be shared.
  useEffect(() => {
    clearPrepared();
  }, [file, elements, clearPrepared]);

  // Escape precedence while the undo history is open in full screen: close the
  // modal FIRST, and only let a subsequent Escape exit full screen. Without this
  // the browser's default Escape (exit fullscreen) and the dialog's own Escape
  // race, and full screen tends to win. Capturing it here also stops the global
  // tool/selection Escape handler firing on the same press. The confirmations
  // handle this for themselves inside ConfirmDialog.
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

  const logAction = (type, elId, pageIndex, description, snapshot = null) => {
    dispatch({
      type: 'ADD_ACTION_HISTORY',
      payload: createActionEntry(type, elId, pageIndex, description, snapshot)
    });
  };

  const handleRevertSelected = () => {
    const idsToRevert = Array.from(undoSelection);
    if (idsToRevert.length === 0) return;
    const revertedActions = actionHistory.filter(action => idsToRevert.includes(action.id));
    // Creation entries revert by removing the element they added; deletion
    // entries (snapshot set — see actionHistory.js) revert by restoring it.
    const idsToRemove = revertedActions.filter(a => !a.snapshot).map(a => a.elementId);
    const elementsToRestore = revertedActions.filter(a => a.snapshot).flatMap(a => a.snapshot);
    dispatch({
      type: 'SET_ELEMENTS',
      payload: elements.filter(el => !idsToRemove.includes(el.id)).concat(elementsToRestore)
    });
    dispatch({
      type: 'SET_ACTION_HISTORY',
      payload: actionHistory.filter(action => !idsToRevert.includes(action.id))
    });
    setUndoSelection(new Set());
    setUndoModalOpen(false);
    setAnnouncement('Reverted selected actions.');
  };

  // Cmd/Ctrl+Z: undo the single most recently logged action (see actionHistory.js).
  const undoLast = () => {
    if (actionHistory.length === 0) return;
    const lastAction = actionHistory[0];
    dispatch({ type: 'UNDO' });
    setUndoSelection((currentSelection) => {
      if (!currentSelection.has(lastAction.id)) return currentSelection;
      const newSet = new Set(currentSelection);
      newSet.delete(lastAction.id);
      return newSet;
    });
    setAnnouncement(`Undid: ${lastAction.description}`);
  };
  useUndoShortcut(undoLast);


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

  // Load last-used whiteout color from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pdf-toolkit:lastWhiteoutColor');
      if (stored) setLastWhiteoutColor(stored);
    } catch (e) {
      console.error('Failed to load last whiteout color from localStorage:', e);
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

  // Load last-used symbol width from localStorage on mount
  useEffect(() => {
    try {
      const stored = parseFloat(localStorage.getItem('pdf-toolkit:lastSymbolWidth'));
      if (Number.isFinite(stored) && stored > 0) setLastSymbolWidth(stored);
    } catch (e) {
      console.error('Failed to load last symbol width from localStorage:', e);
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

  // Remember the whiteout color last picked for future placements
  const rememberWhiteoutColor = (color) => {
    setLastWhiteoutColor(color);
    try {
      localStorage.setItem('pdf-toolkit:lastWhiteoutColor', color);
    } catch (e) {
      console.error('Failed to persist last whiteout color to localStorage:', e);
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

  // Remember the stroke thickness last picked for a shape, for future placements
  const rememberThickness = (strokeWidth) => {
    setLastThickness(strokeWidth);
  };

  // Remember the size a symbol was last resized to, for future placements
  const rememberSymbolWidth = (width) => {
    if (!Number.isFinite(width) || width <= 0) return;
    setLastSymbolWidth(width);
    try {
      localStorage.setItem('pdf-toolkit:lastSymbolWidth', String(width));
    } catch (e) {
      console.error('Failed to persist last symbol width to localStorage:', e);
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

  // Confirm delete saved signature
  const deleteSavedSignature = (id, e) => {
    if (e) e.stopPropagation();
    setSignatureToDelete(id);
  };

  const proceedDeleteSignature = () => {
    if (!signatureToDelete) return;
    const updated = savedSignatures.filter((sig) => sig.id !== signatureToDelete);
    setSavedSignatures(updated);
    try {
      localStorage.setItem('pdf-toolkit:signatures', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to persist signatures to localStorage:', e);
    }
    if (activeSignature && activeSignature.id === signatureToDelete) {
      const fallback = updated.length > 0 ? updated[0] : null;
      setActiveSignature(fallback);
      if (!fallback && selectedTool === 'signature') {
        setSelectedTool(null);
      }
    }
    setSignatureToDelete(null);
    setAnnouncement('Signature deleted.');
  };

  // Core loader shared by fresh file picks and draft restore. `bytes` is the source
  // PDF's ArrayBuffer; `preset` seeds restored elements/action history.
  const loadPdf = async (selected, bytes, preset = {}, restored = false) => {
    const presetElements = preset.elements || [];
    await loadEditorPdf({
      file: selected, bytes, restored, loadIdRef, clearDraft, setStatus, setAnnouncement,
      initialize: () => {
        setFile(selected);
        setProgress(0);
        dispatch({ type: 'SET_ELEMENTS', payload: presetElements });
        dispatch({ type: 'SET_ACTION_HISTORY', payload: preset.actionHistory || [] });
        dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
        dispatch({ type: 'SET_TOOL', payload: null });
        seedUniqueId(presetElements);
        fileBytesRef.current = bytes;
      },
      onDocument: async (doc, isCurrent) => {
        setPdfDocument(doc);
        setNumPages(doc.numPages);
        const sizes = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          if (!isCurrent()) return;
          const { width, height } = page.getViewport({ scale: 1.0 });
          sizes.push({ width, height });
        }
        if (!isCurrent()) return;
        setPageSizes(sizes);
      },
    });
  };

  // Handle PDF file selection
  const handleFilesAdded = async (fileList) => {
    const incoming = Array.from(fileList);
    const pdfs = incoming.filter((f) => f.type === 'application/pdf');

    if (pdfs.length === 0) {
      setAnnouncement('Please select a valid PDF file.');
      return;
    }

    // No confirmation branch here: BasePdfTool asks before a replacement that
    // would cost anything, so by the time a file reaches this handler the user
    // has already agreed to it (or there was nothing to agree to).
    const selected = pdfs[0];

    loadStartedRef.current = true;
    const bytes = await selected.arrayBuffer();
    await loadPdf(selected, bytes, {});
  };

  // Setup draft persistence hook
  const { clearDraft } = useEditorDraftPersistence({
    tool: 'sign',
    file,
    fileBytes: fileBytesRef.current,
    elements,
    actionHistory,
    status,
    loadStartedRef,
    loadPdf
  });

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
    
    dispatch({ type: 'ADD_ELEMENT', payload: newEl });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
    logAction('ADD_SIGNATURE', id, pageIdx, 'Added signature');
    setAnnouncement('Placed signature on page.');
  };

  // Add signature element from modal
  const handleAddSignatureElement = (dataUrl, aspectRatio) => {
    const newSig = saveNewSignature(dataUrl, aspectRatio);
    setActiveSignature(newSig);
    dispatch({ type: 'SET_TOOL', payload: 'signature' });
    
    const placement = tempPlacement || { pageIndex: 0, left: 40, top: 40 };
    placeSignatureAt(dataUrl, aspectRatio, placement.pageIndex, placement.left, placement.top);
    setDialogOpen(false);
    setTempPlacement(null);
  };

  // Delete placed element
  const deleteElement = (id) => {
    const el = elements.find(e => e.id === id);
    dispatch({ type: 'DELETE_ELEMENT', payload: id });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    if (el) logAction('DELETE_ELEMENT', id, el.pageIndex, `Deleted ${el.type}`, [el]);
    setAnnouncement('Removed element.');
  };

  // Global keyboard shortcuts (Escape, Undo, Delete)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Clear selected tool and active element on Escape
      if (e.key === 'Escape') {
        dispatch({ type: 'SET_TOOL', payload: null });
        dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
        document.activeElement?.blur();
        return;
      }

      const tag = document.activeElement?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

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

      dispatch({ type: 'ADD_ELEMENT', payload: clone });
      dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
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

  // Apply signing and prepare the PDF for sharing or downloading.
  const handleSavePdf = async () => {
    if (!file) return;
    setStatus('signing');
    setProgress(0);
    setAnnouncement('Writing signatures and text layers into PDF...');

    try {
      const signedBlob = await signPdf(file, elements, (p) => setProgress(p));
      const filename = `signed_${file.name}`;
      if (prepare(signedBlob, filename)) {
        // navigator.share() needs a fresh user activation. PDF generation is
        // asynchronous, so retain the File and let the next tap open the
        // native share sheet instead of risking a browser-blocked request.
        setStatus('editing');
        setAnnouncement('Your signed PDF is ready to share.');
        return;
      }

      download(signedBlob, filename);

      setStatus('editing');
      setAnnouncement('PDF signed successfully. Download started.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Failed to write and export PDF document.');
    }
  };

  const handleDownloadPdf = async () => {
    if (downloadPrepared()) {
      setAnnouncement('Download started.');
      return;
    }

    if (!file) return;
    setStatus('signing');
    setProgress(0);
    setAnnouncement('Writing signatures and text layers into PDF...');

    try {
      const signedBlob = await signPdf(file, elements, (p) => setProgress(p));
      download(signedBlob, `signed_${file.name}`);
      setStatus('editing');
      setAnnouncement('PDF signed successfully. Download started.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Failed to write and export PDF document.');
    }
  };

  const handleSharePdf = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') {
      setAnnouncement('PDF signed successfully.');
    } else if (result.status === 'canceled') {
      setAnnouncement('Sharing canceled. Your signed PDF is still ready to share.');
    } else if (result.status === 'error') {
      console.error(result.error);
      setAnnouncement('Could not open the share sheet. Please try again.');
    }
  };

  const hasFiles = !!file;

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      fileLabel={file?.name}
      fileMeta={describeFile(file, numPages)}
      draftSaved={status === 'editing'}
      hasWork={elements.length > 0}
      workNoun="your annotations"
      ownsShell
    >
      {hasFiles && status !== 'loading' && (
        <PdfWorkspace
          status={status}
          isPseudoFullscreen={isPseudoFullscreen}
          workspaceRef={workspaceRef}
          numPages={numPages}
          pageSizes={pageSizes}
          pdfDocument={pdfDocument}
          pageWrapperRefs={pageWrapperRefs}
          activeSignature={activeSignature}
          setTempPlacement={setTempPlacement}
          setDialogOpen={setDialogOpen}
          rememberColor={rememberColor}
          rememberWhiteoutColor={rememberWhiteoutColor}
          rememberFont={rememberFont}
          rememberFontSize={rememberFontSize}
          rememberDirection={rememberDirection}
          rememberThickness={rememberThickness}
          rememberSymbolWidth={rememberSymbolWidth}
          lastSymbolWidth={lastSymbolWidth}
          lastColor={lastColor}
          lastWhiteoutColor={lastWhiteoutColor}
          lastThickness={lastThickness}
          lastFont={lastFont}
          lastFontSize={lastFontSize}
          lastDirection={lastDirection}
          logAction={logAction}
          handleSavePdf={handleSavePdf}
          handleDownloadPdf={handleDownloadPdf}
          handleSharePdf={handleSharePdf}
          setAnnouncement={setAnnouncement}
          savedSignatures={savedSignatures}
          setActiveSignature={setActiveSignature}
          onDeleteSavedSignature={deleteSavedSignature}
          setUndoModalOpen={setUndoModalOpen}
          toggleFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
          placeSignatureAt={placeSignatureAt}
          canSharePdf={canSharePdf}
          shareReady={shareReady}
        />
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

      <UndoHistoryModal
        open={undoModalOpen}
        onClose={() => setUndoModalOpen(false)}
        actionHistory={actionHistory}
        undoSelection={undoSelection}
        setUndoSelection={setUndoSelection}
        onRevertSelected={handleRevertSelected}
      />

      <ConfirmDialog
        open={!!signatureToDelete}
        titleId="confirm-delete-title"
        title="Delete signature?"
        confirmLabel="Delete signature"
        onCancel={() => setSignatureToDelete(null)}
        onConfirm={proceedDeleteSignature}
      >
        Are you sure you want to delete this saved signature? This action cannot be undone.
      </ConfirmDialog>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
