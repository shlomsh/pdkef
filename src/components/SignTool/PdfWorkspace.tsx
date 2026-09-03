import { useRef, useCallback, useEffect, useMemo } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PAGE_WIDTH_DEFAULT_PTS, PAGE_HEIGHT_DEFAULT_PTS } from '../../constants/signGeometry.js';
import PdfPageCanvas from '../PdfPageCanvas.tsx';
import EditorPageHeader from '../EditorPageHeader.tsx';
import DraggableWrapper from './DraggableWrapper.tsx';
import { getElementRenderer } from '../../editor/registry/renderers.ts';
import type { EditorElement } from '../../editor/model/editorModel.ts';
import { useSignTool } from './SignToolContext.tsx';
import { useSignDefaults } from './SignDefaultsContext.tsx';
import { useSavedSignatures } from './SavedSignaturesContext.tsx';
import SignToolbar from './SignToolbar.tsx';
import useWorkspaceGestures from '../../lib/useWorkspaceGestures.js';
import { detectTextDirection } from '../../lib/signHelpers.js';
import { getSignExportReadiness } from '../../lib/signExportReadiness.ts';
import { createPageGeometry } from '../../editor/geometry/coords.js';
import type { PageGeometry } from '../../editor/geometry/coords.ts';
import {
  captureAddedElement,
  captureElementSnapshots,
  type HistoryLogger,
} from '../../editor/model/actionHistory.ts';
import pdfToolStyles from '../PdfTool.module.css';
import workspaceStyles from './Workspace.module.css';

const DEFAULT_PAGE_GEOMETRY = createPageGeometry({
  cropBox: { x: 0, y: 0, width: PAGE_WIDTH_DEFAULT_PTS, height: PAGE_HEIGHT_DEFAULT_PTS },
});

