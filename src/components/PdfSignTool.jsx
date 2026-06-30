import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import BasePdfTool from './BasePdfTool.jsx';
import { PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib';

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
  
  // Signature Dialog state
  const [signatureMode, setSignatureMode] = useState('draw'); // 'draw' | 'type' | 'upload'
  const [typedName, setTypedName] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);
  const [announcement, setAnnouncement] = useState('');

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
  const canvasRefs = useRef([]);
  const dialogRef = useRef(null);
  const canvasPadRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastDrawingPos = useRef({ x: 0, y: 0 });
  const downloadRef = useRef(null);

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
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
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

  // Render individual page canvas once doc is loaded
  useEffect(() => {
    if (status !== 'editing' || !pdfDocument) return;

    const renderPages = async () => {
      for (let i = 1; i <= numPages; i++) {
        const canvas = canvasRefs.current[i - 1];
        if (!canvas) continue;

        try {
          const page = await pdfDocument.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 }); // sharp rendering
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          const context = canvas.getContext('2d');
          await page.render({ canvasContext: context, viewport }).promise;
        } catch (err) {
          console.error(`Error rendering page ${i}:`, err);
        }
      }
    };

    renderPages();
  }, [status, pdfDocument, numPages]);

  // Place element on current page click
  const handlePageClick = (e, pageIndex) => {
    if (!selectedTool) return;
    
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
        text: 'Click to edit',
        fontSize: 12 // in PDF points
      };
      setElements((prev) => [...prev, newEl]);
      setActiveElementId(id);
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
        height: 5 // percentage
      };
      setElements((prev) => [...prev, newEl]);
      setActiveElementId(id);
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
    };
    
    setElements((prev) => [...prev, newEl]);
    setActiveElementId(id);
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
    ctx.arc(pos.x, pos.y, 1.25, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();

    const draw = (moveEvent) => {
      if (!isDrawingRef.current) return;
      moveEvent.preventDefault();
      const newPos = getDrawingPointerPos(moveEvent);
      
      ctx.beginPath();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
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

  // Add elements from sticky buttons (places in viewport center)
  const quickAdd = (type) => {
    // Detect active page index (first page by default, or page closest to scroll)
    const pageIndex = 0;
    
    if (type === 'text') {
      const id = uniqueId();
      setElements((prev) => [
        ...prev,
        {
          id,
          type: 'text',
          pageIndex,
          left: 40,
          top: 45,
          text: 'Type text...',
          fontSize: 12
        }
      ]);
      setActiveElementId(id);
      setAnnouncement('Added text box.');
    } else if (type === 'checkmark') {
      const id = uniqueId();
      setElements((prev) => [
        ...prev,
        {
          id,
          type: 'checkmark',
          pageIndex,
          left: 45,
          top: 45,
          width: 5,
          height: 5
        }
      ]);
      setActiveElementId(id);
      setAnnouncement('Added checkmark.');
    } else if (type === 'signature') {
      if (activeSignature) {
        placeSignatureAt(activeSignature.dataUrl, activeSignature.aspectRatio, pageIndex, 50, 50);
      } else {
        setTempPlacement({ pageIndex, left: 50, top: 50 });
        setDialogOpen(true);
      }
    }
  };

  // Apply signing and export PDF
  const handleSavePdf = async () => {
    if (!file) return;
    setStatus('signing');
    setProgress(0);
    setAnnouncement('Writing signatures and text layers into PDF...');

    try {
      const bytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes);
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
          const textValue = el.text || '';
          
          // Helvetica baseline offset is roughly 85% of line height
          const baselineAdjustedY = pdfY - (fontSizeInPoints * 0.85);

          page.drawText(textValue, {
            x: pdfX,
            y: baselineAdjustedY,
            size: fontSizeInPoints,
            font: helveticaFont,
            color: rgb(0, 0, 0)
          });
        } else if (el.type === 'checkmark') {
          const elWidthPoints = (el.width / 100) * pdfWidth;
          const elHeightPoints = (el.height / 100) * pdfHeight;

          // Draw vector checkmark
          // Start: Left edge, 40% height up from bottom
          page.drawLine({
            start: { x: pdfX, y: pdfY - elHeightPoints * 0.6 },
            end: { x: pdfX + elWidthPoints * 0.35, y: pdfY - elHeightPoints },
            thickness: 2.2,
            color: rgb(0, 0, 0)
          });
          // End: Top-right edge
          page.drawLine({
            start: { x: pdfX + elWidthPoints * 0.35, y: pdfY - elHeightPoints },
            end: { x: pdfX + elWidthPoints, y: pdfY },
            thickness: 2.2,
            color: rgb(0, 0, 0)
          });
        } else if (el.type === 'signature' && el.dataUrl) {
          const elWidthPoints = (el.width / 100) * pdfWidth;
          const elHeightPoints = (el.height / 100) * pdfHeight;
          const base64Data = el.dataUrl.split(',')[1];
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

                  {/* Keyboard additions */}
                  <button
                    type="button"
                    className="sign-tool-btn"
                    style={{ padding: '0.5rem 0.6rem' }}
                    onClick={() => quickAdd('text')}
                    title="Quick Add Text to Page 1"
                  >
                    + Text
                  </button>
                  <button
                    type="button"
                    className="sign-tool-btn"
                    style={{ padding: '0.5rem 0.6rem' }}
                    onClick={() => quickAdd('checkmark')}
                    title="Quick Add Checkmark to Page 1"
                  >
                    + Check
                  </button>
                  <button
                    type="button"
                    className="sign-tool-btn"
                    style={{ padding: '0.5rem 0.6rem' }}
                    onClick={() => quickAdd('signature')}
                    title="Quick Add Signature to Page 1"
                  >
                    + Sign
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
                      <canvas
                        ref={(el) => (canvasRefs.current[pageIdx] = el)}
                        className="sign-page-canvas"
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
                              onChange={(fields) => updateElement(el.id, fields)}
                              onDelete={() => deleteElement(el.id)}
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
                Sign and Download PDF
              </button>
            </>
          )}

          {/* Signing state */}
          {status === 'signing' && (
            <div style={{ textAlign: 'center', width: '100%', padding: '3rem 0' }}>
              <span className="merge-button-progress" style={{ color: 'var(--color-text)' }}>
                <svg className="progress-ring" width="22" height="22" viewBox="0 0 40 40">
                  <circle className="progress-ring-track" cx="20" cy="20" r="18" stroke="#d2d2d7" />
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
            <div className="sig-pad-wrapper" onMouseDown={startDrawing} onTouchStart={startDrawing}>
              <canvas ref={canvasPadRef} className="sig-canvas" />
              <button type="button" className="sig-clear-btn" onClick={clearDrawing}>
                Clear
              </button>
            </div>
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

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}

// Draggable Overlay Element Component
function DraggableOverlayElement({
  element,
  isActive,
  onSelect,
  onChange,
  onDelete,
  pageWidthPoints,
  pageHeightPoints,
  pageWrapperRef
}) {
  const elementRef = useRef(null);
  const dragStartPos = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const [scaleFactor, setScaleFactor] = useState(1);

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

      let newWidth = startWidth + deltaWidthPercent;
      newWidth = Math.max(3, Math.min(60, newWidth)); // constraints (3% to 60%)

      const ratio = element.aspectRatio || 0.4;
      // Convert width percent to correct height percent using responsive page dimensions
      const newHeight = newWidth * ratio * (parentRect.width / parentRect.height);

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
      className={`sign-element${isActive ? ' active' : ''}`}
      style={style}
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
    >
      {/* Floating element options bar */}
      {isActive && (
        <div className="sign-element-actions">
          {element.type === 'text' && (
            <>
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
            </>
          )}
          <button
            type="button"
            className="sign-element-btn sign-element-btn-danger"
            onClick={onDelete}
            title="Delete element"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      )}

      {/* Render element depending on type */}
      {element.type === 'text' && (
        <div className="sign-text-display" style={{ fontSize: `${textFontSize}px` }}>
          <input
            type="text"
            className="sign-text-input"
            value={element.text}
            onInput={(e) => onChange({ text: e.currentTarget.value })}
            onFocus={onSelect}
            style={{ fontSize: `${textFontSize}px` }}
          />
        </div>
      )}

      {element.type === 'checkmark' && (
        <div style={{ width: '100%', height: '100%', color: 'var(--color-primary)' }}>
          <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}

      {element.type === 'signature' && element.dataUrl && (
        <img
          src={element.dataUrl}
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
