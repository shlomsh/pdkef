import { useRef, useCallback } from 'preact/hooks';
import PdfPageCanvas from '../PdfPageCanvas.jsx';
import DraggableWrapper from './DraggableWrapper.jsx';
import TextNode from './nodes/TextNode.jsx';
import ShapeNode from './nodes/ShapeNode.jsx';
import SymbolNode from './nodes/SymbolNode.jsx';
import SignatureNode from './nodes/SignatureNode.jsx';
import WhiteoutNode from './nodes/WhiteoutNode.jsx';
import LineNode from './nodes/LineNode.jsx';
import { useSignTool } from './SignToolContext.jsx';
import SignToolbar from './SignToolbar.jsx';
import useWorkspaceGestures from '../../lib/useWorkspaceGestures.js';

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
  lastColor = '#1463ff',
  lastThickness = 3,
  lastFont = 'Arimo',
  lastFontSize = 12,
  lastDirection = null,
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

  // --- Gesture handlers (extracted) ---
  const { handlePageClick, handleOverlayPointerDown } = useWorkspaceGestures({
    selectedTool,
    dispatch,
    activeSignature,
    setTempPlacement,
    setDialogOpen,
    placeSignatureAt,
    logAction,
    setAnnouncement,
    initialColor: lastColor,
    initialStrokeWidth: lastThickness,
    initialFont: lastFont,
    initialFontSize: lastFontSize,
    initialDirection: lastDirection,
  });

  // --- Stable element mutation callbacks (hoisted out of the map loop) ---
  // These are keyed on dispatch/remember* which are stable across renders, so
  // useCallback gives us referential stability without the per-element closure
  // allocation that was happening inside the .map() call.

  const updateElement = useCallback((id, changes) => {
    dispatch({ type: 'UPDATE_ELEMENT', payload: { id, changes } });
  }, [dispatch]);

  const deleteElement = useCallback((id) => {
    dispatch({ type: 'DELETE_ELEMENT', payload: id });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    setAnnouncement('Removed element.');
  }, [dispatch, setAnnouncement]);

  // Factory: returns a stable onChange handler for DraggableWrapper / TextNode.
  // Defined with useCallback so the factory reference is stable; the returned
  // function closes over the element id captured at call time.
  const makeOnChange = useCallback((id) => (fields) => {
    updateElement(id, fields);
    if (fields.color) rememberColor(fields.color);
    if (fields.fontFamily) rememberFont(fields.fontFamily);
    if (fields.fontSize) rememberFontSize(fields.fontSize);
    if (fields.textDirection) rememberDirection(fields.textDirection);
  }, [updateElement, rememberColor, rememberFont, rememberFontSize, rememberDirection]);

  const makeOnSelect = useCallback((id) => (e) => {
    e.stopPropagation();
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
  }, [dispatch]);

  const makeOnDelete = useCallback((id) => () => deleteElement(id), [deleteElement]);

  const makeOnClone = useCallback((id, pageIndex, type) => (cloneInfo) => {
    dispatch({ type: 'ADD_ELEMENT', payload: cloneInfo });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: cloneInfo.id });
    logAction('DUPLICATE_ELEMENT', cloneInfo.id, cloneInfo.pageIndex, `Duplicated ${cloneInfo.type}`);
  }, [dispatch, logAction]);

  const deactivateAll = useCallback(() => {
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
  }, [dispatch]);

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
          <div className="sign-pages-container" onClick={deactivateAll}>
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
                        <DraggableWrapper
                          key={el.id}
                          element={el}
                          isActive={activeElementId === el.id}
                          onSelect={makeOnSelect(el.id)}
                          onChange={makeOnChange(el.id)}
                          onDelete={makeOnDelete(el.id)}
                          onClone={makeOnClone(el.id, el.pageIndex, el.type)}
                          pageWidthPoints={size.width}
                        >
                          {el.type === 'text' && (
                            <TextNode
                              element={el}
                              onChange={makeOnChange(el.id)}
                              onSelect={makeOnSelect(el.id)}
                              pageWidthPoints={size.width}
                            />
                          )}
                          {el.type === 'symbol' && <SymbolNode element={el} />}
                          {(el.type === 'ellipse' || el.type === 'rectangle') && (
                            <ShapeNode element={el} />
                          )}
                          {el.type === 'line' && <LineNode element={el} />}
                          {el.type === 'signature' && <SignatureNode element={el} />}
                          {el.type === 'whiteout' && <WhiteoutNode element={el} />}
                        </DraggableWrapper>
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
