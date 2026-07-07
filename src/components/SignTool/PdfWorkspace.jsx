import { useRef } from 'preact/hooks';
import PdfPageCanvas from '../PdfPageCanvas.jsx';
import DraggableOverlayElement from '../DraggableOverlayElement.jsx';
import { useSignTool } from './SignToolContext.jsx';
import SignToolbar from './SignToolbar.jsx';
import usePdfCoordinates from '../../lib/usePdfCoordinates.js';

const DRAG_DRAWN_TOOLS = ['whiteout', 'line', 'ellipse', 'rectangle'];

export default function PdfWorkspace({
  file,
  status,
  isPseudoFullscreen,
  workspaceRef,
  numPages,
  pageSizes,
  pdfDocument,
  pageWrapperRefs,
  activeSignature,
  setTempPlacement,
  setDialogOpen,
  rememberColor,
  rememberFont,
  rememberFontSize,
  rememberDirection,
  logAction,
  handleSavePdf,
  setAnnouncement,
  savedSignatures,
  setActiveSignature,
  onDeleteSavedSignature,
  setUndoModalOpen,
  toggleFullscreen,
  isFullscreen,
  setConfirmResetOpen,
  placeSignatureAt
}) {
  const { state: { selectedTool, elements, activeElementId }, dispatch } = useSignTool();
  const { getPointerCoords, getPointerPercent, getDeltaPercent, getWidthPercentToHeightPercent, getDimensions } = usePdfCoordinates();

  // Place element on current page click
  const handlePageClick = (e, pageIndex) => {
    if (!selectedTool) return;
    if (DRAG_DRAWN_TOOLS.includes(selectedTool)) return;
    e.stopPropagation();
    
    if (e.target.closest('.sign-element')) return;
    
    const container = e.currentTarget;
    const { x: leftPercent, y: topPercent } = getPointerPercent(e, container);
    
    if (selectedTool === 'text') {
      const id = crypto.randomUUID ? crypto.randomUUID() : `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newEl = {
        id,
        type: 'text',
        pageIndex,
        left: leftPercent,
        top: topPercent,
        text: '',
        fontSize: 12, // in PDF points (will fall back to last used size)
        fontWeight: 'normal',
        fontStyle: 'normal',
        color: '#000000'
      };
      // Note: in PdfSignTool, we had rememberColor / rememberFont / rememberFontSize, 
      // but those are handled when a DraggableOverlayElement triggers onChange.
      dispatch({ type: 'ADD_ELEMENT', payload: newEl });
      dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
      logAction('ADD_TEXT', id, pageIndex, 'Added text box');
      setAnnouncement('Added text box. Click or double click to type.');
    } else if (selectedTool === 'symbol') {
      const id = crypto.randomUUID ? crypto.randomUUID() : `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const widthPercent = 5;
      const heightPercent = getWidthPercentToHeightPercent(widthPercent, 1, container);
      const newEl = {
        id,
        type: 'symbol',
        pageIndex,
        left: leftPercent - widthPercent / 2,
        top: topPercent - heightPercent / 2,
        width: widthPercent,
        height: heightPercent
      };
      dispatch({ type: 'ADD_ELEMENT', payload: newEl });
      dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
      logAction('ADD_SYMBOL', id, pageIndex, 'Added symbol');
      setAnnouncement('Added symbol.');
    } else if (selectedTool === 'signature') {
      if (activeSignature) {
        placeSignatureAt(activeSignature.dataUrl, activeSignature.aspectRatio, pageIndex, leftPercent, topPercent);
      } else {
        setTempPlacement({ pageIndex, left: leftPercent, top: topPercent });
        setDialogOpen(true);
      }
    }
  };

  const handleOverlayPointerDown = (e, pageIndex) => {
    if (!DRAG_DRAWN_TOOLS.includes(selectedTool)) return;
    if (e.target.closest('.sign-element')) return;
    e.stopPropagation();

    if (!e.touches) e.preventDefault();

    const tool = selectedTool;
    const isLineTool = tool === 'line';
    const container = e.currentTarget;
    const { x: startLeftPercent, y: startTopPercent } = getPointerPercent(e, container);
    const { x: clientX, y: clientY } = getPointerCoords(e);

    const id = crypto.randomUUID ? crypto.randomUUID() : `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newEl = isLineTool
      ? {
          id, type: 'line', pageIndex,
          x1: startLeftPercent, y1: startTopPercent,
          x2: startLeftPercent, y2: startTopPercent,
          color: '#1463ff',
          strokeWidth: 3
        }
      : {
          id, type: tool, pageIndex,
          left: startLeftPercent, top: startTopPercent,
          width: 0, height: 0,
          ...(tool === 'whiteout'
            ? { color: '#ffffff' }
            : { color: '#1463ff', strokeWidth: 3 })
        };

    dispatch({ type: 'ADD_ELEMENT', payload: newEl });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });

    const handlePointerMove = (moveEvent) => {
      const { x: moveX, y: moveY } = getPointerCoords(moveEvent);

      if (isLineTool) {
        const { x, y } = getPointerPercent(moveEvent, container);
        const x2 = Math.max(0, Math.min(100, x));
        const y2 = Math.max(0, Math.min(100, y));
        dispatch({ type: 'UPDATE_ELEMENT', payload: { id, changes: { x2, y2 } } });
        return;
      }

      const { x: widthPercent, y: heightPercent } = getDeltaPercent(moveX - clientX, moveY - clientY, container);

      dispatch({
        type: 'UPDATE_ELEMENT',
        payload: {
          id,
          changes: {
            left: widthPercent < 0 ? startLeftPercent + widthPercent : startLeftPercent,
            top: heightPercent < 0 ? startTopPercent + heightPercent : startTopPercent,
            width: Math.abs(widthPercent),
            height: Math.abs(heightPercent)
          }
        }
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);

      const dimensions = getDimensions(container);
      dispatch({
        type: 'ENSURE_MINIMUM_SIZE',
        payload: {
          id,
          tool,
          rectWidth: dimensions.width,
          rectHeight: dimensions.height,
          startLeftPercent,
          startTopPercent
        }
      });

      if (tool === 'whiteout') {
        logAction('ADD_WHITEOUT', id, pageIndex, 'Added whiteout box');
        setAnnouncement('Added whiteout box.');
      } else {
        logAction('ADD_SHAPE', id, pageIndex, `Added ${tool}`);
        setAnnouncement(`Added ${tool}.`);
      }
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
  };

  const updateElement = (id, changes) => {
    dispatch({ type: 'UPDATE_ELEMENT', payload: { id, changes } });
  };

  const deleteElement = (id) => {
    dispatch({ type: 'DELETE_ELEMENT', payload: id });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    setAnnouncement('Removed element.');
  };

  return (
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
          <SignToolbar
            setAnnouncement={setAnnouncement}
            savedSignatures={savedSignatures}
            activeSignature={activeSignature}
            setActiveSignature={setActiveSignature}
            onDeleteSavedSignature={onDeleteSavedSignature}
            setDialogOpen={setDialogOpen}
            setUndoModalOpen={setUndoModalOpen}
            actionHistory={[]} // standard props or context logic
            toggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen || isPseudoFullscreen}
            setConfirmResetOpen={setConfirmResetOpen}
            onSavePdf={handleSavePdf}
          />

          {/* PDF Pages rendering container */}
          <div className="sign-pages-container" onClick={() => dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null })}>
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
                            dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: el.id });
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
                             dispatch({ type: 'ADD_ELEMENT', payload: cloneInfo });
                             dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: cloneInfo.id });
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
            Saving document layers…
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
  );
}
