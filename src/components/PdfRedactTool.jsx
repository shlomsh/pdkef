import { useState, useRef, useEffect } from 'preact/hooks';
import BasePdfTool from './BasePdfTool.jsx';
import PdfPageCanvas from './PdfPageCanvas.jsx';
import { getPdfjs, uniqueId, seedUniqueId } from '../lib/sign.js';
import { redactPdf } from '../lib/redact.js';
import { pxToPercent, pxDeltaToPercent } from '../lib/coords.js';
import { useDraftPersistence } from '../lib/useDraftPersistence.js';

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
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  // Which existing box shows its delete/resize controls — set on hover (desktop) or
  // on touch/drag interaction (mobile has no hover), so the controls stay hidden
  // otherwise and don't clutter pages full of redaction boxes.
  const [activeBoxId, setActiveBoxId] = useState(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const workspaceRef = useRef(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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
  const downloadRef = useRef(null);
  const fileBytesRef = useRef(null);
  const loadIdRef = useRef(0);
  // Whichever of {manual file pick, draft restore} happens first (in call order) wins
  // outright; the other is skipped entirely. This closes the gap the loadId guard alone
  // doesn't cover: a slow draft restore that resolves *after* a fast manual pick has
  // already finished editing would otherwise still be "the newer call" and clobber it.
  const loadStartedRef = useRef(false);

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

  // Core loader shared by fresh file picks and draft restore. `bytes` is the source
  // PDF's ArrayBuffer; `presetElements` seeds restored redaction boxes.
  //
  // Draft restore reads from IndexedDB asynchronously, so it can still be in flight
  // when the user drops/picks a fresh file — two overlapping loadPdf calls would
  // otherwise race, and whichever's awaits happened to resolve last would silently
  // clobber the other's state. Tag each call with an id and ignore any state updates
  // from a call that's been superseded by a newer one.
  const loadPdf = async (selected, bytes, presetElements = [], restored = false) => {
    const loadId = ++loadIdRef.current;
    setFile(selected);
    setStatus('loading');
    setProgress(0);
    setElements(presetElements);
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
      setAnnouncement('This PDF is taking too long to load — it may be corrupted. Please try a different file.');
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
    await loadPdf(selected, bytes, []);
  };

  const { clearDraft } = useDraftPersistence({
    tool: 'redact',
    file,
    fileBytes: fileBytesRef.current,
    elements,
    extra: {},
    status,
    onRestore: (record) => {
      // A manual pick already claimed the load slot (even if it hasn't finished loading
      // yet) — never let a silent background restore override explicit user intent.
      if (loadStartedRef.current) return;
      loadStartedRef.current = true;
      const restoredFile = new File([record.fileBytes], record.fileName, {
        type: record.fileType || 'application/pdf'
      });
      loadPdf(restoredFile, record.fileBytes, record.elements || [], true);
    }
  });

  const handlePointerDown = (e, pageIndex) => {
    if (e.target.closest('.redact-element-btn') || e.target.closest('.redact-box')) {
      return; // Ignore clicks on existing boxes or buttons
    }

    setActiveBoxId(null); // clicking blank page area deselects/hides any box's controls
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

  const updateElement = (id, changes) => {
    setElements(prev => prev.map(el => (el.id === id ? { ...el, ...changes } : el)));
  };

  // Drag an existing box to reposition it. Percentages are relative to the box's own
  // page wrapper, captured once at gesture start (it can't change mid-drag). We
  // stopPropagation so the page-level draw handler never starts a new box underneath.
  const handleBoxDragStart = (e, el) => {
    if (e.target.closest('.redact-element-btn') || e.target.closest('.redact-box-resizer')) return;
    e.stopPropagation();
    e.preventDefault();
    setActiveBoxId(el.id); // reveal controls on touch/click, where there's no hover

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

  // Drag the corner handle to resize an existing box (bottom-right corner anchored to
  // the box's top-left, so left/top stay put and only width/height change).
  const handleBoxResizeStart = (e, el) => {
    e.stopPropagation();
    e.preventDefault();

    const wrapper = pageWrapperRefs.current[el.pageIndex];
    if (!wrapper) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const start = { x: clientX, y: clientY, width: el.width, height: el.height };

    const onMove = (ev) => {
      const mx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const my = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const rect = wrapper.getBoundingClientRect();
      let newWidth = start.width + pxDeltaToPercent(mx - start.x, rect.width);
      let newHeight = start.height + pxDeltaToPercent(my - start.y, rect.height);
      newWidth = Math.max(1, Math.min(100 - el.left, newWidth));
      newHeight = Math.max(1, Math.min(100 - el.top, newHeight));
      updateElement(el.id, { width: newWidth, height: newHeight });
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
    clearDraft();
    fileBytesRef.current = null;
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
      hasFiles={!!file}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      accept=".pdf,application/pdf"
      emptyStateMessage="Select or drop a PDF to redact"
    >
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {status === 'editing' && pdfDocument && (
        <div className={`sign-workspace ${isPseudoFullscreen ? 'pseudo-fullscreen' : ''}`} ref={workspaceRef}>
          <div className="sign-toolbar-container" style={{ marginTop: 'var(--space-5)' }}>
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
            <div className="sign-tool-separator" />
            <button
              type="button"
              className="sign-tool-btn"
              onClick={toggleFullscreen}
              title={(isFullscreen || isPseudoFullscreen) ? 'Exit full screen' : 'Full screen'}
            >
              {(isFullscreen || isPseudoFullscreen) ? (
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

            <div className="sign-tool-separator" />

            <button
              type="button"
              className="sign-tool-btn sign-tool-btn-reset"
              onClick={() => setConfirmResetOpen(true)}
              title="Discard your work and start over"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 2v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8" />
              </svg>
              Start over
            </button>

            <button
              type="button"
              className="sign-tool-btn sign-tool-btn-download"
              onClick={handleSavePdf}
              disabled={elements.length === 0}
              title={elements.length === 0 ? 'Add at least one redaction box first' : 'Apply redactions and download'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span className="sign-tool-btn-text">Download</span>
            </button>
          </div>
          </div>

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
                      className="clear-all"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                      title="Clear all redactions on this page"
                      onClick={() => clearPage(i)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                    <div
                      key={el.id}
                      className={`redact-box${el.id === activeBoxId ? ' active' : ''}`}
                      onMouseDown={(e) => handleBoxDragStart(e, el)}
                      onTouchStart={(e) => handleBoxDragStart(e, el)}
                      onMouseEnter={() => setActiveBoxId(el.id)}
                      onMouseLeave={() => setActiveBoxId((prev) => (prev === el.id ? null : prev))}
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
                        cursor: 'move',
                        touchAction: 'none',
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
                      <div
                        className="redact-box-resizer"
                        onMouseDown={(e) => handleBoxResizeStart(e, el)}
                        onTouchStart={(e) => handleBoxResizeStart(e, el)}
                        title="Drag to resize"
                        style={{
                          position: 'absolute',
                          bottom: '-6px',
                          right: '-6px',
                          width: '14px',
                          height: '14px',
                          background: 'var(--color-primary)',
                          border: '2px solid var(--color-surface)',
                          borderRadius: '50%',
                          cursor: 'se-resize',
                          touchAction: 'none',
                          boxShadow: 'var(--shadow-sm)',
                          zIndex: 11
                        }}
                      />
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

      {/* Redacting progress */}
      {status === 'redacting' && (
        <div style={{ textAlign: 'center', width: '100%', padding: '3rem 0' }}>
          <span className="merge-button-progress" style={{ color: 'var(--color-text)' }}>
            <svg className="progress-ring" width="22" height="22" viewBox="0 0 40 40">
              <circle className="progress-ring-track" cx="20" cy="20" r="18" stroke="var(--color-border-strong)" />
            </svg>
            Applying redactions… {Math.round(progress * 100)}%
          </span>
        </div>
      )}

      {/* Success download */}
      {status === 'done' && downloadUrl && (
        <div style={{ width: '100%', marginTop: '1rem' }}>
          <a
            ref={downloadRef}
            className="download-button"
            href={downloadUrl}
            download={`redacted_${file.name}`}
          >
            <svg className="download-check" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" className="check-circle" stroke="#fff" />
              <path d="M7.5 12.5l3 3 6-6.5" className="check-mark" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            </svg>
            Download Redacted PDF
          </a>
          <button type="button" className="start-over" onClick={() => setConfirmResetOpen(true)}>
            Start over
          </button>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="error-message" role="alert" style={{ width: '100%' }}>
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

      {/* Start-over confirmation */}
      {confirmResetOpen && (
        <>
          <div className="sign-dropdown-backdrop" style={{ zIndex: 999 }} onClick={() => setConfirmResetOpen(false)} />
          <dialog open className="sig-dialog" style={{ position: 'fixed', top: '20vh', zIndex: 1000, margin: '0 auto', maxWidth: '26rem' }} aria-labelledby="confirm-reset-title">
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
                This clears the current document and removes your saved draft. Your redactions can’t be recovered afterwards.
              </p>
            </div>
            <div className="sig-dialog-footer">
              <button type="button" className="sig-btn sig-btn-secondary" onClick={() => setConfirmResetOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="sig-btn sig-btn-primary"
                style={{ background: 'var(--color-danger)' }}
                onClick={() => {
                  setConfirmResetOpen(false);
                  reset();
                }}
              >
                Discard &amp; start over
              </button>
            </div>
          </dialog>
        </>
      )}
    </BasePdfTool>
  );
}
