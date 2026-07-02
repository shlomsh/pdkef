import { useState, useRef, useEffect } from 'preact/hooks';
import SignaturePad from 'signature_pad';
import ColorPicker from './ColorPicker.jsx';
import { HANDWRITING_FONTS } from '../lib/sign.js';

export default function SignatureDialog({
  isOpen,
  onClose,
  onSaveSignature
}) {
  const dialogRef = useRef(null);
  const canvasPadRef = useRef(null);
  const signaturePadRef = useRef(null);

  // States
  const [signatureMode, setSignatureMode] = useState('draw'); // 'draw' | 'type' | 'upload'
  const [typedName, setTypedName] = useState('');
  const [typeFont, setTypeFont] = useState(HANDWRITING_FONTS[0]);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [penColor, setPenColor] = useState('#000000');
  const [penThickness, setPenThickness] = useState(2.5);

  // Upload signature state
  const [uploadImage, setUploadImage] = useState(null);
  const [processedUploadImage, setProcessedUploadImage] = useState(null);
  const [uploadAspectRatio, setUploadAspectRatio] = useState(1);
  const [removeBg, setRemoveBg] = useState(true);

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

  // Handle native <dialog> open/close and Safari light-dismiss fallback
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
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
        onClose();
      }
    };

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('click', handleBackdropClick);
    };
  }, [isOpen, onClose]);

  // Draw Mode - Initialize the SignaturePad (smoothed bezier strokes,
  // pressure-aware, handles its own pointer/touch events on the canvas)
  useEffect(() => {
    if (!(isOpen && canvasPadRef.current && signatureMode === 'draw')) return;

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
  }, [isOpen, signatureMode]);

  // Apply pen color/thickness changes to the live pad without resetting the canvas
  useEffect(() => {
    if (!signaturePadRef.current) return;
    signaturePadRef.current.penColor = penColor;
    signaturePadRef.current.minWidth = penThickness * 0.6;
    signaturePadRef.current.maxWidth = penThickness;
  }, [penColor, penThickness]);

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

  const clearDrawing = () => {
    signaturePadRef.current?.clear();
    setHasDrawn(false);
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
      onSaveSignature(finalDataUrl, finalAspectRatio);
      
      // Reset signature creation dialog states
      clearDrawing();
      setTypedName('');
      clearUpload();
    }
  };

  return (
    <dialog ref={dialogRef} className="sig-dialog" closedby="any" aria-labelledby="dialog-title">
      <div className="sig-dialog-header">
        <h3 id="dialog-title">Create Signature</h3>
        <button type="button" className="sig-dialog-close" onClick={onClose} aria-label="Close dialog">
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
        <button type="button" className="sig-btn sig-btn-secondary" onClick={onClose}>
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
  );
}
