import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import BasePdfTool from './BasePdfTool.jsx';
import { PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// Dynamic loader for PDFJS
let pdfjsLib;
async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
  }
  return pdfjsLib;
}

let nextId = 0;
function uniqueId() {
  return `el-${nextId++}`;
}

function hexToRgbFractions(hex, fallback = '#000000') {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || fallback);
  const r = result ? parseInt(result[1], 16) / 255 : 0;
  const g = result ? parseInt(result[2], 16) / 255 : 0;
  const b = result ? parseInt(result[3], 16) / 255 : 0;
  return { r, g, b };
}

// Recolors a signature PNG's ink while preserving its alpha shape (drawn/typed
// signatures are opaque strokes on a transparent background).
function tintImageDataUrl(dataUrl, hexColor) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = hexColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export default function PdfSignTool() {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageSizes, setPageSizes] = useState([]); // Array of { width, height } in PDF points
  const [elements, setElements] = useState([]);
  const [activeElementId, setActiveElementId] = useState(null);
  const [selectedTool, setSelectedTool] = useState(null); // 'text' | 'signature' | 'checkmark'
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
  const isDrawingRef = useRef(false);
  const lastDrawingPos = useRef({ x: 0, y: 0 });
  const downloadRef = useRef(null);
  const copiedElementRef = useRef(null);

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

  // Draw Mode - Initialize Canvas
  useEffect(() => {
    if (dialogOpen && canvasPadRef.current && signatureMode === 'draw') {
      const canvas = canvasPadRef.current;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penThickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      setHasDrawn(false);
    }
  }, [dialogOpen, signatureMode]);

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

  // Drawing Pad Canvas coordinates helper
  const getDrawingPointerPos = (e) => {
    const canvas = canvasPadRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  // Smooth drawing handler
  const startDrawing = (e) => {
    e.preventDefault();
    const canvas = canvasPadRef.current;
    if (!canvas) return;
    
    const pos = getDrawingPointerPos(e);
    lastDrawingPos.current = pos;
    isDrawingRef.current = true;
    setHasDrawn(true);
    
    const ctx = canvas.getContext('2d');

    // Draw dot on click/tap
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, penThickness / 2, 0, Math.PI * 2);
    ctx.fillStyle = penColor;
    ctx.fill();

    const draw = (moveEvent) => {
      if (!isDrawingRef.current) return;
      moveEvent.preventDefault();
      const newPos = getDrawingPointerPos(moveEvent);

      ctx.beginPath();
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penThickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(lastDrawingPos.current.x, lastDrawingPos.current.y);
      ctx.lineTo(newPos.x, newPos.y);
      ctx.stroke();

      lastDrawingPos.current = newPos;
    };

    const stopDrawing = () => {
      isDrawingRef.current = false;
      window.removeEventListener('mousemove', draw);
      window.removeEventListener('mouseup', stopDrawing);
      window.removeEventListener('touchmove', draw);
      window.removeEventListener('touchend', stopDrawing);
    };

    window.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);
    window.addEventListener('touchmove', draw, { passive: false });
    window.addEventListener('touchend', stopDrawing);
  };

  const clearDrawing = () => {
    const canvas = canvasPadRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
      ctx.font = "italic 44px 'Brush Script MT', 'Dancing Script', 'Caveat', 'Segoe Script', cursive";
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
      const bytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes);
      pdfDoc.registerFontkit(fontkit);
      
      const loadedFonts = {};
      const loadCustomFont = async (fontFamily, fontWeight, fontStyle) => {
        let styleStr = 'Regular';
        if (fontWeight === 'bold' && fontStyle === 'italic') styleStr = 'BoldItalic';
        else if (fontWeight === 'bold') styleStr = 'Bold';
        else if (fontStyle === 'italic') styleStr = 'Italic';
        const fileName = `${fontFamily}-${styleStr}.ttf`;
        
        if (loadedFonts[fileName]) return loadedFonts[fileName];
        
        try {
          const res = await fetch(`/fonts/${fileName}`);
          const fontBytes = await res.arrayBuffer();
          const customFont = await pdfDoc.embedFont(fontBytes);
          loadedFonts[fileName] = customFont;
          return customFont;
        } catch (e) {
          console.warn(`Could not load custom font ${fileName}`, e);
          return null;
        }
      };

      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      // Process elements
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const page = pdfDoc.getPage(el.pageIndex);
        const { width: pdfWidth, height: pdfHeight } = page.getSize();
        
        // Map screen percentages to PDF points
        const pdfX = (el.left / 100) * pdfWidth;
        const pdfY = pdfHeight - ((el.top / 100) * pdfHeight);

        if (el.type === 'text') {
          const fontSizeInPoints = el.fontSize || 12;
          const textValue = (el.text || '').trim();
          if (!textValue) continue;
          
          let resolvedFont = helveticaFont;
          if (el.fontFamily && ['Arimo', 'Heebo', 'Assistant'].includes(el.fontFamily)) {
             const customFont = await loadCustomFont(el.fontFamily, el.fontWeight, el.fontStyle);
             if (customFont) resolvedFont = customFont;
          } else {
             if (el.fontWeight === 'bold' && el.fontStyle === 'italic') {
               resolvedFont = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
             } else if (el.fontWeight === 'bold') {
               resolvedFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
             } else if (el.fontStyle === 'italic') {
               resolvedFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
             }
          }
          
          const { r, g, b } = hexToRgbFractions(el.color);

          // Helvetica baseline offset is roughly 85% of line height
          const baselineAdjustedY = pdfY - (fontSizeInPoints * 0.85);

          page.drawText(textValue, {
            x: pdfX,
            y: baselineAdjustedY,
            size: fontSizeInPoints,
            lineHeight: fontSizeInPoints * 1.2, // matches the editor's CSS line-height
            font: resolvedFont,
            color: rgb(r, g, b)
          });
        } else if (el.type === 'checkmark') {
          const elWidthPoints = (el.width / 100) * pdfWidth;
          const elHeightPoints = (el.height / 100) * pdfHeight;
          const { r: cr, g: cg, b: cb } = hexToRgbFractions(el.color, '#1463ff');

          if (el.mark === 'x') {
            // Draw vector X: corner-to-corner diagonals
            page.drawLine({
              start: { x: pdfX, y: pdfY },
              end: { x: pdfX + elWidthPoints, y: pdfY - elHeightPoints },
              thickness: 2.2,
              color: rgb(cr, cg, cb)
            });
            page.drawLine({
              start: { x: pdfX + elWidthPoints, y: pdfY },
              end: { x: pdfX, y: pdfY - elHeightPoints },
              thickness: 2.2,
              color: rgb(cr, cg, cb)
            });
          } else {
            // Draw vector checkmark
            // Start: Left edge, 40% height up from bottom
            page.drawLine({
              start: { x: pdfX, y: pdfY - elHeightPoints * 0.6 },
              end: { x: pdfX + elWidthPoints * 0.35, y: pdfY - elHeightPoints },
              thickness: 2.2,
              color: rgb(cr, cg, cb)
            });
            // End: Top-right edge
            page.drawLine({
              start: { x: pdfX + elWidthPoints * 0.35, y: pdfY - elHeightPoints },
              end: { x: pdfX + elWidthPoints, y: pdfY },
              thickness: 2.2,
              color: rgb(cr, cg, cb)
            });
          }
        } else if (el.type === 'signature' && el.dataUrl) {
          const elWidthPoints = (el.width / 100) * pdfWidth;
          const elHeightPoints = (el.height / 100) * pdfHeight;
          const sourceDataUrl = el.color && el.color !== '#000000'
            ? await tintImageDataUrl(el.dataUrl, el.color)
            : el.dataUrl;
          const base64Data = sourceDataUrl.split(',')[1];
          const embeddedImage = await pdfDoc.embedPng(base64Data);

          page.drawImage(embeddedImage, {
            x: pdfX,
            y: pdfY - elHeightPoints, // origin at bottom-left of image box
            width: elWidthPoints,
            height: elHeightPoints
          });
        }
        
        setProgress((i + 1) / elements.length);
      }

      const signedBytes = await pdfDoc.save();
      const signedBlob = new Blob([signedBytes], { type: 'application/pdf' });
      
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
        <div className="sign-workspace">
          
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
              <div className="sig-pad-wrapper" onMouseDown={startDrawing} onTouchStart={startDrawing}>
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
              <div className="sig-type-preview">
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

