import { useRef, useCallback } from 'preact/hooks';
import {
  DEFAULT_COLOR_BLUE,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE_PT,
  PAGE_WIDTH_DEFAULT_PTS,
  PAGE_HEIGHT_DEFAULT_PTS
} from '../../constants/signGeometry.js';
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
import { detectTextDirection } from '../../lib/sign.js';

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
  rememberWhiteoutColor,
  rememberFont,
  rememberFontSize,
  rememberDirection,
  rememberThickness,
  lastColor = DEFAULT_COLOR_BLUE,
  lastWhiteoutColor = '#ffffff',
  lastThickness = DEFAULT_STROKE_WIDTH,
  lastFont = DEFAULT_FONT_FAMILY,
  lastFontSize = DEFAULT_FONT_SIZE_PT,
  lastDirection = null,
  logAction,
  handleSavePdf,
  handleDownloadPdf,
  handleSharePdf,
  setAnnouncement,
  savedSignatures,
  setActiveSignature,
  onDeleteSavedSignature,
  setUndoModalOpen,
  toggleFullscreen,
  isFullscreen,
  setConfirmResetOpen,
  placeSignatureAt,
  canSharePdf = false,
  shareReady = false
}) {
  const { state: { selectedTool, elements, activeElementId, actionHistory }, dispatch } = useSignTool();
  const activeElement = elements.find((el) => el.id === activeElementId);
  const activeTextElement = activeElement?.type === 'text' ? activeElement : null;
  const initialTextDirection =
    activeTextElement
      ? detectTextDirection(activeTextElement.text) || activeTextElement.textDirection || lastDirection
      : lastDirection;

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
    initialColor: activeTextElement?.color || lastColor,
    initialWhiteoutColor: lastWhiteoutColor,
    initialStrokeWidth: lastThickness,
    initialFont: activeTextElement?.fontFamily || lastFont,
    initialFontSize: activeTextElement?.fontSize || lastFontSize,
    initialDirection: initialTextDirection,
  });

  // --- Stable element mutation callbacks (hoisted out of the map loop) ---
  // These are keyed on dispatch/remember* which are stable across renders, so
  // useCallback gives us referential stability without the per-element closure
  // allocation that was happening inside the .map() call.

  const updateElement = useCallback((id, changes) => {
    dispatch({ type: 'UPDATE_ELEMENT', payload: { id, changes } });
  }, [dispatch]);

  const deleteElement = useCallback((id) => {
    const el = elements.find(e => e.id === id);
    dispatch({ type: 'DELETE_ELEMENT', payload: id });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    if (el) logAction('DELETE_ELEMENT', id, el.pageIndex, `Deleted ${el.type}`, [el]);
    setAnnouncement('Removed element.');
  }, [dispatch, setAnnouncement, elements, logAction]);

  // Factory: returns a stable onChange handler for DraggableWrapper / TextNode.
  // Defined with useCallback so the factory reference is stable; the returned
  // function closes over the element id captured at call time.
  const makeOnChange = useCallback((id) => (fields) => {
    updateElement(id, fields);
    const element = elements.find(e => e.id === id);
    if (fields.color) {
      if (element?.type === 'whiteout') {
        rememberWhiteoutColor(fields.color);
      } else {
        rememberColor(fields.color);
      }
    }
    if (fields.fontFamily) rememberFont(fields.fontFamily);
    if (fields.fontSize) rememberFontSize(fields.fontSize);
    if (fields.strokeWidth) rememberThickness(fields.strokeWidth);
    if (element?.type === 'text') {
      if (fields.textDirection) {
        rememberDirection(fields.textDirection);
      } else if (fields.text !== undefined) {
        const typedDirection = detectTextDirection(fields.text);
        if (typedDirection) rememberDirection(typedDirection);
      }
    }
  }, [updateElement, elements, rememberColor, rememberWhiteoutColor, rememberFont, rememberFontSize, rememberDirection, rememberThickness]);

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
    <div
      className={`sign-workspace${isPseudoFullscreen ? ' pseudo-fullscreen' : ''}${status === 'signing' ? ' is-processing' : ''}`}
      ref={workspaceRef}
      aria-busy={status === 'signing'}
    >
      {/* Header Controls */}
      <div className="list-header" style={{ width: '100%' }}>
        <span className="list-count" style={{ fontWeight: '600' }}>
          Signing: {file.name}
        </span>
      </div>

      {(status === 'editing' || status === 'signing') && (
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
            actionHistory={actionHistory}
            toggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen || isPseudoFullscreen}
            setConfirmResetOpen={setConfirmResetOpen}
            onSavePdf={handleSavePdf}
            onDownloadPdf={handleDownloadPdf}
            onSharePdf={handleSharePdf}
            canSharePdf={canSharePdf}
            shareReady={shareReady}
          />

          {/* PDF Pages rendering container */}
          <div className="sign-pages-container" onClick={deactivateAll}>
            {Array.from({ length: numPages }).map((_, pageIdx) => {
              const size = pageSizes[pageIdx] || { width: PAGE_WIDTH_DEFAULT_PTS, height: PAGE_HEIGHT_DEFAULT_PTS };

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
          <div className="sign-export-actions" style={{ marginTop: '2rem' }}>
            <button type="button" className="merge-button" onClick={handleDownloadPdf}>
              Download
            </button>
            {canSharePdf && (
              <button type="button" className="merge-button sign-export-share" onClick={shareReady ? handleSharePdf : handleSavePdf}>
                {shareReady ? 'Share now' : 'Share'}
              </button>
            )}
          </div>
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
