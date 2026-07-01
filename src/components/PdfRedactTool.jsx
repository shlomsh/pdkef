import { useState, useRef, useEffect } from 'preact/hooks';
import BasePdfTool from './BasePdfTool.jsx';
import PdfPageCanvas from './PdfPageCanvas.jsx';
import { getPdfjs, uniqueId } from '../lib/sign.js';
import { redactPdf } from '../lib/redact.js';
import { Eraser } from 'lucide-preact';

export default function PdfRedactTool() {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [elements, setElements] = useState([]); // Array of { id, pageIndex, left, top, width, height }
  const [status, setStatus] = useState('idle'); // idle | loading | editing | redacting | done | error
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [announcement, setAnnouncement] = useState('');

  const [activeStyle, setActiveStyle] = useState('blackout'); // 'blackout' | 'blur'
  const [drawingState, setDrawingState] = useState(null); // { pageIndex, startX, startY, currentX, currentY }

  const [isFullscreen, setIsFullscreen] = useState(false);
  const workspaceRef = useRef(null);

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

  const pageWrapperRefs = useRef([]);
  const downloadRef = useRef(null);

  // Focus download button on success
  useEffect(() => {
    if (status === 'done' && downloadRef.current) {
      downloadRef.current.focus();
    }
  }, [status]);

  // Clean up download URL
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

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
    
    try {
      const lib = await getPdfjs();
      const bytes = await selected.arrayBuffer();
      const doc = await lib.getDocument({ data: bytes }).promise;
      
      setPdfDocument(doc);
      setNumPages(doc.numPages);
      setStatus('editing');
      setAnnouncement(`Loaded PDF "${selected.name}" with ${doc.numPages} pages.`);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Failed to load PDF file.');
    }
  };

  const handlePointerDown = (e, pageIndex) => {
    if (e.target.closest('.redact-element-btn') || e.target.closest('.redact-box')) {
      return; // Ignore clicks on existing boxes or buttons
    }
    
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const leftPercent = ((clientX - rect.left) / rect.width) * 100;
    const topPercent = ((clientY - rect.top) / rect.height) * 100;
    
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
    
    const leftPercent = ((clientX - rect.left) / rect.width) * 100;
    const topPercent = ((clientY - rect.top) / rect.height) * 100;
    
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
      setElements(prev => [...prev, {
        id: uniqueId(),
        pageIndex: drawingState.pageIndex,
        left,
        top,
        width,
        height,
        style: activeStyle
      }]);
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
    setElements(prev => prev.filter(el => el.id !== id));
  };
  
  const clearPage = (pageIndex) => {
    setElements(prev => prev.filter(el => el.pageIndex !== pageIndex));
  };

  const handleSavePdf = async () => {
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

      setDownloadUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(redactedBlob);
      });
      setStatus('done');
      setAnnouncement('PDF redacted successfully! Ready for download.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Failed to redact PDF document.');
    }
  };

  const reset = () => {
    setFile(null);
    setPdfDocument(null);
    setElements([]);
    setStatus('idle');
    setProgress(0);
    setDownloadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setAnnouncement('Cleared workspace.');
  };

  return (
    <BasePdfTool
      status={status === 'redacting' ? 'loading' : status} // Map 'redacting' to 'loading' UI
      progress={progress}
      downloadUrl={downloadUrl}
      downloadFileName={file ? `redacted_${file.name}` : ''}
      onFilesAdded={handleFilesAdded}
      onReset={reset}
      downloadRef={downloadRef}
      onProcess={handleSavePdf}
      actionButtonText="Redact PDF"
      actionIcon={<Eraser size={18} strokeWidth={2.5} />}
      canProcess={elements.length > 0}
      dropzoneText="Select or drop a PDF to redact"
      multiple={false}
      acceptedFileTypes=".pdf,application/pdf"
    >
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {status === 'editing' && pdfDocument && (
        <div className="sign-workspace" ref={workspaceRef}>
          <div className="sign-toolbar" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--color-surface-hover)', padding: '4px', borderRadius: 'var(--radius)' }}>
              <button
                type="button"
                className={`sign-element-btn ${activeStyle === 'blackout' ? 'active' : ''}`}
                onClick={() => setActiveStyle('blackout')}
                style={{ width: 'auto', padding: '0 12px', fontSize: '0.9rem', fontWeight: 500, color: activeStyle === 'blackout' ? '#fff' : 'var(--color-text)' }}
              >
                <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#000', marginRight: '6px', borderRadius: '2px' }}></span>
                Blackout
              </button>
              <button
                type="button"
                className={`sign-element-btn ${activeStyle === 'blur' ? 'active' : ''}`}
                onClick={() => setActiveStyle('blur')}
                style={{ width: 'auto', padding: '0 12px', fontSize: '0.9rem', fontWeight: 500, color: activeStyle === 'blur' ? '#fff' : 'var(--color-text)' }}
              >
                <span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'rgba(255,255,255,0.8)', border: '1px solid #ccc', backdropFilter: 'blur(2px)', marginRight: '6px', borderRadius: '2px' }}></span>
                Blur
              </button>
            </div>
            <p className="hint-message" style={{ margin: 0, flex: 1 }}>
              Click and drag on any page to hide sensitive text.
            </p>
            <div className="sign-tool-separator" />
            <button
              type="button"
              className="sign-tool-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullscreen ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                  <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                  <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                  <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                  <path d="M16 3h3a2 2 0 0 1 2 2v3" />
                  <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
                  <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              )}
            </button>
          </div>

          <div className="sign-pages-container">
            {Array.from({ length: numPages }).map((_, i) => (
              <div key={i} className="sign-page-card">
                <div className="sign-page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.25rem' }}>
                  <span className="sign-page-number" style={{ fontWeight: 600, color: 'var(--color-text)' }}>Page {i + 1}</span>
                  {elements.some(el => el.pageIndex === i) && (
                    <button
                      type="button"
                      className="sign-tool-btn"
                      style={{ fontSize: '0.85rem', padding: '0.25rem 0.5rem', height: 'auto', background: 'var(--color-surface-hover)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                      onClick={() => clearPage(i)}
                    >
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
                    <div
                      key={el.id}
                      className="redact-box"
                      style={{
                        position: 'absolute',
                        left: `${el.left}%`,
                        top: `${el.top}%`,
                        width: `${el.width}%`,
                        height: `${el.height}%`,
                        backgroundColor: el.style === 'blur' ? 'rgba(255,255,255,0.1)' : '#000000',
                        backdropFilter: el.style === 'blur' ? 'blur(8px)' : 'none',
                        WebkitBackdropFilter: el.style === 'blur' ? 'blur(8px)' : 'none',
                        border: el.style === 'blur' ? '1px solid rgba(0,0,0,0.2)' : '1px solid #333',
                        zIndex: 10
                      }}
                    >
                      <button
                        className="redact-element-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteElement(el.id);
                        }}
                        title="Remove redaction"
                        style={{
                          position: 'absolute',
                          top: '-10px',
                          right: '-10px',
                          background: 'var(--color-danger)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '14px',
                          lineHeight: '1',
                          padding: 0,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  
                  {/* Render active drawing box */}
                  {drawingState && drawingState.pageIndex === i && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${Math.min(drawingState.startX, drawingState.currentX)}%`,
                        top: `${Math.min(drawingState.startY, drawingState.currentY)}%`,
                        width: `${Math.abs(drawingState.currentX - drawingState.startX)}%`,
                        height: `${Math.abs(drawingState.currentY - drawingState.startY)}%`,
                        backgroundColor: activeStyle === 'blur' ? 'rgba(255,255,255,0.1)' : 'rgba(0, 0, 0, 0.7)',
                        backdropFilter: activeStyle === 'blur' ? 'blur(8px)' : 'none',
                        WebkitBackdropFilter: activeStyle === 'blur' ? 'blur(8px)' : 'none',
                        border: activeStyle === 'blur' ? '2px dashed #000' : '2px dashed #ff4757',
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
    </BasePdfTool>
  );
}
