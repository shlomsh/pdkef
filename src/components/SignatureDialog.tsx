import { useState, useRef, useEffect } from 'preact/hooks';
import SignaturePad from 'signature_pad';
import ColorPicker from './ColorPicker.tsx';
import { HANDWRITING_FONTS, resolveFontFamily, textBoxPaddingEm } from '../editor/text/fonts.js';
import { DEFAULT_LINE_HEIGHT_EM } from '../constants/signGeometry.js';
import { getEditorPreference, setEditorPreference, subscribeToEditorPreference } from '../editor/workspace/preferenceStore.ts';
import { encodeSignatureCanvas } from '../editor/workspace/signatureImagePolicy.ts';
import styles from './SignatureDialog.module.css';
import dialogStyles from './Dialog.module.css';

export default function SignatureDialog({
  isOpen,
  onClose,
  onSaveSignature
}: {
  isOpen: boolean;
  onClose: () => void;
  onSaveSignature: (dataUrl: string, aspectRatio: number) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const canvasPadRef = useRef<HTMLCanvasElement | null>(null);
  const signaturePadRef = useRef<SignaturePad | null>(null);

  // States
  const [signatureMode, setSignatureMode] = useState('draw'); // 'draw' | 'type' | 'upload'
  const [typedName, setTypedName] = useState('');
  const [typeFont, setTypeFont] = useState(HANDWRITING_FONTS[0]);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [penColor, setPenColor] = useState('#000000');
  const [penThickness, setPenThickness] = useState(2.5);

  // Upload signature state
  const [uploadImage, setUploadImage] = useState<string | null>(null);
  const [processedUploadImage, setProcessedUploadImage] = useState<string | null>(null);
  const [uploadAspectRatio, setUploadAspectRatio] = useState(1);
  const [removeBg, setRemoveBg] = useState(true);

  // The shared preference store keeps the signature dialog in the same local
  // user scope as the rest of the editor, including other tabs.
  useEffect(() => {
    const storedColor = getEditorPreference('penColor');
    if (storedColor) setPenColor(storedColor);
    const storedThickness = getEditorPreference('penThickness');
    if (storedThickness) setPenThickness(storedThickness);
    const stopColor = subscribeToEditorPreference('penColor', ({ value }) => {
      if (value) setPenColor(value);
    });
    const stopThickness = subscribeToEditorPreference('penThickness', ({ value }) => {
      if (value) setPenThickness(value);
    });
    return () => {
      stopColor();
      stopThickness();
    };
  }, []);

  const rememberPenColor = (color: string) => {
    setPenColor(color);
    setEditorPreference('penColor', color);
  };

  const rememberPenThickness = (thickness: number) => {
    setPenThickness(thickness);
    setEditorPreference('penThickness', thickness);
  };

  // Helper to remove solid white or light backgrounds
  const removeWhiteBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
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
  const trimCanvas = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
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
      const encoded = encodeSignatureCanvas(canvas);
      return { dataUrl: encoded.dataUrl, aspectRatio: encoded.height / encoded.width };
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
    
    const croppedCtx = croppedCanvas.getContext('2d')!;
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
    
    const encoded = encodeSignatureCanvas(croppedCanvas);
    return { dataUrl: encoded.dataUrl, aspectRatio: encoded.height / encoded.width };
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

    const handleBackdropClick = (event: MouseEvent) => {
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
    canvas.getContext('2d')!.scale(ratio, ratio);

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
      const ctx = canvas.getContext('2d')!;
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
  const handleUploadFile = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadImage((e.target as FileReader).result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadChange = (e: Event) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) {
      handleUploadFile(files[0]);
    }
  };

  const handleUploadDrop = (e: DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
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
  const handleSaveSignature = async () => {
    let finalDataUrl: string | null = null;
    let finalAspectRatio = 1;

    if (signatureMode === 'draw') {
      const canvas = canvasPadRef.current;
      if (!canvas) return;
      
      // Make a copy of drawing to trim (because trimming directly affects scaling coordinates)
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.drawImage(canvas, 0, 0);
      
      const { dataUrl, aspectRatio } = trimCanvas(tempCanvas);
      finalDataUrl = dataUrl;
      finalAspectRatio = aspectRatio;
    } else if (signatureMode === 'type') {
      // Type signature mode
      if (!typedName.trim()) return;
      // Same substitution the editor and exporter use (SIGN-08), so a Hebrew
      // signature renders identically everywhere instead of taking whichever
      // Hebrew face the viewer's own OS happens to fall back to.
      const family = resolveFontFamily(typeFont, typedName);
      const fontSizePx = 44;
      const fontSpec = `${fontSizePx}px '${family}', cursive`;
      // The face loads lazily via @font-face; drawing before it has actually
      // been fetched and parsed silently falls back to the generic 'cursive'
      // font, so the saved signature could look nothing like the preview the
      // user just picked. document.fonts.load() (unlike .check(), see
      // liveFontCoverage.js's note on why .check() can't be used for this
      // kind of question) actually triggers the fetch and resolves once the
      // real face is ready to draw with.
      if (document.fonts) {
        try {
          await document.fonts.load(fontSpec, typedName);
        } catch {
          // Offline or a slow connection: draw with whatever is already
          // loaded rather than fail the save entirely.
        }
      }

      const measureCanvas = document.createElement('canvas');
      const measureCtx = measureCanvas.getContext('2d')!;
      measureCtx.font = fontSpec;
      const textWidth = Math.max(1, Math.ceil(measureCtx.measureText(typedName).width));

      // Sized from the resolved font's own vertical metrics (fonts.js) -
      // the same padding rule the editor's text boxes use to fit a tall
      // ascender/descender (Gveret Levin's loops, Heebo's Hebrew) without
      // clipping. A fixed 600x180 canvas clipped a long typed name
      // horizontally and could clip a tall face vertically; both dimensions
      // are now measured instead of guessed.
      const paddingEm = textBoxPaddingEm(family);
      const canvasHeight = Math.ceil(fontSizePx * (DEFAULT_LINE_HEIGHT_EM + paddingEm * 2));
      const horizontalPadding = Math.ceil(fontSizePx * paddingEm * 2);
      const canvas = document.createElement('canvas');
      canvas.width = textWidth + horizontalPadding * 2;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d')!;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = fontSpec;
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
    <dialog ref={dialogRef} className={dialogStyles.dialog} closedby="any" aria-labelledby="dialog-title">
      <div className={dialogStyles.header}>
        <h3 id="dialog-title">Create Signature</h3>
        <button type="button" className={dialogStyles.close} data-editor-dialog-close onClick={onClose} aria-label="Close dialog">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div className={dialogStyles.body}>
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={signatureMode === 'draw'}
            className={`${styles.tab}${signatureMode === 'draw' ? ` ${styles.active}` : ''}`}
            data-editor-dialog-tab="draw"
            onClick={() => setSignatureMode('draw')}
          >
            Draw
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={signatureMode === 'type'}
            className={`${styles.tab}${signatureMode === 'type' ? ` ${styles.active}` : ''}`}
            data-editor-dialog-tab="type"
            onClick={() => setSignatureMode('type')}
          >
            Type
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={signatureMode === 'upload'}
            className={`${styles.tab}${signatureMode === 'upload' ? ` ${styles.active}` : ''}`}
            data-editor-dialog-tab="upload"
            onClick={() => setSignatureMode('upload')}
          >
            Upload
          </button>
        </div>

        {signatureMode === 'draw' && (
          <>
            <div className={styles['pen-controls']}>
              <ColorPicker value={penColor} onChange={rememberPenColor} title="Pen color" defaultColor="#000000" />
              <div className={styles['thickness-control']}>
                <label htmlFor="sig-pen-thickness">Thickness</label>
                <input
                  id="sig-pen-thickness"
                  type="range"
                  min="1"
                  max="6"
                  step="0.5"
                  value={penThickness}
                  onChange={(e) => rememberPenThickness(parseFloat((e.target as HTMLInputElement).value))}
                />
              </div>
            </div>
            <div className={styles.pad}>
              <canvas ref={canvasPadRef} className={styles.canvas} />
              <button type="button" className={styles.clear} onClick={clearDrawing}>
                Clear
              </button>
            </div>
          </>
        )}

        {signatureMode === 'type' && (
          <div className={styles['type-container']}>
            <input
              type="text"
              className={styles['type-input']}
              data-editor-signature-input
              placeholder="Type your name..."
              value={typedName}
              onInput={(e) => setTypedName(e.currentTarget.value)}
              autoFocus
            />
            <div className={styles['font-picker']}>
              {HANDWRITING_FONTS.map(font => (
                <button
                  key={font}
                  type="button"
                  className={`${styles['font-button']} ${typeFont === font ? styles.active : ''}`}
                  data-editor-signature-font
                  data-editor-active={typeFont === font || undefined}
                  onClick={() => setTypeFont(font)}
                  style={{ fontFamily: `'${font}', cursive` }}
                >
                  {font}
                </button>
              ))}
            </div>
            <div className={styles['type-preview']} style={{ fontFamily: `'${resolveFontFamily(typeFont, typedName)}', cursive` }}>
              {typedName || 'Signature Preview'}
            </div>
          </div>
        )}

        {signatureMode === 'upload' && (
          <div className={styles['upload-container']}>
            {!uploadImage ? (
              <label className={styles['upload-dropzone']} data-editor-upload-dropzone onDragOver={(e) => e.preventDefault()} onDrop={handleUploadDrop}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p>Drag & drop signature image here or click to choose</p>
                <span>Supports PNG, JPG, SVG. Auto background transparency.</span>
                <span>Large images are downsampled to at most 1 megapixel and 750 KB before saving.</span>
                <input
                  type="file"
                  accept="image/*"
                  className={styles['upload-file-input']}
                  onChange={handleUploadChange}
                />
              </label>
            ) : (
              <div className={styles['upload-result']}>
                <div className={styles['upload-preview']}>
                  {processedUploadImage ? (
                    <img src={processedUploadImage} alt="Uploaded signature preview" />
                  ) : (
                    <p className={styles['upload-processing']}>Processing signature...</p>
                  )}
                </div>
                <div className={styles['upload-actions-row']}>
                  <div className={styles['upload-options']}>
                    <label>
                      <input
                        type="checkbox"
                        checked={removeBg}
                        onChange={(e) => setRemoveBg((e.target as HTMLInputElement).checked)}
                      />
                      Remove white background
                    </label>
                  </div>
                  <button type="button" className={`${styles.clear} ${styles['clear-inline']}`} onClick={clearUpload}>
                    Change Image
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={dialogStyles.footer}>
        <button type="button" className={`${dialogStyles.button} ${dialogStyles.secondary}`} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={`${dialogStyles.button} ${dialogStyles.primary}`}
          data-editor-signature-save
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
