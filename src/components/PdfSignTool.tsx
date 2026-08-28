import { useState, useRef, useEffect } from 'preact/hooks';
import type { EditorElement } from '../lib/editorModel.ts';
import BasePdfTool from './BasePdfTool.tsx';
import { SignToolProvider, useSignTool } from './SignTool/SignToolContext.tsx';
import { SignDefaultsContext } from './SignTool/SignDefaultsContext.tsx';
import { SavedSignaturesContext } from './SignTool/SavedSignaturesContext.tsx';
import PdfWorkspace from './SignTool/PdfWorkspace.tsx';
import SignatureDialog from './SignatureDialog.tsx';
import { uniqueId, seedUniqueId, signPdf, UnrepresentableTextError } from '../lib/sign.js';
import { describeUnrepresentableText } from '../lib/textCoverage.js';
import { widthPercentToHeightPercent } from '../lib/coords.js';
import { DEFAULT_SYMBOL_WIDTH_PCT, DEFAULT_START_WIDTH_PCT } from '../constants/signGeometry.js';
import { loadPdf as loadEditorPdf } from '../editor/workspace/loadPdf.ts';
import { useEditorDraftPersistence } from '../editor/workspace/useEditorDraftPersistence.ts';
import { createActionEntry } from '../lib/actionHistory.js';
import { useUndoShortcut } from '../lib/useUndoShortcut.js';
import { usePdfShare } from '../lib/usePdfShare.js';
import UndoHistoryModal from './UndoHistoryModal.tsx';
import ConfirmDialog from './ConfirmDialog.tsx';
import { describeFile } from '../lib/format.js';
import useCurrentPage from '../lib/useCurrentPage.js';

// Recoverable export failures keep the editor open. Name unsupported text
// precisely; other failures explain that the user can retry without losing
// their edits. Document-load errors use the workspace's separate default copy.
function describeSignFailure(err: unknown): string {
  if (err instanceof UnrepresentableTextError) {
    // Worded by textCoverage.js, the same module the while-typing warning
    // reads from, so the heads-up and the refusal can never name different
    // characters or point at different pages.
    return describeUnrepresentableText(err.characters, err.pageNumbers ?? [], { saving: true });
  }
  return 'Could not export the PDF. Your edits are still here. Try again.';
}

export default function PdfSignTool() {
  return (
    <SignToolProvider>
      <PdfSignToolInner />
    </SignToolProvider>
  );
}

