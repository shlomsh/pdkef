import { useRef, useCallback, useEffect, useMemo } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PAGE_WIDTH_DEFAULT_PTS, PAGE_HEIGHT_DEFAULT_PTS } from '../../../constants/signGeometry.js';
import PdfPageCanvas from '../../../editor-ui/PdfPageCanvas.tsx';
import EditorPageHeader from '../../../editor-ui/EditorPageHeader.tsx';
import DraggableWrapper from './DraggableWrapper.tsx';
import { createElementRenderers } from '../../../editor/registry/renderers.ts';
import TextNode from './nodes/TextNode.tsx';
import ShapeNode from './nodes/ShapeNode.tsx';
import LineNode from './nodes/LineNode.tsx';
import SignatureNode from './nodes/SignatureNode.tsx';
import SymbolNode from './nodes/SymbolNode.tsx';
import WhiteoutNode from './nodes/WhiteoutNode.tsx';
import type { EditorElement, EditorElementPatch } from '../../../editor/model/editorModel.ts';
import { useSignTool } from './SignToolContext.tsx';
import { useSignDefaults } from './SignDefaultsContext.tsx';
import { useSavedSignatures } from './SavedSignaturesContext.tsx';
import SignToolbar from './SignToolbar.tsx';
import EditorExportActions from '../../../editor-ui/EditorExportActions.tsx';
import FormFieldHints from './FormFieldHints.tsx';
import type { FormFieldRegions } from '../useFormFieldRegions.ts';
import { describeFormDetectionFailure } from '../formDetectionDetail.ts';
import type { FieldNavigation } from '../useFieldNavigation.ts';
import useWorkspaceGestures from '../useWorkspaceGestures.js';
import type { PendingSignaturePlacement } from '../useWorkspaceGestures.ts';
import { detectTextDirection } from '../../../lib/signHelpers.js';
import { formatDate, isDateFormatId } from '../../../editor/text/dateFormat.ts';
import { useAutoFontProvisioning } from '../useAutoFontProvisioning.js';
import { getSignExportReadiness } from '../signExportReadiness.ts';
import { createPageGeometry } from '../../../editor/geometry/coords.js';
import type { PageGeometry } from '../../../editor/geometry/coords.ts';
import {
  captureAddedElement,
  captureElementSnapshots,
  type HistoryLogger,
} from '../../../editor/model/actionHistory.ts';
import { englishSignMessages, formatMessage, signElementTypeLabel, type SignMessages } from '../../../i18n/toolMessages';
import pdfToolStyles from '../../../shell/PdfTool.module.css';
import workspaceStyles from '../../../editor-ui/Workspace.module.css';

const DEFAULT_PAGE_GEOMETRY = createPageGeometry({
  cropBox: { x: 0, y: 0, width: PAGE_WIDTH_DEFAULT_PTS, height: PAGE_HEIGHT_DEFAULT_PTS },
});

// PdfSignTool.tsx builds the real one (it owns the state useFieldNavigation
// needs); this is only what a caller that never detected any fields - or a
// unit test that mounts PdfWorkspace on its own - falls back to, so
// SignToolbar always has something to read rather than an optional prop it
// has to guard everywhere.
const NOOP_FIELD_NAVIGATION: FieldNavigation = {
  hasFields: false,
  hasNext: false,
  hasPrevious: false,
  direction: 'ltr',
  goToNext: () => {},
  goToPrevious: () => {},
};

// Sign's own map of the seven node components it draws, built once at module
// load. Redact never builds this map with anything - its whiteout/blackout/
// blur elements always take the `renderTarget: 'redact'` branch inside
// createElementRenderers(), which is core-only and never touches a supplied
// component.
const ELEMENT_RENDERERS = createElementRenderers({
  text: TextNode,
  rectangle: ShapeNode,
  ellipse: ShapeNode,
  line: LineNode,
  symbol: SymbolNode,
  signature: SignatureNode,
  whiteout: WhiteoutNode,
});