export default function PdfWorkspace({
  status,
  isPseudoFullscreen,
  workspaceRef,
  numPages,
  pageSizes,
  pdfDocument,
  pageWrapperRefs,
  setTempPlacement,
  setDialogOpen,
  logAction,
  handleSavePdf,
  handleDownloadPdf,
  handleSharePdf,
  setAnnouncement,
  setUndoModalOpen,
  toggleFullscreen,
  isFullscreen,
  placeSignatureAt,
  canSharePdf = false,
  shareReady = false,
  errorDetail = null
}: {
  status: string;
  isPseudoFullscreen: boolean;
  workspaceRef: any;
  numPages: number;
  pageSizes: PageGeometry[];
  pdfDocument: PDFDocumentProxy | null;
  pageWrapperRefs: any;
  setTempPlacement: (p: any) => void;
  setDialogOpen: (open: boolean) => void;
  logAction: HistoryLogger<EditorElement>;
  handleSavePdf: () => void;
  handleDownloadPdf: () => void;
  handleSharePdf: () => void;
  setAnnouncement: (msg: string) => void;
  setUndoModalOpen: (open: boolean) => void;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
  placeSignatureAt: (...args: any[]) => void;
  canSharePdf?: boolean;
  shareReady?: boolean;
  /** Overrides the default error copy below with a specific, nameable reason. */
  errorDetail?: string | null;
}) {
  const placementGestureRef = useRef<(() => void) | null>(null);
  useEffect(() => () => placementGestureRef.current?.(), []);
  const { state: { selectedTool, elements, activeElementId, editingElementId, actionHistory }, dispatch } = useSignTool();
  const {
    lastColor, lastWhiteoutColor, lastFont, lastFontSize, lastThickness, lastSymbolWidth, lastSymbolMark,
    rememberColor, rememberWhiteoutColor, rememberFont, rememberFontSize, rememberDirection, rememberThickness, rememberSymbolWidth, rememberSymbolMark, rememberSignatureWidth
  } = useSignDefaults();
  const { activeSignature } = useSavedSignatures();
  const activeElement = elements.find((el) => el.id === activeElementId);
  const activeTextElement = activeElement?.type === 'text' ? activeElement : null;
  // One preflight projection feeds every export affordance. It is intentionally
  // derived here, where the top toolbar, bottom actions, and review navigation
  // meet, rather than recreated in each of those presentation components.
  const exportReadiness = useMemo(() => getSignExportReadiness(elements), [elements]);

  // A fresh field starts from the product's English/LTR default. Direction is
  // then derived from what is typed into that field; it must never inherit the
  // language/direction of a selected or previously edited text element.
  const initialTextDirection = 'ltr';

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
    initialSymbolWidth: lastSymbolWidth,
    initialSymbolMark: lastSymbolMark,
    pageSizes,
    nextElementIndex: elements.length,
    gestureCancelRef: placementGestureRef,
  });

  // --- Stable element mutation callbacks (hoisted out of the map loop) ---
  // These are keyed on dispatch/remember* which are stable across renders, so
  // useCallback gives us referential stability without the per-element closure
  // allocation that was happening inside the .map() call.

  const updateElement = useCallback((id: string, changes: any) => {
    dispatch({ type: 'UPDATE_ELEMENT', payload: { id, changes } });
  }, [dispatch]);

  const deleteElement = useCallback((id: string) => {
    const el = elements.find(e => e.id === id);
    const snapshots = captureElementSnapshots(elements, (element) => element.id === id);
    dispatch({ type: 'DELETE_ELEMENT', payload: id });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    if (el) logAction('delete', 'DELETE_ELEMENT', el.pageIndex, `Deleted ${el.type}`, snapshots);
    setAnnouncement('Removed element.');
  }, [dispatch, setAnnouncement, elements, logAction]);

  // Factory: returns a stable onChange handler for DraggableWrapper / TextNode.
  // Defined with useCallback so the factory reference is stable; the returned
  // function closes over the element id captured at call time.
  const makeOnChange = useCallback((id: string) => (fields: any) => {
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
    // A resized symbol sets the size for the next one placed, so repeated marks
    // (check, x, dot) don't have to be re-sized one by one.
    if (element?.type === 'symbol' && fields.width !== undefined) rememberSymbolWidth?.(fields.width);
    // A switched symbol mark (check/x/dot) sets the mark for the next one
    // placed, so it doesn't silently reset to the check mark default.
    if (element?.type === 'symbol' && fields.mark !== undefined) rememberSymbolMark?.(fields.mark);
    // A resized signature sets the size for the next one placed, so signing
    // multiple fields on the same form doesn't require re-sizing every time.
    if (element?.type === 'signature' && fields.width !== undefined) rememberSignatureWidth?.(fields.width);
    if (element?.type === 'text') {
      if (fields.textDirection) {
        rememberDirection(fields.textDirection);
      } else if (fields.text !== undefined) {
        const typedDirection = detectTextDirection(fields.text);
        if (typedDirection) rememberDirection(typedDirection);
      }
    }
  }, [updateElement, elements, rememberColor, rememberWhiteoutColor, rememberFont, rememberFontSize, rememberDirection, rememberThickness, rememberSymbolWidth, rememberSymbolMark, rememberSignatureWidth]);

  const makeOnSelect = useCallback((id: string) => (e: Event) => {
    e.stopPropagation();
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
  }, [dispatch]);

  // Opening an edit session selects first, so the reducer's guard (editing must
  // match the selection) holds even when the double-click lands on an element
  // that was not the selected one.
  const makeOnBeginEdit = useCallback((id: string) => () => {
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
    dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: id });
  }, [dispatch]);

  const makeOnDelete = useCallback((id: string) => () => deleteElement(id), [deleteElement]);

  const cloneElement = useCallback((cloneInfo: EditorElement) => {
    dispatch({ type: 'ADD_ELEMENT', payload: cloneInfo });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: cloneInfo.id });
    logAction('add', 'DUPLICATE_ELEMENT', cloneInfo.pageIndex, `Duplicated ${cloneInfo.type}`, [captureAddedElement(cloneInfo, elements.length)]);
  }, [dispatch, elements.length, logAction]);

  const deactivateAll = useCallback(() => {
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
  }, [dispatch]);

  const reviewExportIssues = useCallback(() => {
    const firstIssueId = exportReadiness.blockingElementIds[0];
    if (!firstIssueId) return;
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: firstIssueId });
    // The in-place notice then expands from its existing marker and exposes the
    // font suggestions, rather than sending the user to a selected-but-silent box.
    dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: firstIssueId });
    setAnnouncement('Showing the first text field that needs attention.');
    const target = Array.from(document.querySelectorAll('[data-editor-element-id]'))
      .find((node) => node.getAttribute('data-editor-element-id') === firstIssueId) as HTMLElement | undefined;
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [dispatch, exportReadiness.blockingElementIds, setAnnouncement]);

  // "Clear page" (the page header, same action the Redact editor has): removes
  // one page's annotations and leaves every other page alone. Logged with the
  // removed elements and original indexes as one command, so it restores the
  // whole page atomically without changing layer order.
  const clearPage = useCallback((pageIndex: number) => {
    const removed = elements.filter(el => el.pageIndex === pageIndex);
    if (removed.length === 0) return;
    const snapshots = captureElementSnapshots(elements, (element) => element.pageIndex === pageIndex);
    dispatch({ type: 'CLEAR_PAGE', payload: pageIndex });
    logAction(
      'delete',
      'CLEAR_PAGE',
      pageIndex,
      `Cleared ${removed.length} annotation${removed.length === 1 ? '' : 's'} on page ${pageIndex + 1}`,
      snapshots
    );
    setAnnouncement(`Cleared page ${pageIndex + 1}.`);
  }, [elements, dispatch, logAction, setAnnouncement]);

  return (
    <div
      className={`${workspaceStyles.workspace}${isPseudoFullscreen ? ` ${workspaceStyles['pseudo-fullscreen']}` : ''}${status === 'signing' ? ` ${workspaceStyles['is-processing']}` : ''}`}
      ref={workspaceRef}
      aria-busy={status === 'signing'}
    >
      {(status === 'editing' || status === 'signing') && (
        <>
          {/* Floating Toolbar Component */}
          <SignToolbar
            setAnnouncement={setAnnouncement}
            setDialogOpen={setDialogOpen}
            setUndoModalOpen={setUndoModalOpen}
            actionHistory={actionHistory}
            toggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen || isPseudoFullscreen}
            onSavePdf={handleSavePdf}
            onDownloadPdf={handleDownloadPdf}
            onSharePdf={handleSharePdf}
            canSharePdf={canSharePdf}
            shareReady={shareReady}
            exporting={status === 'signing'}
            exportBlocked={exportReadiness.blocked}
            exportIssueCount={exportReadiness.blockingFieldCount}
            onReviewExportIssues={reviewExportIssues}
          />

          {/* PDF Pages rendering container */}
          <div className={workspaceStyles['pages-container']} onClick={deactivateAll}>
            {Array.from({ length: numPages }).map((_, pageIdx) => {
              const size = pageSizes[pageIdx] || DEFAULT_PAGE_GEOMETRY;

              const pageElements = elements.filter((el) => el.pageIndex === pageIdx);

              return (
                <div key={pageIdx} data-editor-page-card>
                  <EditorPageHeader
                    pageNumber={pageIdx + 1}
                    onClear={pageElements.length > 0 ? () => clearPage(pageIdx) : null}
                    clearTitle="Clear all annotations on this page"
                  />
                  <div
                    ref={(el) => { pageWrapperRefs.current[pageIdx] = el; }}
                    className={workspaceStyles['page-wrapper']}
                    style={{ aspectRatio: `${size.width} / ${size.height}` }}
                  >
                    <PdfPageCanvas
                      pdfDocument={pdfDocument}
                      pageNum={pageIdx + 1}
                      pageGeometry={size}
                    />

                    <div
                      className={workspaceStyles['page-overlay']}
                      onClick={(e) => handlePageClick(e, pageIdx)}
                      onMouseDown={(e) => handleOverlayPointerDown(e, pageIdx)}
                      onTouchStart={(e) => handleOverlayPointerDown(e, pageIdx)}
                    >
                      {pageElements.map((el) => (
                        <DraggableWrapper
                          key={el.id}
                          element={el}
                          isActive={activeElementId === el.id}
                          isEditing={editingElementId === el.id}
                          onBeginEdit={makeOnBeginEdit(el.id)}
                          onSelect={makeOnSelect(el.id)}
                          onChange={makeOnChange(el.id)}
                          onDelete={makeOnDelete(el.id)}
                          onClone={cloneElement}
                          pageWidthPoints={size.width}
                          pageGeometry={size}
                        >
                          {getElementRenderer(el.type)({
                            element: el,
                            onChange: makeOnChange(el.id),
                            onSelect: makeOnSelect(el.id),
                            pageWidthPoints: size.width,
                          })}
                        </DraggableWrapper>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Complete signing button */}
          <div className={workspaceStyles['export-actions']}>
            <button type="button" className={`${pdfToolStyles['tool-primary-action']} ${workspaceStyles['export-action']}`} onClick={handleDownloadPdf} disabled={status === 'signing' || exportReadiness.blocked} aria-describedby={exportReadiness.blocked ? 'sign-export-readiness' : undefined}>
              Download
            </button>
            {canSharePdf && (
              <button type="button" className={`${pdfToolStyles['tool-primary-action']} ${workspaceStyles['export-action']} ${workspaceStyles['export-share']}`} onClick={shareReady ? handleSharePdf : handleSavePdf} disabled={status === 'signing' || exportReadiness.blocked} aria-describedby={exportReadiness.blocked ? 'sign-export-readiness' : undefined}>
                {shareReady ? 'Share now' : 'Share'}
              </button>
            )}
          </div>
        </>
      )}

      {/* Signing state */}
      {status === 'signing' && (
        <div className={pdfToolStyles['status-block--compact']}>
          <span className={`${pdfToolStyles['tool-primary-action-progress']} ${pdfToolStyles['tool-primary-action-progress--standalone']}`}>
            <svg className={pdfToolStyles['progress-ring']} width="22" height="22" viewBox="0 0 40 40">
              <circle className={pdfToolStyles['progress-ring-track']} cx="20" cy="20" r="18" stroke="var(--color-border-strong)" />
            </svg>
            Saving document layers…
          </span>
        </div>
      )}

      {/* Error Message */}
      {(status === 'error' || errorDetail) && (
        <div className={`${pdfToolStyles['error-message']} ${pdfToolStyles['error-message--full-width']}`} role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
            <path d="M12 8v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            <circle cx="12" cy="16" r="1" fill="currentColor" />
          </svg>
          <span>
            <strong>Signing stopped.</strong> {errorDetail || 'The PDF may be password-protected or encrypted.'}
          </span>
        </div>
      )}
    </div>
  );
}
