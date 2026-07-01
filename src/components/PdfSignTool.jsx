import { useState, useRef, useEffect } from 'preact/hooks';
import SignaturePad from 'signature_pad';
import BasePdfTool from './BasePdfTool.jsx';
import ColorPicker from './ColorPicker.jsx';
import DraggableOverlayElement from './DraggableOverlayElement.jsx';
import PdfPageCanvas from './PdfPageCanvas.jsx';
import { getPdfjs, uniqueId, signPdf } from '../lib/sign.js';

const HANDWRITING_FONTS = [
  'Caveat',
  'Dancing Script',
  'Great Vibes',
  'Gveret Levin',
  'Pacifico',
  'Playpen Sans Hebrew',
  'Sacramento'
];

export default function PdfSignTool() {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageSizes, setPageSizes] = useState([]); // Array of { width, height } in PDF points
  const [elements, setElements] = useState([]);
  const [activeElementId, setActiveElementId] = useState(null);
  const [selectedTool, setSelectedTool] = useState(null); // 'text' | 'signature' | 'checkmark' | 'whiteout'
  const [status, setStatus] = useState('idle'); // idle | loading | editing | signing | done | error
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [actionHistory, setActionHistory] = useState([]);
  const [undoModalOpen, setUndoModalOpen] = useState(false);
  const [undoSelection, setUndoSelection] = useState(new Set());
  
  // Signature Dialog state
  const [signatureMode, setSignatureMode] = useState('draw'); // 'draw' | 'type' | 'upload'
  const [typedName, setTypedName] = useState('');
  const [typeFont, setTypeFont] = useState(HANDWRITING_FONTS[0]);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [penColor, setPenColor] = useState('#000000');
  const [penThickness, setPenThickness] = useState(2.5);
  const [announcement, setAnnouncement] = useState('');

  // Last color picked for any element, remembered across new placements
  const [lastColor, setLastColor] = useState('#000000');

  // Saved signatures and active signature state
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [activeSignature, setActiveSignature] = useState(null);
  const [showSigDropdown, setShowSigDropdown] = useState(false);

  // Upload signature state
  const [uploadImage, setUploadImage] = useState(null);
  const [processedUploadImage, setProcessedUploadImage] = useState(null);
  const [uploadAspectRatio, setUploadAspectRatio] = useState(1);
  const [removeBg, setRemoveBg] = useState(true);

  // Refs
  const pageWrapperRefs = useRef([]);
  const dialogRef = useRef(null);
  const canvasPadRef = useRef(null);
  const signaturePadRef = useRef(null);
  const downloadRef = useRef(null);
  const copiedElementRef = useRef(null);
  const workspaceRef = useRef(null);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Track fullscreen state (also covers exiting via Esc, not just our own button)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (workspaceRef.current?.requestFullscreen) {
      workspaceRef.current.requestFullscreen();
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

  // Focus download button on success
  useEffect(() => {
    if (status === 'done' && downloadRef.current) {
      downloadRef.current.focus();
    }
  }, [status]);

  // Clean up download URL when file changes or resetting
  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

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

  // Load last-used pen color/thickness from localStorage on mount
  useEffect(() => {
    try {
      const storedColor = localStorage.getItem('pdf-toolkit:penColor');
      if (storedColor) setPenColor(storedColor);
      const storedThickness = localStorage.getItem('pdf-toolkit:penThickness');
      if (storedThickness) setPenThickness(parseFloat(storedThickness));
    } catch (e) {
      console.error('Failed to load pen settings from localStorage:', e);
    }
  }, []);

  const rememberPenColor = (color) => {
    setPenColor(color);
    try {
      localStorage.setItem('pdf-toolkit:penColor', color);
    } catch (e) {
      console.error('Failed to persist pen color to localStorage:', e);
    }
  };

  const rememberPenThickness = (thickness) => {
    setPenThickness(thickness);
    try {
      localStorage.setItem('pdf-toolkit:penThickness', String(thickness));
    } catch (e) {
      console.error('Failed to persist pen thickness to localStorage:', e);
    }
  };

  // Remember the color last picked, shared across text/checkmark/signature, for future placements
  const rememberColor = (color) => {
    setLastColor(color);
    try {
      localStorage.setItem('pdf-toolkit:lastColor', color);
    } catch (e) {
      console.error('Failed to persist last color to localStorage:', e);
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

  // Handle outside clicks to close the signature dropdown
  useEffect(() => {
    if (!showSigDropdown) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.sign-tool-dropdown-container')) {
        setShowSigDropdown(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [showSigDropdown]);

  // Click handler for Signature button
  const handleSignatureBtnClick = () => {
    if (savedSignatures.length > 0) {
      setShowSigDropdown(!showSigDropdown);
    } else {
      setDialogOpen(true);
    }
  };

  // Select a saved signature
  const handleSelectSavedSignature = (sig) => {
    setActiveSignature(sig);
    setSelectedTool('signature');
    setShowSigDropdown(false);
    setAnnouncement('Signature tool active. Click anywhere on a page to place.');
  };

  // Handle image upload input & drag/drop
  const handleUploadFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadImage(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUploadFile(files[0]);
    }
  };

  const handleUploadDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleUploadFile(files[0]);
    }
  };

  const clearUpload = () => {
    setUploadImage(null);
    setProcessedUploadImage(null);
  };

  // Helper to remove solid white or light backgrounds
  const removeWhiteBackground = (ctx, width, height) => {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 215 && g > 215 && b > 215) {
        data[i + 3] = 0; // Set alpha to transparent
      }
    }
    ctx.putImageData(imgData, 0, 0);
  };

  // Process uploaded image (trim whitespace and remove background if enabled)
  useEffect(() => {
    if (!uploadImage) {
      setProcessedUploadImage(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      if (removeBg) {
        removeWhiteBackground(ctx, canvas.width, canvas.height);
      }

      const { dataUrl, aspectRatio } = trimCanvas(canvas);
      setProcessedUploadImage(dataUrl);
      setUploadAspectRatio(aspectRatio);
    };
    img.src = uploadImage;
  }, [uploadImage, removeBg]);

  // Handle native <dialog> open/close and Safari light-dismiss fallback
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (dialogOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }

    const handleBackdropClick = (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );

      if (!isDialogContent) {
        setDialogOpen(false);
      }
    };

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('click', handleBackdropClick);
    };
  }, [dialogOpen]);

  // Draw Mode - Initialize the SignaturePad (smoothed bezier strokes,
  // pressure-aware, handles its own pointer/touch events on the canvas)
  useEffect(() => {
    if (!(dialogOpen && canvasPadRef.current && signatureMode === 'draw')) return;

    const canvas = canvasPadRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);

    const pad = new SignaturePad(canvas, {
      penColor,
      minWidth: penThickness * 0.6,
      maxWidth: penThickness,
      backgroundColor: 'rgba(0,0,0,0)'
    });
    pad.addEventListener('endStroke', () => setHasDrawn(true));
    signaturePadRef.current = pad;
    setHasDrawn(false);

    return () => {
      pad.off();
      signaturePadRef.current = null;
    };
  }, [dialogOpen, signatureMode]);

  // Apply pen color/thickness changes to the live pad without resetting the canvas
  useEffect(() => {
    if (!signaturePadRef.current) return;
    signaturePadRef.current.penColor = penColor;
    signaturePadRef.current.minWidth = penThickness * 0.6;
    signaturePadRef.current.maxWidth = penThickness;
  }, [penColor, penThickness]);

  // Handle PDF file selection
  const handleFilesAdded = async (fileList) => {
    const incoming = Array.from(fileList);
    const pdfs = incoming.filter((f) => f.type === 'application/pdf');
    
    if (pdfs.length === 0) {
      setAnnouncement('Please select a valid PDF file.');
      return;
    }
    
    const selected = pdfs[0];
    setFile(selected);
    setStatus('loading');
    setProgress(0);
    setElements([]);
    setActiveElementId(null);
    setSelectedTool(null);
    
    try {
      const lib = await getPdfjs();
      const bytes = await selected.arrayBuffer();
      const doc = await lib.getDocument({ data: bytes }).promise;
      
      setPdfDocument(doc);
      setNumPages(doc.numPages);
      
      // Load all pages to read sizes
      const sizes = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const { width, height } = page.getViewport({ scale: 1.0 });
        sizes.push({ width, height });
      }
      setPageSizes(sizes);
      setStatus('editing');
      setAnnouncement(`Loaded PDF "${selected.name}" with ${doc.numPages} pages.`);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Failed to load PDF file.');
    }
  };



  // Place element on current page click
  const handlePageClick = (e, pageIndex) => {
    if (!selectedTool) return;
    if (selectedTool === 'whiteout') return; // Handled by pointer events
    e.stopPropagation();
    
    // Ignore clicks if clicking on a active element to edit it
    if (e.target.closest('.sign-element')) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const leftPercent = (x / rect.width) * 100;
    const topPercent = (y / rect.height) * 100;
    
    if (selectedTool === 'text') {
      const id = uniqueId();
      const newEl = {
        id,
        type: 'text',
        pageIndex,
        left: leftPercent,
        top: topPercent,
        text: '',
        fontSize: 12, // in PDF points
        fontFamily: 'Helvetica',
        fontWeight: 'normal',
        fontStyle: 'normal',
        color: lastColor
      };
      setElements((prev) => [...prev, newEl]);
      setActiveElementId(id);
      logAction('ADD_TEXT', id, pageIndex, 'Added text box');
      setAnnouncement('Added text box. Click or double click to type.');
    } else if (selectedTool === 'checkmark') {
      const id = uniqueId();
      const newEl = {
        id,
        type: 'checkmark',
        pageIndex,
        left: leftPercent - 2.5,
        top: topPercent - 2.5,
        width: 5, // percentage
        height: 5, // percentage
        color: lastColor
      };
      setElements((prev) => [...prev, newEl]);
      setActiveElementId(id);
      logAction('ADD_CHECK', id, pageIndex, 'Added checkmark');
      setAnnouncement('Added checkmark.');
    } else if (selectedTool === 'signature') {
      if (activeSignature) {
        placeSignatureAt(activeSignature.dataUrl, activeSignature.aspectRatio, pageIndex, leftPercent, topPercent);
      } else {
        // Save click location temporarily to place signature once generated
        setTempPlacement({ pageIndex, left: leftPercent, top: topPercent });
        setDialogOpen(true);
      }
    }
    
    setSelectedTool(null); // Reset active tool
  };

  const handleOverlayPointerDown = (e, pageIndex) => {
    if (selectedTool !== 'whiteout') return;
    if (e.target.closest('.sign-element')) return;
    e.stopPropagation();
    
    // Prevent default on mouse events to avoid selecting text, but let touch events be handled carefully
    if (!e.touches) e.preventDefault();

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const startLeftPercent = ((clientX - rect.left) / rect.width) * 100;
    const startTopPercent = ((clientY - rect.top) / rect.height) * 100;

    const id = uniqueId();
    const newEl = {
      id,
      type: 'whiteout',
      pageIndex,
      left: startLeftPercent,
      top: startTopPercent,
      width: 0,
      height: 0,
      color: '#ffffff'
    };
    
    setElements((prev) => [...prev, newEl]);
    setActiveElementId(id);

    const handlePointerMove = (moveEvent) => {
      const moveX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
      
      const widthPercent = ((moveX - clientX) / rect.width) * 100;
      const heightPercent = ((moveY - clientY) / rect.height) * 100;

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
      
      setElements((prev) => {
        const el = prev.find(e => e.id === id);
        if (el && el.width < 0.5 && el.height < 0.5) {
           return prev.map(e => e.id === id ? { ...e, left: startLeftPercent - 5, top: startTopPercent - 2, width: 10, height: 4 } : e);
        }
        return prev;
      });
      
      logAction('ADD_WHITEOUT', id, pageIndex, 'Added whiteout box');
      setAnnouncement('Added whiteout box.');
      setSelectedTool(null);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
  };


  const [tempPlacement, setTempPlacement] = useState(null);

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
    
    const heightPercent = widthPercent * aspectRatio * (pageWrapperWidth / pageWrapperHeight);
    
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
      // No default `color`: the ink color is already baked into dataUrl via the
      // pen picker (draw) or upload; `color` here would re-tint over it via
      // tintImageDataUrl, fighting whatever color the user actually drew with.
      // The per-element color picker can still override it after placement.
    };
    
    setElements((prev) => [...prev, newEl]);
    setActiveElementId(id);
    logAction('ADD_SIGNATURE', id, pageIdx, 'Added signature');
    setAnnouncement('Placed signature on page.');
  };

  // Add signature element from modal
  const handleAddSignatureElement = (dataUrl, aspectRatio) => {
    const placement = tempPlacement || { pageIndex: 0, left: 40, top: 40 };
    placeSignatureAt(dataUrl, aspectRatio, placement.pageIndex, placement.left, placement.top);
    setDialogOpen(false);
    setTempPlacement(null);
  };

  const clearDrawing = () => {
    signaturePadRef.current?.clear();
    setHasDrawn(false);
  };

  // Helper to trim empty space around drawings/typed text
  const trimCanvas = (canvas) => {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 8) { // opacity threshold
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    
    if (maxX < minX || maxY < minY) {
      return { dataUrl: canvas.toDataURL('image/png'), aspectRatio: canvas.height / canvas.width };
    }
    
    // Add small margin around cropped area
    const padding = 8;
    const croppedX = Math.max(0, minX - padding);
    const croppedY = Math.max(0, minY - padding);
    const croppedWidth = Math.min(width - croppedX, (maxX - minX) + padding * 2);
    const croppedHeight = Math.min(height - croppedY, (maxY - minY) + padding * 2);
    
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = croppedWidth;
    croppedCanvas.height = croppedHeight;
    
    const croppedCtx = croppedCanvas.getContext('2d');
    croppedCtx.drawImage(
      canvas, 
      croppedX, 
      croppedY, 
      croppedWidth, 
      croppedHeight, 
      0, 
      0, 
      croppedWidth, 
      croppedHeight
    );
    
    return {
      dataUrl: croppedCanvas.toDataURL('image/png'),
      aspectRatio: croppedHeight / croppedWidth
    };
  };

  // Save Signature Button Click
  const handleSaveSignature = () => {
    let finalDataUrl = null;
    let finalAspectRatio = 1;

    if (signatureMode === 'draw') {
      const canvas = canvasPadRef.current;
      if (!canvas) return;
      
      // Make a copy of drawing to trim (because trimming directly affects scaling coordinates)
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(canvas, 0, 0);
      
      const { dataUrl, aspectRatio } = trimCanvas(tempCanvas);
      finalDataUrl = dataUrl;
      finalAspectRatio = aspectRatio;
    } else if (signatureMode === 'type') {
      // Type signature mode
      if (!typedName.trim()) return;
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `44px '${typeFont}', cursive`;
      ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);
      
      const { dataUrl, aspectRatio } = trimCanvas(canvas);
      finalDataUrl = dataUrl;
      finalAspectRatio = aspectRatio;
    } else if (signatureMode === 'upload') {
      if (!processedUploadImage) return;
      finalDataUrl = processedUploadImage;
      finalAspectRatio = uploadAspectRatio;
    }

    if (finalDataUrl) {
      const newSig = saveNewSignature(finalDataUrl, finalAspectRatio);
      setActiveSignature(newSig);
      setSelectedTool('signature');
      handleAddSignatureElement(finalDataUrl, finalAspectRatio);
      
      // Reset signature creation dialog states
      clearDrawing();
      setTypedName('');
      clearUpload();
    }
  };

  // Update element position or content
  const updateElement = (id, fields) => {
    setElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, ...fields } : el))
    );
  };

  // Delete placed element
  const deleteElement = (id) => {
    setElements((prev) => prev.filter((el) => el.id !== id));
    setActiveElementId(null);
    setAnnouncement('Removed element.');
  };

  // Delete the active element via Backspace/Delete, unless the user is typing in a text field
  useEffect(() => {
    if (!activeElementId) return;
    const handleKeyDown = (e) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      deleteElement(activeElementId);
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
          return; // Let native text copy run if user has highlighted characters
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
        return; // Let native text paste run when focused in input box
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

      setDownloadUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(signedBlob);
      });
      setStatus('done');
      setAnnouncement('PDF signed successfully! Ready for download.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Failed to write and export PDF document.');
    }
  };

  const reset = () => {
    setFile(null);
    setPdfDocument(null);
    setElements([]);
    setActiveElementId(null);
    setStatus('idle');
    setProgress(0);
    setDownloadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setAnnouncement('Cleared workspace.');
  };

  const hasFiles = !!file;

  return (
    <BasePdfTool hasFiles={hasFiles} onFilesAdded={handleFilesAdded} multiple={false}>
      {hasFiles && status !== 'loading' && (
        <div className="sign-workspace" ref={workspaceRef}>
          
          {/* Header Controls */}
          <div className="list-header" style={{ width: '100%' }}>
            <span className="list-count" style={{ fontWeight: '600' }}>
              Signing: {file.name}
            </span>
            <button type="button" className="clear-all" onClick={reset}>
              Start over
            </button>
          </div>

          {status === 'editing' && (
            <>
              {/* Floating Toolbar */}
              <div className="sign-toolbar-container">
                <div className="sign-toolbar" role="toolbar" aria-label="PDF annotations">
                  <button
                    type="button"
                    className={`sign-tool-btn${selectedTool === 'text' ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedTool(selectedTool === 'text' ? null : 'text');
                      setAnnouncement('Text tool active. Click anywhere on a page to place.');
                    }}
                    title="Click here, then click a page to add text"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polyline points="4 7 4 4 20 4 20 7" />
                      <line x1="9" y1="20" x2="15" y2="20" />
                      <line x1="12" y1="4" x2="12" y2="20" />
                    </svg>
                    Text
                  </button>

                  <button
                    type="button"
                    className={`sign-tool-btn${selectedTool === 'checkmark' ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedTool(selectedTool === 'checkmark' ? null : 'checkmark');
                      setAnnouncement('Checkmark tool active. Click a page to place.');
                    }}
                    title="Click here, then click a page to tick checkboxes"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Check
                  </button>

                  <button
                    type="button"
                    className={`sign-tool-btn${selectedTool === 'whiteout' ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedTool(selectedTool === 'whiteout' ? null : 'whiteout');
                      setAnnouncement('Whiteout tool active. Click a page to place.');
                    }}
                    title="Click here, then click a page to hide text"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="3" y1="3" x2="21" y2="21" />
                    </svg>
                    Whiteout
                  </button>

                  <div className="sign-tool-dropdown-container">
                    <button
                      type="button"
                      className={`sign-tool-btn${selectedTool === 'signature' ? ' active' : ''}`}
                      onClick={handleSignatureBtnClick}
                      title="Click here to select or create a signature"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                      Signature
                    </button>

                    {showSigDropdown && (
                      <>
                        <div className="sign-dropdown-backdrop" onClick={() => setShowSigDropdown(false)} />
                        <div className="sign-dropdown-menu" role="menu">
                          <div className="sign-dropdown-list">
                            {savedSignatures.map((sig) => (
                              <div
                                key={sig.id}
                                className="sign-dropdown-item"
                                role="menuitem"
                                onClick={() => handleSelectSavedSignature(sig)}
                              >
                                <img src={sig.dataUrl} alt="Saved signature" />
                                <button
                                  type="button"
                                  className="sign-dropdown-item-delete"
                                  onClick={(e) => deleteSavedSignature(sig.id, e)}
                                  title="Delete signature"
                                  aria-label="Delete signature"
                                >
                                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                                    <path d="M4 4l8 8M12 4l-8 8" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            className="sign-dropdown-add-btn"
                            onClick={() => {
                              setShowSigDropdown(false);
                              setDialogOpen(true);
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            New Signature
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="sign-tool-separator" />
                  
                  <button
                    type="button"
                    className="sign-tool-btn"
                    onClick={() => setUndoModalOpen(true)}
                    title="Undo changes"
                    disabled={actionHistory.length === 0}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 7v6h6" />
                      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                    </svg>
                    Undo
                  </button>

                  <div className="sign-tool-separator" />

                  <button
                    type="button"
                    className="sign-tool-btn"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? 'Exit full screen' : 'Full screen'}
                  >
                    {isFullscreen ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                        <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                        <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                        <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                        <path d="M16 3h3a2 2 0 0 1 2 2v3" />
                        <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
                        <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                      </svg>
                    )}
                  </button>

                  <div className="sign-tool-separator" />

                  <button
                    type="button"
                    className="sign-tool-btn sign-tool-btn-download"
                    onClick={handleSavePdf}
                    title="Save your changes and download the signed PDF"
                  >
                    Download
                  </button>
                </div>
              </div>

              {/* Status Helper */}
              {selectedTool ? (
                <div className="sign-help-tip" role="status">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>Click anywhere on the PDF pages below to place your <strong>{selectedTool}</strong> layer.</span>
                </div>
              ) : (
                <div className="sign-help-tip" style={{ color: 'var(--color-muted-light)' }}>
                  <span>Tip: Select a tool above and click on the PDF to place, or drag existing items. Click outside item to deselect.</span>
                </div>
              )}

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
                              }}
                              onDelete={() => deleteElement(el.id)}
                              onClone={(cloneInfo) => {
                                 setElements((prev) => [...prev, cloneInfo]);
                                 setActiveElementId(cloneInfo.id);
                                 logAction('DUPLICATE_ELEMENT', cloneInfo.id, cloneInfo.pageIndex, `Duplicated ${cloneInfo.type}`);
                              }}
                              pageWidthPoints={size.width}
                              pageHeightPoints={size.height}
                              pageWrapperRef={pageWrapperRefs.current[pageIdx]}
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

          {/* Success Download button */}
          {status === 'done' && downloadUrl && (
            <div style={{ width: '100%', marginTop: '1rem' }}>
              <a
                ref={downloadRef}
                className="download-button"
                href={downloadUrl}
                download={`signed_${file.name}`}
              >
                <svg className="download-check" width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" className="check-circle" stroke="#fff" />
                  <path d="M7.5 12.5l3 3 6-6.5" className="check-mark" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                </svg>
                Download Signed PDF
              </a>
              <button type="button" className="start-over" onClick={reset}>
                Start over
              </button>
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

      {/* Signature Creation Modal */}
      <dialog ref={dialogRef} className="sig-dialog" closedby="any" aria-labelledby="dialog-title">
        <div className="sig-dialog-header">
          <h3 id="dialog-title">Create Signature</h3>
          <button type="button" className="sig-dialog-close" onClick={() => setDialogOpen(false)} aria-label="Close dialog">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="sig-dialog-body">
          <div className="sig-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={signatureMode === 'draw'}
              className={`sig-tab-btn${signatureMode === 'draw' ? ' active' : ''}`}
              onClick={() => setSignatureMode('draw')}
            >
              Draw
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={signatureMode === 'type'}
              className={`sig-tab-btn${signatureMode === 'type' ? ' active' : ''}`}
              onClick={() => setSignatureMode('type')}
            >
              Type
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={signatureMode === 'upload'}
              className={`sig-tab-btn${signatureMode === 'upload' ? ' active' : ''}`}
              onClick={() => setSignatureMode('upload')}
            >
              Upload
            </button>
          </div>

          {signatureMode === 'draw' && (
            <>
              <div className="sig-pen-controls">
                <ColorPicker value={penColor} onChange={rememberPenColor} title="Pen color" defaultColor="#000000" />
                <div className="sig-thickness-control">
                  <label htmlFor="sig-pen-thickness">Thickness</label>
                  <input
                    id="sig-pen-thickness"
                    type="range"
                    min="1"
                    max="6"
                    step="0.5"
                    value={penThickness}
                    onChange={(e) => rememberPenThickness(parseFloat(e.target.value))}
                  />
                </div>
              </div>
              <div className="sig-pad-wrapper">
                <canvas ref={canvasPadRef} className="sig-canvas" />
                <button type="button" className="sig-clear-btn" onClick={clearDrawing}>
                  Clear
                </button>
              </div>
            </>
          )}

          {signatureMode === 'type' && (
            <div className="sig-type-container">
              <input
                type="text"
                className="sig-type-input"
                placeholder="Type your name..."
                value={typedName}
                onInput={(e) => setTypedName(e.currentTarget.value)}
                autoFocus
              />
              <div className="sig-font-picker" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', justifyContent: 'center' }}>
                {HANDWRITING_FONTS.map(font => (
                  <button
                    key={font}
                    type="button"
                    className={`sig-font-btn ${typeFont === font ? 'active' : ''}`}
                    onClick={() => setTypeFont(font)}
                    style={{
                      fontFamily: `'${font}', cursive`,
                      fontSize: '1.2rem',
                      padding: '0.3rem 0.8rem',
                      border: `1px solid ${typeFont === font ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      background: typeFont === font ? 'var(--color-primary-soft)' : 'var(--color-surface)',
                      color: typeFont === font ? 'var(--color-primary)' : 'var(--color-text)',
                      cursor: 'pointer'
                    }}
                  >
                    {font}
                  </button>
                ))}
              </div>
              <div className="sig-type-preview" style={{ fontFamily: `'${typeFont}', cursive` }}>
                {typedName || 'Signature Preview'}
              </div>
            </div>
          )}

          {signatureMode === 'upload' && (
            <div className="sig-upload-container">
              {!uploadImage ? (
                <label className="sig-upload-dropzone" onDragOver={(e) => e.preventDefault()} onDrop={handleUploadDrop}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p>Drag & drop signature image here or click to choose</p>
                  <span>Supports PNG, JPG, SVG. Auto background transparency.</span>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleUploadChange}
                  />
                </label>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="sig-upload-preview">
                    {processedUploadImage ? (
                      <img src={processedUploadImage} alt="Uploaded signature preview" />
                    ) : (
                      <p style={{ color: 'var(--color-muted)', fontSize: '0.88rem' }}>Processing signature...</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="sig-upload-options">
                      <label>
                        <input
                          type="checkbox"
                          checked={removeBg}
                          onChange={(e) => setRemoveBg(e.target.checked)}
                        />
                        Remove white background
                      </label>
                    </div>
                    <button type="button" className="sig-clear-btn" style={{ position: 'static' }} onClick={clearUpload}>
                      Change Image
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sig-dialog-footer">
          <button type="button" className="sig-btn sig-btn-secondary" onClick={() => setDialogOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="sig-btn sig-btn-primary"
            onClick={handleSaveSignature}
            disabled={
              signatureMode === 'draw' ? !hasDrawn :
              signatureMode === 'type' ? !typedName.trim() :
              !processedUploadImage
            }
          >
            Save Signature
          </button>
        </div>
      </dialog>

      {/* Undo History Modal */}
      {undoModalOpen && (
        <>
          <div className="sign-dropdown-backdrop" style={{ zIndex: 999 }} onClick={() => setUndoModalOpen(false)} />
          <dialog open className="sig-dialog" style={{ position: 'fixed', top: '15vh', zIndex: 1000, margin: '0 auto' }} aria-labelledby="undo-dialog-title">
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
        </>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
