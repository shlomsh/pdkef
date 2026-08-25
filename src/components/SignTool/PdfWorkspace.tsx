import { useRef, useCallback } from 'preact/hooks';
import { PAGE_WIDTH_DEFAULT_PTS, PAGE_HEIGHT_DEFAULT_PTS } from '../../constants/signGeometry.js';
import PdfPageCanvas from '../PdfPageCanvas.tsx';
import EditorPageHeader from '../EditorPageHeader.tsx';
import DraggableWrapper from './DraggableWrapper.tsx';
import { getElementDefinition } from '../../editor/registry/index.ts';
import { useSignTool } from './SignToolContext.tsx';
import { useSignDefaults } from './SignDefaultsContext.tsx';
import { useSavedSignatures } from './SavedSignaturesContext.tsx';
import SignToolbar from './SignToolbar.tsx';
import useWorkspaceGestures from '../../lib/useWorkspaceGestures.js';
import { detectTextDirection } from '../../lib/signHelpers.js';
import useFontCoverageNotice from '../../lib/useFontCoverageNotice.js';
import { resolveFontSubstitution } from '../../lib/fonts.js';
import { describeFontSubstitution } from '../../lib/textCoverage.js';
import pdfToolStyles from '../PdfTool.module.css';
import workspaceStyles from './Workspace.module.css';

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
  pageSizes: any[];
  pdfDocument: any;
  pageWrapperRefs: any;
  setTempPlacement: (p: any) => void;
  setDialogOpen: (open: boolean) => void;
  logAction: (...args: any[]) => void;
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
  const { state: { selectedTool, elements, activeElementId, editingElementId, actionHistory }, dispatch } = useSignTool();
  const {
    lastColor, lastWhiteoutColor, lastFont, lastFontSize, lastDirection, lastThickness, lastSymbolWidth, lastSymbolMark,
    rememberColor, rememberWhiteoutColor, rememberFont, rememberFontSize, rememberDirection, rememberThickness, rememberSymbolWidth, rememberSymbolMark, rememberSignatureWidth
  } = useSignDefaults();
  const { activeSignature } = useSavedSignatures();
  const activeElement = elements.find((el) => el.id === activeElementId);
  const activeTextElement = activeElement?.type === 'text' ? activeElement : null;

  // Two things worth saying about fonts before the user reaches Download,
  // rather than at it. Both exist because the editor is not truly WYSIWYG for
  // non-Latin text: the browser borrows a system font per character for glyphs
  // the chosen file lacks, so text can look perfect on screen and be
  // impossible to embed.
  //
  // The warning is document-wide, because it mirrors exactly what signPdf
  // would refuse on and a character two pages away still stops the download.
  // The substitution aside is tied to the selected box, because that is the
  // one whose font just visibly changed under the user.
  const coverageWarning = useFontCoverageNotice(elements);
  const substitutionNotice = activeTextElement
    ? describeFontSubstitution(resolveFontSubstitution(activeTextElement.fontFamily, activeTextElement.text))
    : '';
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
    initialSymbolWidth: lastSymbolWidth,
    initialSymbolMark: lastSymbolMark,
    pageSizes,
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
    dispatch({ type: 'DELETE_ELEMENT', payload: id });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    if (el) logAction('DELETE_ELEMENT', id, el.pageIndex, `Deleted ${el.type}`, [el]);
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

  const makeOnClone = useCallback((id: string, pageIndex: number, type: string) => (cloneInfo: any) => {
    dispatch({ type: 'ADD_ELEMENT', payload: cloneInfo });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: cloneInfo.id });
    logAction('DUPLICATE_ELEMENT', cloneInfo.id, cloneInfo.pageIndex, `Duplicated ${cloneInfo.type}`);
  }, [dispatch, logAction]);

  const deactivateAll = useCallback(() => {
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
  }, [dispatch]);

  // "Clear page" (the page header, same action the Redact editor has): removes
  // one page's annotations and leaves every other page alone. Logged with the
  // removed elements as its snapshot, so it undoes in one step like a delete.
  const clearPage = useCallback((pageIndex: number) => {
    const removed = elements.filter(el => el.pageIndex === pageIndex);
    if (removed.length === 0) return;
    dispatch({ type: 'CLEAR_PAGE', payload: pageIndex });
    logAction(
      'CLEAR_PAGE',
      null,
      pageIndex,
      `Cleared ${removed.length} annotation${removed.length === 1 ? '' : 's'} on page ${pageIndex + 1}`,
      removed
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
          />

          {/* Font notices - see coverageWarning / substitutionNotice above.
              Three things about this block are deliberate:

              The region is ALWAYS mounted, and only its contents change. An
              aria-live region is announced reliably only when it was already
              in the accessibility tree before the text arrived, so a <p> that
              mounts together with its own message frequently announces
              nothing. role="status" rather than "alert" because neither of
              these is an error, and neither should interrupt a screen reader
              mid-word while someone is typing.

              Both messages can show at once. They are about different things -
              the warning is document-wide, the aside is about the selected box
              - so treating them as alternatives meant one stray Arabic
              character on page 1 silently suppressed every substitution
              explanation for the rest of the session, which is exactly the
              "a substitution must be explained, never silent" promise in
              CLAUDE.md being quietly broken.

              And the region is overlaid rather than flowed (see the CSS): a
              notice that takes layout space pushes every page down at the
              moment it appears, which is while the user is mid-keystroke in
              the very box that triggered it, moving the box out from under
              their caret. The aside toggles on selection changes too, so in
              flow it would shift the document on every click between boxes. */}
          <div className={workspaceStyles['font-notices']} role="status" aria-live="polite">
            <div className={workspaceStyles['font-notices-inner']}>
              {coverageWarning && (
                <p className={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`}>
                  {coverageWarning}
                </p>
              )}
              {substitutionNotice && (
                <p className={pdfToolStyles['hint-message']}>
                  {substitutionNotice}
                </p>
              )}
            </div>
          </div>

          {/* PDF Pages rendering container */}
          <div className={workspaceStyles['pages-container']} onClick={deactivateAll}>
            {Array.from({ length: numPages }).map((_, pageIdx) => {
              const size = pageSizes[pageIdx] || { width: PAGE_WIDTH_DEFAULT_PTS, height: PAGE_HEIGHT_DEFAULT_PTS };

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
                          onClone={makeOnClone(el.id, el.pageIndex, el.type)}
                          pageWidthPoints={size.width}
                        >
                          {getElementDefinition(el.type).render({
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
            <button type="button" className={`${pdfToolStyles['tool-primary-action']} ${workspaceStyles['export-action']}`} onClick={handleDownloadPdf}>
              Download
            </button>
            {canSharePdf && (
              <button type="button" className={`${pdfToolStyles['tool-primary-action']} ${workspaceStyles['export-action']} ${workspaceStyles['export-share']}`} onClick={shareReady ? handleSharePdf : handleSavePdf}>
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
      {status === 'error' && (
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