function PdfSignToolInner() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[]>([]); // Array of { width, height } in PDF points
  const { state: { selectedTool, elements, activeElementId, editingElementId, actionHistory }, dispatch } = useSignTool();
  const setSelectedTool = (tool: string | null) => dispatch({ type: 'SET_TOOL', payload: tool });
  const [status, setStatus] = useState('idle'); // idle | loading | editing | signing | done | error
  // Export errors are recoverable without unmounting the editor. A failed
  // document load still uses status='error' with the workspace's load copy.
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [undoModalOpen, setUndoModalOpen] = useState(false);
  const [undoSelection, setUndoSelection] = useState<Set<string>>(new Set());
  const [signatureToDelete, setSignatureToDelete] = useState<string | null>(null);
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
  const [lastDirection, setLastDirection] = useState<string | null>(null);

  // Last chosen stroke thickness, remembered across new placements
  const [lastThickness, setLastThickness] = useState(3);

  // Last symbol size (width as a % of page width), remembered across new
  // placements so repeated check marks on the same form keep the size the
  // user already dialed in instead of resetting to the default each time.
  const [lastSymbolWidth, setLastSymbolWidth] = useState(DEFAULT_SYMBOL_WIDTH_PCT);

  // Last symbol mark (check/x/dot) picked, remembered across new placements so
  // switching to X for one field doesn't silently reset to check for the next
  const [lastSymbolMark, setLastSymbolMark] = useState('check');

  // Last signature size (width as a % of page width), remembered across new
  // placements so dropping the same signature repeatedly on a form keeps the
  // size the user already dialed in instead of resetting to the default each time.
  const [lastSignatureWidth, setLastSignatureWidth] = useState(DEFAULT_START_WIDTH_PCT);

  // Saved signatures and active signature state
  const [savedSignatures, setSavedSignatures] = useState<any[]>([]);
  const [activeSignature, setActiveSignature] = useState<any>(null);

  // Refs
  // Live DOM nodes for each page wrapper, read imperatively at event time (e.g.
  // placeSignatureAt reads getBoundingClientRect to size a dropped signature).
  // These are NOT passed to overlay elements for sizing — each element measures its
  // own container via the DOM instead (see DraggableOverlayElement), so there's no
  // render-time dependency on this array being populated yet.
  const pageWrapperRefs = useRef<(HTMLDivElement | null)[]>([]);
  const copiedElementRef = useRef<any>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const fileBytesRef = useRef<ArrayBuffer | null>(null);
  const loadIdRef = useRef(0);
  // Whichever of {manual file pick, draft restore} happens first (in call order) wins
  // outright; the other is skipped entirely. This closes the gap the loadId guard alone
  // doesn't cover: a slow draft restore that resolves *after* a fast manual pick has
  // already finished editing would otherwise still be "the newer call" and clobber it.
  const loadStartedRef = useRef(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [tempPlacement, setTempPlacement] = useState<any>(null);
  const isFullscreenActive = isFullscreen || isPseudoFullscreen;
  const currentPage = useCurrentPage({
    active: isFullscreenActive,
    rootRef: workspaceRef,
    pageRefs: pageWrapperRefs,
    numPages,
  });

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
    const onEsc = (e: KeyboardEvent) => {
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

  const logAction = (type: string, elId: string, pageIndex: number, description: string, snapshot: any = null) => {
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
      const stored = parseFloat(localStorage.getItem('pdf-toolkit:lastSymbolWidth') || '');
      if (Number.isFinite(stored) && stored > 0) setLastSymbolWidth(stored);
    } catch (e) {
      console.error('Failed to load last symbol width from localStorage:', e);
    }
  }, []);

  // Load last-used symbol mark from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pdf-toolkit:lastSymbolMark');
      if (stored === 'check' || stored === 'x' || stored === 'dot') setLastSymbolMark(stored);
    } catch (e) {
      console.error('Failed to load last symbol mark from localStorage:', e);
    }
  }, []);

  // Load last-used signature width from localStorage on mount
  useEffect(() => {
    try {
      const stored = parseFloat(localStorage.getItem('pdf-toolkit:lastSignatureWidth') || '');
      if (Number.isFinite(stored) && stored > 0) setLastSignatureWidth(stored);
    } catch (e) {
      console.error('Failed to load last signature width from localStorage:', e);
    }
  }, []);

  // Remember the color last picked, shared across text/symbol/signature, for future placements
  const rememberColor = (color: string) => {
    setLastColor(color);
    try {
      localStorage.setItem('pdf-toolkit:lastColor', color);
    } catch (e) {
      console.error('Failed to persist last color to localStorage:', e);
    }
  };

  // Remember the whiteout color last picked for future placements
  const rememberWhiteoutColor = (color: string) => {
    setLastWhiteoutColor(color);
    try {
      localStorage.setItem('pdf-toolkit:lastWhiteoutColor', color);
    } catch (e) {
      console.error('Failed to persist last whiteout color to localStorage:', e);
    }
  };

  // Remember the font last picked for a text element, for future placements
  const rememberFont = (fontFamily: string) => {
    setLastFont(fontFamily);
    try {
      localStorage.setItem('pdf-toolkit:lastFont', fontFamily);
    } catch (e) {
      console.error('Failed to persist last font to localStorage:', e);
    }
  };

  // Remember the font size last picked for a text element, for future placements
  const rememberFontSize = (fontSize: number) => {
    setLastFontSize(fontSize);
    try {
      localStorage.setItem('pdf-toolkit:lastFontSize', String(fontSize));
    } catch (e) {
      console.error('Failed to persist last font size to localStorage:', e);
    }
  };

  // Remember the stroke thickness last picked for a shape, for future placements
  const rememberThickness = (strokeWidth: number) => {
    setLastThickness(strokeWidth);
  };

  // Remember the size a symbol was last resized to, for future placements
  const rememberSymbolWidth = (width: number) => {
    if (!Number.isFinite(width) || width <= 0) return;
    setLastSymbolWidth(width);
    try {
      localStorage.setItem('pdf-toolkit:lastSymbolWidth', String(width));
    } catch (e) {
      console.error('Failed to persist last symbol width to localStorage:', e);
    }
  };

  // Remember the mark last chosen for a symbol, for future placements
  const rememberSymbolMark = (mark: string) => {
    setLastSymbolMark(mark);
    try {
      localStorage.setItem('pdf-toolkit:lastSymbolMark', mark);
    } catch (e) {
      console.error('Failed to persist last symbol mark to localStorage:', e);
    }
  };

  // Remember the size a signature was last resized to, for future placements
  const rememberSignatureWidth = (width: number) => {
    if (!Number.isFinite(width) || width <= 0) return;
    setLastSignatureWidth(width);
    try {
      localStorage.setItem('pdf-toolkit:lastSignatureWidth', String(width));
    } catch (e) {
      console.error('Failed to persist last signature width to localStorage:', e);
    }
  };

  // Remember the text direction last manually toggled, for future placements
  const rememberDirection = (textDirection: string) => {
    setLastDirection(textDirection);
    try {
      localStorage.setItem('pdf-toolkit:lastDirection', textDirection);
    } catch (e) {
      console.error('Failed to persist last text direction to localStorage:', e);
    }
  };

  // Save new signature to list & localStorage
  const saveNewSignature = (dataUrl: string, aspectRatio: number) => {
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
  const deleteSavedSignature = (id: string, e?: any) => {
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
  const loadPdf = async (selected: File, bytes: ArrayBuffer, preset: any = {}, restored = false) => {
    const presetElements = preset.elements || [];
    await loadEditorPdf({
      file: selected, bytes, restored, loadIdRef, clearDraft, setStatus, setAnnouncement,
      initialize: () => {
        setFile(selected);
        setErrorDetail(null);
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
  const handleFilesAdded = async (fileList: FileList | File[]) => {
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
  const { clearDraft, isRestoring } = useEditorDraftPersistence({
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
  const placeSignatureAt = (dataUrl: string, aspectRatio: number, pageIdx: number, leftPercent: number, topPercent: number) => {
    const id = uniqueId();
    // Width defaults to whatever the last placed/resized signature used, so
    // consecutive placements of the same signature keep its size instead of
    // resetting to the default every time.
    const widthPercent = lastSignatureWidth;

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
  const handleAddSignatureElement = (dataUrl: string, aspectRatio: number) => {
    const newSig = saveNewSignature(dataUrl, aspectRatio);
    setActiveSignature(newSig);
    dispatch({ type: 'SET_TOOL', payload: 'signature' });
    
    const placement = tempPlacement || { pageIndex: 0, left: 40, top: 40 };
    placeSignatureAt(dataUrl, aspectRatio, placement.pageIndex, placement.left, placement.top);
    // The dialog both creates and places the signature, so that counts as the
    // tool's one placement - same as a click-placement on the page overlay.
    dispatch({ type: 'DISARM_TOOL' });
    setDialogOpen(false);
    setTempPlacement(null);
  };

  // Delete placed element
  const deleteElement = (id: string) => {
    const el = elements.find(e => e.id === id);
    dispatch({ type: 'DELETE_ELEMENT', payload: id });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    if (el) logAction('DELETE_ELEMENT', id, el.pageIndex, `Deleted ${el.type}`, [el]);
    setAnnouncement('Removed element.');
  };

  // Global keyboard shortcuts (Escape, Undo, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape unwinds one level at a time: out of the text box first, then out
      // of the selection and tool. Collapsing both into one press would make it
      // impossible to go from typing to "this box is selected", which is the
      // state Backspace-to-delete needs.
      if (e.key === 'Escape') {
        if (editingElementId) {
          dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: null });
          (document.activeElement as HTMLElement | null)?.blur();
          setAnnouncement('Finished editing. Press Backspace to delete this box.');
          return;
        }
        dispatch({ type: 'SET_TOOL', payload: null });
        dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
        (document.activeElement as HTMLElement | null)?.blur();
        return;
      }

      const tag = document.activeElement?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      // Enter opens an edit session on a selected text box - the keyboard's
      // equivalent of double-clicking it, so text stays reachable without a
      // pointer.
      if (e.key === 'Enter' && activeElementId && !editingElementId && !isInput) {
        const selected = elements.find(el => el.id === activeElementId);
        if (selected?.type === 'text') {
          e.preventDefault();
          dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: activeElementId });
        }
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
  }, [activeElementId, editingElementId, elements]);

  // Handle element copy and paste actions
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        const activeInput = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
        const selStart = activeInput.selectionStart;
        const selEnd = activeInput.selectionEnd;
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

    const handlePaste = (e: ClipboardEvent) => {
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
    setErrorDetail(null);
    setStatus('signing');
    setProgress(0);
    setAnnouncement('Writing signatures and text layers into PDF...');

    try {
      const signedBlob = await signPdf(file, elements, (p: number) => setProgress(p));
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
      setStatus('editing');
      const detail = describeSignFailure(err);
      setErrorDetail(detail);
      setAnnouncement(`Signing stopped. ${detail}`);
    }
  };

  const handleDownloadPdf = async () => {
    setErrorDetail(null);
    if (downloadPrepared()) {
      setAnnouncement('Download started.');
      return;
    }

    if (!file) return;
    setStatus('signing');
    setProgress(0);
    setAnnouncement('Writing signatures and text layers into PDF...');

    try {
      const signedBlob = await signPdf(file, elements, (p: number) => setProgress(p));
      download(signedBlob, `signed_${file.name}`);
      setStatus('editing');
      setAnnouncement('PDF signed successfully. Download started.');
    } catch (err) {
      console.error(err);
      setStatus('editing');
      const detail = describeSignFailure(err);
      setErrorDetail(detail);
      setAnnouncement(`Signing stopped. ${detail}`);
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
      fileMeta={describeFile(file, numPages, isFullscreenActive ? currentPage : null)}
      draftSaved={status === 'editing'}
      hasWork={elements.length > 0}
      workNoun="your annotations"
      ownsShell
      checkingDraft={isRestoring}
    >
      {hasFiles && status !== 'loading' && (
        <SignDefaultsContext.Provider
          value={{
            lastColor, lastWhiteoutColor, lastFont, lastFontSize, lastDirection, lastThickness, lastSymbolWidth, lastSymbolMark, lastSignatureWidth,
            rememberColor, rememberWhiteoutColor, rememberFont, rememberFontSize, rememberDirection, rememberThickness, rememberSymbolWidth, rememberSymbolMark, rememberSignatureWidth
          }}
        >
          <SavedSignaturesContext.Provider
            value={{ savedSignatures, activeSignature, setActiveSignature, onDeleteSavedSignature: deleteSavedSignature }}
          >
            <PdfWorkspace
              status={status}
              isPseudoFullscreen={isPseudoFullscreen}
              workspaceRef={workspaceRef}
              numPages={numPages}
              pageSizes={pageSizes}
              pdfDocument={pdfDocument}
              pageWrapperRefs={pageWrapperRefs}
              setTempPlacement={setTempPlacement}
              setDialogOpen={setDialogOpen}
              logAction={logAction}
              handleSavePdf={handleSavePdf}
              handleDownloadPdf={handleDownloadPdf}
              handleSharePdf={handleSharePdf}
              setAnnouncement={setAnnouncement}
              setUndoModalOpen={setUndoModalOpen}
              toggleFullscreen={toggleFullscreen}
              isFullscreen={isFullscreen}
              placeSignatureAt={placeSignatureAt}
              canSharePdf={canSharePdf}
              shareReady={shareReady}
              errorDetail={errorDetail}
            />
          </SavedSignaturesContext.Provider>
        </SignDefaultsContext.Provider>
      )}

      {/* No loading-state message: pdf.js parses fast enough that a text block
          here just added its own undersized-then-replaced flicker (see
          Workspace.module.css's fade-in on .workspace, which softens the real
          jump from nothing to a loaded document instead). */}

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