// A handful of common ink colors, plus a native picker for anything else
const PRESET_COLORS = ['#000000', '#d8342b', '#1463ff', '#1a8f54', '#112d4e'];

function ColorPicker({ value, onChange, title, defaultColor = '#000000' }) {
  return (
    <div className="sign-color-picker">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`sign-color-swatch${(value || defaultColor) === c ? ' active' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          title={c}
        />
      ))}
      <input
        type="color"
        className="sign-color-input"
        value={value || defaultColor}
        onChange={(e) => onChange(e.target.value)}
        title={title}
      />
    </div>
  );
}

// Draggable Overlay Element Component
function DraggableOverlayElement({
  element,
  isActive,
  onSelect,
  onChange,
  onDelete,
  onClone,
  pageWidthPoints,
  pageHeightPoints,
  pageWrapperRef
}) {
  const elementRef = useRef(null);
  const dragStartPos = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const [scaleFactor, setScaleFactor] = useState(1);
  const [tintedSigUrl, setTintedSigUrl] = useState(null);
  const textMeasureRef = useRef(null);
  const [textInputWidth, setTextInputWidth] = useState(60);
  const [textInputHeight, setTextInputHeight] = useState(24);

  // Grow/shrink the text box to fit its content in both directions — width for
  // the widest line (RTL and long/short text otherwise sit inside a leftover
  // fixed-width box), height for however many lines Enter has introduced.
  useEffect(() => {
    if (element.type !== 'text' || !textMeasureRef.current) return;
    setTextInputWidth(Math.max(20, textMeasureRef.current.scrollWidth + 4));
    setTextInputHeight(Math.max(20, textMeasureRef.current.scrollHeight + 4));
  }, [element.type, element.text, element.fontFamily, element.fontWeight, element.fontStyle, element.fontSize, scaleFactor]);

  // Recolor the signature preview to match the chosen ink color
  useEffect(() => {
    if (element.type !== 'signature' || !element.dataUrl) return;
    if (!element.color || element.color === '#000000') {
      setTintedSigUrl(null);
      return;
    }
    let cancelled = false;
    tintImageDataUrl(element.dataUrl, element.color).then((tinted) => {
      if (!cancelled) setTintedSigUrl(tinted);
    });
    return () => { cancelled = true; };
  }, [element.type, element.dataUrl, element.color]);

  // Responsive scaling handler to convert points size on screen
  useEffect(() => {
    if (!pageWrapperRef) return;
    
    const updateScale = () => {
      const rect = pageWrapperRef.getBoundingClientRect();
      setScaleFactor(rect.width / pageWidthPoints);
    };

    updateScale();
    
    // Resize observer or window resize listener
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [pageWrapperRef, pageWidthPoints]);

  // Mouse/Touch Drag Handlers
  const handlePointerDown = (e) => {
    if (e.target.closest('.sign-element-actions') || e.target.closest('.sign-element-resizer')) {
      return;
    }
    
    onSelect(e);
    
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }
    
    e.preventDefault();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    dragStartPos.current = {
      x: clientX,
      y: clientY,
      left: element.left,
      top: element.top
    };

    const handlePointerMove = (moveEvent) => {
      const moveX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
      
      const dx = moveX - dragStartPos.current.x;
      const dy = moveY - dragStartPos.current.y;
      
      const parentRect = pageWrapperRef.getBoundingClientRect();
      
      let newLeft = dragStartPos.current.left + (dx / parentRect.width) * 100;
      let newTop = dragStartPos.current.top + (dy / parentRect.height) * 100;
      
      // Keep within bounds
      newLeft = Math.max(0, Math.min(100 - (element.width || 4), newLeft));
      newTop = Math.max(0, Math.min(100 - (element.height || 2), newTop));
      
      onChange({ left: newLeft, top: newTop });
    };

    const handlePointerUp = () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
  };

  // Resize handler for signature/checkmark elements (width/height) and text elements (font size)
  const handleResizeStart = (e) => {
    e.stopPropagation();
    e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const dragStartX = clientX;
    const startWidth = element.width || 20;
    const startFontSize = element.fontSize || 12;
    const startLeft = element.left;
    const startTop = element.top;
    const startParentRect = pageWrapperRef.getBoundingClientRect();
    const defaultRatio = element.type === 'checkmark' ? 1 : 0.4;
    const ratioAtStart = element.aspectRatio || defaultRatio;
    const startHeight = element.height || (startWidth * ratioAtStart * (startParentRect.width / startParentRect.height));

    const handleResizeMove = (moveEvent) => {
      const moveX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const dx = moveX - dragStartX;

      if (element.type === 'text') {
        const parentRect = pageWrapperRef.getBoundingClientRect();
        // Scale font size in PDF points relative to drag distance in screen pixels
        const deltaFontSize = (dx / parentRect.width) * pageWidthPoints;
        const newFontSize = Math.max(6, Math.min(72, Math.round(startFontSize + deltaFontSize)));
        onChange({ fontSize: newFontSize });
        return;
      }

      const parentRect = pageWrapperRef.getBoundingClientRect();
      const deltaWidthPercent = (dx / parentRect.width) * 100;

      // Checkmarks use an absolute pixel floor (not a fixed %) so the box never
      // shrinks past what its border/padding chrome needs to render the icon —
      // a flat % floor collapses to a couple of screen pixels on a large page,
      // leaving no content area for the SVG and making it vanish, not shrink.
      const minWidth = element.type === 'checkmark'
        ? (14 / parentRect.width) * 100
        : 3;
      let newWidth = startWidth + deltaWidthPercent;
      newWidth = Math.max(minWidth, Math.min(60, newWidth)); // constraints (min% to 60%)

      const ratio = element.aspectRatio || defaultRatio;
      // Convert width percent to correct height percent using responsive page dimensions
      const newHeight = newWidth * ratio * (parentRect.width / parentRect.height);

      if (element.type === 'checkmark' || element.type === 'signature') {
        // Grow/shrink around the box's center instead of its top-left corner
        let newLeft = startLeft + (startWidth - newWidth) / 2;
        let newTop = startTop + (startHeight - newHeight) / 2;
        newLeft = Math.max(0, Math.min(100 - newWidth, newLeft));
        newTop = Math.max(0, Math.min(100 - newHeight, newTop));
        onChange({ width: newWidth, height: newHeight, left: newLeft, top: newTop });
        return;
      }

      onChange({ width: newWidth, height: newHeight });
    };

    const handleResizeUp = () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeUp);
      window.removeEventListener('touchmove', handleResizeMove);
      window.removeEventListener('touchend', handleResizeUp);
    };

    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeUp);
    window.addEventListener('touchmove', handleResizeMove, { passive: false });
    window.addEventListener('touchend', handleResizeUp);
  };

  // Styles for responsive placing
  const style = {
    left: `${element.left}%`,
    top: `${element.top}%`,
    width: element.width ? `${element.width}%` : 'auto',
    height: element.height ? `${element.height}%` : 'auto',
  };

  // Font size responsive scaling for text elements
  const textFontSize = (element.fontSize || 12) * scaleFactor;

  return (
    <div
      ref={elementRef}
      className={`sign-element${isActive ? ' active' : ''}${element.type === 'checkmark' ? ' sign-element--checkmark' : ''}`}
      style={style}
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Element options bar */}
      <div className="sign-element-actions">
          {element.type === 'text' && (
            <>
              <select 
                className="sign-font-select"
                value={element.fontFamily || 'Helvetica'}
                onChange={(e) => onChange({ fontFamily: e.target.value })}
                title="Font family"
              >
                <option value="Helvetica">Helvetica</option>
                <option value="Arimo">Arial (Arimo)</option>
                <option value="Assistant">Hebrew (Assistant)</option>
                <option value="Heebo">Hebrew (Heebo)</option>
                <option value="TimesRoman">Times Roman</option>
                <option value="Courier">Courier</option>
              </select>
              <div className="sign-toolbar-divider" />
              <button
                type="button"
                className="sign-element-btn"
                onClick={() => onChange({ fontSize: Math.max(6, (element.fontSize || 12) - 1) })}
                title="Decrease font size"
              >
                A-
              </button>
              <button
                type="button"
                className="sign-element-btn"
                onClick={() => onChange({ fontSize: Math.min(72, (element.fontSize || 12) + 1) })}
                title="Increase font size"
              >
                A+
              </button>
              <div className="sign-toolbar-divider" />
              <button
                type="button"
                className={`sign-element-btn ${element.fontWeight === 'bold' ? 'active' : ''}`}
                onClick={() => onChange({ fontWeight: element.fontWeight === 'bold' ? 'normal' : 'bold' })}
                title="Bold"
              >
                <b>B</b>
              </button>
              <button
                type="button"
                className={`sign-element-btn ${element.fontStyle === 'italic' ? 'active' : ''}`}
                onClick={() => onChange({ fontStyle: element.fontStyle === 'italic' ? 'normal' : 'italic' })}
                title="Italic"
              >
                <i>I</i>
              </button>
              <div className="sign-toolbar-divider" />
              <ColorPicker
                value={element.color}
                onChange={(color) => onChange({ color })}
                title="Text color"
                defaultColor="#000000"
              />
              <div className="sign-toolbar-divider" />
            </>
          )}
          {element.type === 'checkmark' && (
            <>
              <button
                type="button"
                className={`sign-element-btn ${(element.mark || 'check') === 'check' ? 'active' : ''}`}
                onClick={() => onChange({ mark: 'check' })}
                title="Check mark"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
              <button
                type="button"
                className={`sign-element-btn ${element.mark === 'x' ? 'active' : ''}`}
                onClick={() => onChange({ mark: 'x' })}
                title="X mark"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                  <line x1="5" y1="5" x2="19" y2="19" />
                  <line x1="19" y1="5" x2="5" y2="19" />
                </svg>
              </button>
              <div className="sign-toolbar-divider" />
              <ColorPicker
                value={element.color}
                onChange={(color) => onChange({ color })}
                title="Checkbox color"
                defaultColor="#1463ff"
              />
              <div className="sign-toolbar-divider" />
            </>
          )}
          {element.type === 'signature' && (
            <>
              <ColorPicker
                value={element.color}
                onChange={(color) => onChange({ color })}
                title="Signature color"
                defaultColor="#000000"
              />
              <div className="sign-toolbar-divider" />
            </>
          )}
          <button
            type="button"
            className="sign-element-btn"
            onClick={() => {
              const newId = `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              onClone({
                ...element,
                id: newId,
                left: Math.min(90, element.left + 4),
                top: Math.min(90, element.top + 4)
              });
            }}
            title="Duplicate element"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <button
            type="button"
            className="sign-element-btn sign-element-btn-danger"
            onClick={onDelete}
            title="Delete element"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
      </div>

      {/* Render element depending on type */}
      {element.type === 'text' && (
        <div className="sign-text-display" style={{ fontSize: `${textFontSize}px` }}>
          <div
            ref={textMeasureRef}
            className="sign-text-measure"
            style={{
              fontSize: `${textFontSize}px`,
              fontFamily: element.fontFamily || 'Helvetica',
              fontWeight: element.fontWeight || 'normal',
              fontStyle: element.fontStyle || 'normal'
            }}
          >
            {/* Trailing zero-width space forces a trailing "\n" to get its own
                measured line box — otherwise a plain div under-counts a blank
                last line versus how the real textarea lays it out, and the
                textarea then auto-scrolls to keep the cursor visible, clipping
                the first line since overflow is hidden. */}
            {(element.text || 'Click to edit') + '\u200B'}
          </div>
          <textarea
            dir="auto"
            wrap="off"
            rows={1}
            className="sign-text-input"
            value={element.text}
            placeholder="Click to edit"
            onInput={(e) => onChange({ text: e.currentTarget.value })}
            onFocus={onSelect}
            style={{
              width: `${textInputWidth}px`,
              height: `${textInputHeight}px`,
              fontSize: `${textFontSize}px`,
              fontFamily: element.fontFamily || 'Helvetica',
              fontWeight: element.fontWeight || 'normal',
              fontStyle: element.fontStyle || 'normal',
              color: element.color || '#000000'
            }}
          />
        </div>
      )}

      {element.type === 'checkmark' && (
        <div style={{ width: '100%', height: '100%', color: element.color || 'var(--color-primary)' }}>
          {element.mark === 'x' ? (
            <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
              <line x1="4" y1="4" x2="20" y2="20" />
              <line x1="20" y1="4" x2="4" y2="20" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      )}

      {element.type === 'signature' && element.dataUrl && (
        <img
          src={tintedSigUrl || element.dataUrl}
          alt="Signature"
          className="sign-sig-image"
        />
      )}

      {/* Resizer control: width/height for signatures/checkmarks, font size for text */}
      {isActive && (
        <div
          className="sign-element-resizer"
          onMouseDown={handleResizeStart}
          onTouchStart={handleResizeStart}
          title={element.type === 'text' ? 'Drag to resize font size' : 'Drag to resize'}
        />
      )}
    </div>
  );
}

// Dedicated canvas rendering component for clean lifecycles and race-free layout paints
function PdfPageCanvas({ pdfDocument, pageNum }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return;

    let active = true;
    const renderPage = async () => {
      try {
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 }); // sharp rendering
        const canvas = canvasRef.current;
        if (!canvas || !active) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;
      } catch (err) {
        console.error(`Error rendering page ${pageNum}:`, err);
      }
    };

    renderPage();
    return () => {
      active = false;
    };
  }, [pdfDocument, pageNum]);

  return (
    <canvas
      ref={canvasRef}
      className="sign-page-canvas"
    />
  );
}