export default function PdfWorkspace({
  status,
  isPseudoFullscreen,
  workspaceRef,
  numPages,
  pageSizes,
  formRegions = { detection: 'pending', combs: [], checkboxes: [], cells: [], pageDirections: [] },
  pdfDocument,
  pageWrapperRefs,
  setTempPlacement,
  setDialogOpen,
  logAction,
  handleSavePdf,
  handleDownloadPdf,
  handleSharePdf,
  setAnnouncement,
  onUndo,
  onRedo,
  toggleFullscreen,
  isFullscreen,
  placeSignatureAt,
  canSharePdf = false,
  shareReady = false,
  errorDetail = null,
  fieldNavigation = NOOP_FIELD_NAVIGATION,
  messages,
}: {
  status: string;
  isPseudoFullscreen: boolean;
  workspaceRef: { current: HTMLDivElement | null };
  numPages: number;
  pageSizes: PageGeometry[];
  /** Printed grids recovered from the page's own content (MOBI-03); empty until detected. */
  formRegions?: FormFieldRegions;
  pdfDocument: PDFDocumentProxy | null;
  pageWrapperRefs: { current: (HTMLDivElement | null)[] };
  setTempPlacement: (placement: PendingSignaturePlacement) => void;
  setDialogOpen: (open: boolean) => void;
  logAction: HistoryLogger<EditorElement>;
  handleSavePdf: () => void;
  handleDownloadPdf: () => void;
  handleSharePdf: () => void;
  setAnnouncement: (msg: string) => void;
  /** The tool's own single-step undo and redo, passed through to the toolbar.
   * They come from PdfSignTool rather than straight from the reducer because
   * each one also announces what it moved. `canRedo` is read from the context
   * below, beside `actionHistory`. */
  onUndo: () => void;
  onRedo: () => void;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
  placeSignatureAt: (
    dataUrl: string,
    aspectRatio: number,
    pageIndex: number,
    leftPercent: number,
    topPercent: number,
  ) => void;
  canSharePdf?: boolean;
  shareReady?: boolean;
  /** Overrides the default error copy below with a specific, nameable reason. */
  errorDetail?: string | null;
  /** Next/Previous across detected fields (MOBI-06); PdfSignTool.tsx builds the
   * real one so its own Tab shortcut and this toolbar's control share one
   * hasNext/hasPrevious and one goToNext/goToPrevious. */
  fieldNavigation?: FieldNavigation;
  /** LOC-09 stage 1: the toolbar row's own catalogue, passed straight through
   * from PdfSignTool.tsx to SignToolbar.tsx - see src/i18n/toolMessages.ts's
   * SignMessages. Optional and English-default so PdfWorkspace.test.tsx (which
   * never passes it) is unaffected. Also supplies EditorPageHeader's lang/dir
   * (bidi-isolation wrapper, 5a1af03) for each rendered page. */
  messages?: Partial<SignMessages>;
}) {
  const t: SignMessages = { ...englishSignMessages, ...messages };
  const placementGestureRef = useRef<(() => void) | null>(null);
  useEffect(() => () => placementGestureRef.current?.(), []);
  const { state: { selectedTool, elements, activeElementId, editingElementId, actionHistory, redoHistory }, dispatch } = useSignTool();
  useAutoFontProvisioning(elements);
  const {
    lastColor, lastWhiteoutColor, lastFont, lastFontSize, lastThickness, lastSymbolWidth, lastSymbolMark, lastDateFormat,
    rememberColor, rememberWhiteoutColor, rememberFont, rememberFontSize, rememberDirection, rememberThickness, rememberSymbolWidth, rememberSymbolMark, rememberSignatureWidth, rememberDateFormat
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
    formRegions,
    elements,
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
    initialDateFormat: lastDateFormat,
    initialSymbolWidth: lastSymbolWidth,
    initialSymbolMark: lastSymbolMark,
    pageSizes,
    nextElementIndex: elements.length,
    gestureCancelRef: placementGestureRef,
    messages,
  });

  // --- Stable element mutation callbacks (hoisted out of the map loop) ---
  // These are keyed on dispatch/remember* which are stable across renders, so
  // useCallback gives us referential stability without the per-element closure
  // allocation that was happening inside the .map() call.

  const updateElement = useCallback((id: string, changes: EditorElementPatch) => {
    dispatch({ type: 'UPDATE_ELEMENT', payload: { id, changes } });
  }, [dispatch]);

  const deleteElement = useCallback((id: string) => {
    const el = elements.find(e => e.id === id);
    const snapshots = captureElementSnapshots(elements, (element) => element.id === id);
    dispatch({ type: 'DELETE_ELEMENT', payload: id });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    if (el) logAction('delete', 'DELETE_ELEMENT', el.pageIndex, formatMessage(t.deletedElementDescriptionTemplate, { label: signElementTypeLabel(t, el.type) }), snapshots);
    setAnnouncement(t.removedElement);
  }, [dispatch, setAnnouncement, elements, logAction, t]);

  // Factory: returns a stable onChange handler for DraggableWrapper / TextNode.
  // Defined with useCallback so the factory reference is stable; the returned
  // function closes over the element id captured at call time.
  const makeOnChange = useCallback((id: string) => (fields: EditorElementPatch) => {
    const element = elements.find(e => e.id === id);
    // Typing over a placed date field's own text detaches it from the format
    // control (ElementToolbar's cycle button reads dateFormatId/dateValue) -
    // otherwise a later click on that control would silently discard whatever
    // was retyped. Only a plain text write does this; the cycle action itself
    // always sends dateFormatId alongside text, so it passes through.
    const patch = (element?.type === 'text' && isDateFormatId(element.dateFormatId) && element.dateValue
      && !('dateFormatId' in fields) && 'text' in fields && fields.text !== undefined
      && fields.text !== formatDate(element.dateValue, element.dateFormatId))
      ? { ...fields, dateFormatId: undefined, dateValue: undefined }
      : fields;
    updateElement(id, patch);
    if (fields.color) {
      if (element?.type === 'whiteout') {
        rememberWhiteoutColor(fields.color);
      } else {
        rememberColor(fields.color);
      }
    }
    if ('fontFamily' in fields && fields.fontFamily) rememberFont(fields.fontFamily);
    if ('fontSize' in fields && fields.fontSize) rememberFontSize(fields.fontSize);
    if ('strokeWidth' in fields && fields.strokeWidth) rememberThickness(fields.strokeWidth);
    // A resized symbol sets the size for the next one placed, so repeated marks
    // (check, x, dot) don't have to be re-sized one by one.
    if (element?.type === 'symbol' && 'width' in fields && fields.width !== undefined) rememberSymbolWidth?.(fields.width);
    // A switched symbol mark (check/x/dot) sets the mark for the next one
    // placed, so it doesn't silently reset to the check mark default.
    if (element?.type === 'symbol' && 'mark' in fields && fields.mark !== undefined) rememberSymbolMark?.(fields.mark);
    // A resized signature sets the size for the next one placed, so signing
    // multiple fields on the same form doesn't require re-sizing every time.
    if (element?.type === 'signature' && 'width' in fields && fields.width !== undefined) rememberSignatureWidth?.(fields.width);
    if (element?.type === 'text') {
      if ('textDirection' in fields && fields.textDirection) {
        rememberDirection(fields.textDirection);
      } else if ('text' in fields && fields.text !== undefined) {
        const typedDirection = detectTextDirection(fields.text);
        if (typedDirection) rememberDirection(typedDirection);
      }
      // A format switched on one date field (ElementToolbar's cycling control)
      // sets the format for the next 'date' tool placement, same as font/color.
      if ('dateFormatId' in fields && fields.dateFormatId) rememberDateFormat(fields.dateFormatId);
    }
  }, [updateElement, elements, rememberColor, rememberWhiteoutColor, rememberFont, rememberFontSize, rememberDirection, rememberThickness, rememberSymbolWidth, rememberSymbolMark, rememberSignatureWidth, rememberDateFormat]);

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
    logAction('add', 'DUPLICATE_ELEMENT', cloneInfo.pageIndex, formatMessage(t.duplicatedElementDescriptionTemplate, { label: signElementTypeLabel(t, cloneInfo.type) }), [captureAddedElement(cloneInfo, elements.length)]);
  }, [dispatch, elements.length, logAction, t]);

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
    setAnnouncement(t.reviewingFirstIssueAnnouncement);
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
      formatMessage(removed.length === 1 ? t.clearedPageDescriptionOne : t.clearedPageDescriptionOther, { count: removed.length, page: pageIndex + 1 }),
      snapshots
    );
    setAnnouncement(formatMessage(t.clearedPageAnnouncementTemplate, { page: pageIndex + 1 }));
  }, [elements, dispatch, logAction, setAnnouncement, t]);

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
            actionHistory={actionHistory}
            onUndo={onUndo}
            onRedo={onRedo}
            canRedo={redoHistory.length > 0}
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
            fieldNavigation={fieldNavigation}
            /* FORM-11: every region the detector published for this file,
               counted. It is deliberately the same set the hint overlay
               outlines - combs, free-text cells and checkboxes - so what the
               line says is exactly what a person can see and tap, rather than
               the smaller set Next/Previous walks. The toolbar gets the count,
               never the regions: a field's own label is content out of
               somebody's form. */
            formDetection={{
              state: formRegions.detection,
              count: formRegions.combs.length + formRegions.cells.length + formRegions.checkboxes.length,
              // The one line the Feedback report may carry. `detectionIssue`
              // is already content-free (the hook writes it itself, and it
              // outlives a later successful run on purpose); a caught error
              // is turned into text here and nowhere else, sanitised on the
              // way out - see formDetectionDetail.ts for what may survive
              // that and why the raw error may not.
              detail: formRegions.detectionIssue
                ?? (formRegions.detectionError === undefined
                  ? null
                  : describeFormDetectionFailure(formRegions.detectionError)),
            }}
            messages={messages}
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
                    clearTitle={t.clearPageTitle}
                    pageLabel={formatMessage(t.pageLabel, { number: pageIdx + 1 })}
                    clearLabel={t.clearPageLabel}
                    lang={t.lang}
                    dir={t.dir}
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
                      // Capture sees a tap on an existing checkbox mark before
                      // its wrapper consumes the bubble event, so the same
                      // detected square remains a real toggle target.
                      onClickCapture={(e) => handlePageClick(e, pageIdx)}
                      onMouseDown={(e) => handleOverlayPointerDown(e, pageIdx)}
                      onTouchStart={(e) => handleOverlayPointerDown(e, pageIdx)}
                    >
                      {(selectedTool === 'text' || selectedTool === 'date') && (
                        <>
                          <FormFieldHints regions={formRegions.combs} kind="comb" pageIndex={pageIdx} />
                          <FormFieldHints regions={formRegions.cells} kind="cell" pageIndex={pageIdx} />
                        </>
                      )}
                      {selectedTool === 'symbol' && (
                        <FormFieldHints regions={formRegions.checkboxes} kind="checkbox" pageIndex={pageIdx} />
                      )}
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
                          messages={messages}
                        >
                          {ELEMENT_RENDERERS[el.type]({
                            element: el,
                            onChange: makeOnChange(el.id),
                            onSelect: makeOnSelect(el.id),
                            pageWidthPoints: size.width,
                            messages,
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
          <EditorExportActions
            variant="completion"
            canShare={canSharePdf}
            shareReady={shareReady}
            disabled={status === 'signing' || exportReadiness.blocked}
            onDownload={handleDownloadPdf}
            onPrepareShare={handleSavePdf}
            onShare={handleSharePdf}
            describedBy={exportReadiness.blocked ? 'sign-export-readiness' : undefined}
          />
        </>
      )}

      {/* Signing state */}
      {status === 'signing' && (
        <div className={pdfToolStyles['status-block--compact']}>
          <span className={`${pdfToolStyles['tool-primary-action-progress']} ${pdfToolStyles['tool-primary-action-progress--standalone']}`}>
            <svg className={pdfToolStyles['progress-ring']} width="22" height="22" viewBox="0 0 40 40">
              <circle className={pdfToolStyles['progress-ring-track']} cx="20" cy="20" r="18" stroke="var(--color-border-strong)" />
            </svg>
            {t.savingDocumentLayers}
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
            <strong>{t.signingStoppedLabel}</strong> {errorDetail || t.pdfMayBeProtectedOrEncrypted}
          </span>
        </div>
      )}
    </div>
  );
}
