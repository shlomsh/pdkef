import { useRef, useCallback, useEffect, useMemo } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PAGE_WIDTH_DEFAULT_PTS, PAGE_HEIGHT_DEFAULT_PTS, DEFAULT_COLOR_BLUE, DEFAULT_FONT_FAMILY } from '../../../constants/signGeometry.js';
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
import type { EditorElement, EditorElementPatch, TextElement } from '../../../editor/model/editorModel.ts';
import { createElementId } from '../../../editor/model/ids.ts';
import { orderTypableFields } from '../../../editor/text/fieldOrder.ts';
import { useDocumentStyle, useSignTool } from './SignToolContext.tsx';
import { chooseStyle } from '../chooseStyle.ts';
import { useSavedSignatures } from './SavedSignaturesContext.tsx';
import SignToolbar from './SignToolbar.tsx';
import EditorExportActions from '../../../editor-ui/EditorExportActions.tsx';
import FormFieldHints from './FormFieldHints.tsx';
import type { FormFieldRegions } from '../useFormFieldRegions.ts';
import { describeFormDetectionFailure } from '../formDetectionDetail.ts';
import type { FieldNavigation } from '../useFieldNavigation.ts';
import useWorkspaceGestures from '../useWorkspaceGestures.js';
import type { PendingSignaturePlacement } from '../useWorkspaceGestures.ts';
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
import { createUpdateEntry } from '../../../editor/model/updateKind.ts';
import { uniqueId } from '../../../editor/model/ids.ts';
import { englishSignMessages, formatMessage, signElementTypeLabel, signUpdateDescription, type SignMessages } from '../../../i18n/toolMessages';
import pdfToolStyles from '../../../shell/PdfTool.module.css';
import workspaceStyles from '../../../editor-ui/Workspace.module.css';
import formFieldHintStyles from './FormFieldHints.module.css';
import {
  classifyTouchTap,
  isBlankAreaTarget,
  type TapGestureSample,
} from '../tapOutsideDeselect.ts';
import { useFill } from '../fill/FillContext.tsx';
import FillLayer from '../fill/FillLayer.tsx';
import FocusProxy from '../fill/FocusProxy.tsx';
import useFillTap from '../fill/useFillTap.ts';
import { fillToolOf } from '../fill/fillTap.ts';
import { enterKeyHint } from '../fill/fillOrder.ts';
import { boxOf, documentFillItems, fillItemIndex, fillItemsByPage, fillReachTargets } from '../fill/fillWorkspace.ts';
import { elementForSlot, type SlotElementBase } from '../fill/slotElement.ts';
import { fillKeyOf, focusNextFillInput } from '../fill/fillDom.ts';
import type { FillItem, FillSlot, ReachTarget } from '../fill/fillTypes.ts';
import fillStyles from '../fill/fill.module.css';

const DEFAULT_PAGE_GEOMETRY = createPageGeometry({
  cropBox: { x: 0, y: 0, width: PAGE_WIDTH_DEFAULT_PTS, height: PAGE_HEIGHT_DEFAULT_PTS },
});

// MOBI-30: a touch tap that lands on any of these (an element, its toolbar,
// its resize handles, the page header's Clear button, a form-field hint, or
// any other ordinary control) is never "blank page area" - see
// handlePagesContainerTouchEnd below. `[data-editor-actions]` and
// `[data-editor-resizer]` are already inside `[data-editor-element]` in the
// current DOM (DraggableWrapper.tsx), but are named explicitly rather than
// relied on transitively, since nothing here enforces that nesting.
const BLANK_AREA_EXCLUDED_SELECTOR = [
  '[data-editor-element]',
  '[data-editor-actions]',
  '[data-editor-resizer]',
  '[data-editor-page-header]',
  `.${formFieldHintStyles['field-hints']}`,
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[contenteditable="true"]',
].join(', ');

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
  const {
    state: { selectedTool, elements, activeElementId, editingElementId, actionHistory, redoHistory },
    dispatch,
  } = useSignTool();
  // SIGN-35: the document's resolved style - its own carried keys over the
  // app-wide style (the person's latest choice in any document) - is what
  // every placement below starts from, never `carried` alone.
  const style = useDocumentStyle();
  useAutoFontProvisioning(elements);
  const { activeSignature } = useSavedSignatures();
  const activeElement = elements.find((el) => el.id === activeElementId);
  const activeTextElement = activeElement?.type === 'text' ? activeElement : null;
  // One preflight projection feeds every export affordance. It is intentionally
  // derived here, where the top toolbar, bottom actions, and review navigation
  // meet, rather than recreated in each of those presentation components.
  const exportReadiness = useMemo(() => getSignExportReadiness(elements), [elements]);

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
    initialColor: activeTextElement?.color || style.color,
    initialWhiteoutColor: style.whiteoutColor,
    initialStrokeWidth: style.strokeWidth,
    // The document's resolved style (SIGN-35: its own carried keys over the
    // app-wide style), never the currently selected element's own - a comb
    // shrunk to fit its own cell must not leak that shrink into the next,
    // unrelated placement. See useWorkspaceGestures.ts's fieldFontSize-backed
    // resolution. A key neither the document nor the app-wide style has yet
    // falls back to auto-detecting direction from what is typed (as before);
    // once typing or an explicit toggle has set it, every field placed after
    // takes it, the same "whatever it ends up in carries" rule every carried
    // key follows.
    carried: style,
    initialDateFormat: style.dateFormat,
    initialSymbolWidth: style.symbolWidth,
    initialSymbolMark: style.symbolMark,
    pageSizes,
    nextElementIndex: elements.length,
    gestureCancelRef: placementGestureRef,
    messages,
  });

  // --- Fill mode (SNG-15, docs/sign-fill-mode.md). Inert unless ?next=1. ---
  // Slots take the document's resolved font and size (SIGN-35), never the
  // selected element's, so empty fields never re-layout as focus moves between
  // filled ones; a commit places exactly what a tap would.
  const fill = useFill();
  const fillTool = fillToolOf(selectedTool);
  const pageSizeOf = useCallback(
    (pageIndex: number): PageGeometry => pageSizes[pageIndex] || DEFAULT_PAGE_GEOMETRY,
    [pageSizes],
  );
  const directionOfPage = useCallback(
    (pageIndex: number) => formRegions.pageDirections?.[pageIndex] ?? 'ltr',
    [formRegions],
  );
  const fieldOrder = useMemo(
    () => (fill.enabled ? orderTypableFields(formRegions.combs, formRegions.cells, directionOfPage) : []),
    [fill.enabled, formRegions, directionOfPage],
  );
  const fillItems = useMemo<FillItem[]>(() => (fill.enabled ? documentFillItems({
    order: fieldOrder,
    textElements: elements.filter((el): el is TextElement => el.type === 'text'),
    freeAt: fill.freeAt,
    typography: { fontFamily: style.font ?? DEFAULT_FONT_FAMILY, carriedFontSize: style.fontSize ?? null },
    pageSizeOf,
    directionOfPage,
  }) : []), [fill.enabled, fieldOrder, elements, fill.freeAt, style.font, style.fontSize, pageSizeOf, directionOfPage]);
  const fillPages = useMemo(() => fillItemsByPage(fillItems, numPages), [fillItems, numPages]);
  const reachTargetsByPage = useMemo(() => {
    const byPage = new Map<number, ReachTarget[]>();
    if (!fill.enabled) return byPage;
    const boxOfItem = (item: FillItem) => boxOf(item, fieldOrder, (pageIndex) => pageSizeOf(pageIndex).height);
    for (const target of fillReachTargets(fillTool, fillItems, formRegions.checkboxes, boxOfItem)) {
      byPage.set(target.pageIndex, [...(byPage.get(target.pageIndex) ?? []), target]);
    }
    return byPage;
  }, [fill.enabled, fillTool, fillItems, fieldOrder, formRegions.checkboxes, pageSizeOf]);
  const enterKeyHintOf = (key: string) => enterKeyHint(fillItemIndex(fillItems, key), fillItems.length);

  // The base elementForSlot needs beyond the slot and its text - shared by
  // commitSlot (a real id, for the element that actually gets added) and
  // slotElementOf (a fixed preview id, for the live comb layout and
  // direction FieldSlot previews before anything is committed).
  const slotElementBase = useCallback((slot: FillSlot, id: string): SlotElementBase => {
    const size = pageSizeOf(slot.pageIndex);
    return {
      id,
      color: style.color ?? DEFAULT_COLOR_BLUE,
      carried: style,
      pageDirection: directionOfPage(slot.pageIndex),
      pageWidthPoints: size.width,
      pageHeightPoints: size.height,
    };
  }, [pageSizeOf, style, directionOfPage]);

  // The element this slot would become with `text` in it, for FieldSlot's
  // live comb layout and direction preview. A fixed id: it never reaches
  // ADD_ELEMENT, so nothing needs it to be unique.
  const slotElementOf = useCallback((slot: FillSlot, text: string) =>
    elementForSlot(slot, text, slotElementBase(slot, 'fill-slot-preview')),
  [slotElementBase]);

  // A slot left with text in it becomes a text element: one ADD_ELEMENT, one undo
  // step, built from exactly what handlePageClick places a tap with. Like a tap,
  // the first placement seeds only the document's size (SIGN-35: seeding is not
  // choosing, so the font is never seeded).
  const commitSlot = useCallback((slot: FillSlot, text: string) => {
    const element = elementForSlot(slot, text, slotElementBase(slot, createElementId()));
    if (style.fontSize === undefined) dispatch({ type: 'SET_CARRIED', payload: { fontSize: element.fontSize } });
    dispatch({ type: 'ADD_ELEMENT', payload: element });
    logAction('add', 'ADD_TEXT', slot.pageIndex, t.addedTextBoxDescription, [captureAddedElement(element, elements.length)]);
  }, [slotElementBase, style, dispatch, logAction, t, elements.length]);

  // --- Stable element mutation callbacks (hoisted out of the map loop) ---
  // Hoisted so the map loop does not allocate a closure per element; several
  // of these depend on `elements` and so change identity when it does.

  // A new id per text edit session, so a session's typing is one Undo step.
  const editSession = useMemo(() => uniqueId(), [editingElementId]);

  // Every move, resize, style change and keystroke passes through here; one
  // gesture commits once (src/lib/gestures/controller.ts), typing groups by
  // edit session, pushCommand folds bursts.
  const updateElement = useCallback((id: string, changes: EditorElementPatch) => {
    const element = elements.find((e) => e.id === id);
    dispatch({ type: 'UPDATE_ELEMENT', payload: { id, changes } });
    const entry = element && createUpdateEntry(
      element,
      changes as Partial<EditorElement>,
      (kind) => signUpdateDescription(t, kind, element.type),
      editingElementId === id ? editSession : undefined,
    );
    if (entry) dispatch({ type: 'ADD_ACTION_HISTORY', payload: entry });
  }, [dispatch, elements, editingElementId, editSession, t]);

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
    // SIGN-33: whatever the person sets on an element (colour, font, A-/A+ or
    // a resize drag, direction, alignment, bold, italic, date format, symbol
    // mark and size, line thickness, whiteout colour, signature width) becomes
    // this document's carried style, so the next element starts in it. A
    // placement's own fit-shrink never comes through here, so it never
    // carries. SIGN-35: the same explicit change also writes the app-wide
    // style, so a new document starts from it too - see chooseStyle.ts.
    if (element) chooseStyle(element, fields, dispatch);
  }, [updateElement, elements, dispatch]);

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
    // MOBI-30: the keyboard should go down with the box. A real mouse click
    // elsewhere blurs the textarea for free (focus just moves), but the
    // touch-tap path below never moves focus anywhere - nothing else asks
    // for it - so it has to be done explicitly here, which also covers the
    // ordinary mouse/onClick path for free.
    // Fill mode (SNG-15): a slot is an <input>, and it goes down the same way.
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement || (active instanceof HTMLElement && fillKeyOf(active) !== null)) {
      active.blur();
    }
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
  }, [dispatch]);

  // --- MOBI-30: touch-tap-outside deselect (see tapOutsideDeselect.ts) ---
  //
  // `onClick={deactivateAll}` below only ever fires from a browser-synthesised
  // `click`, which a real iPhone can suppress entirely: a tap with a few
  // points of finger jitter (worse while pinch-zoomed) reads to iOS as the
  // start of a pan, so it fires `pointercancel` and never synthesises a
  // click - but `touchstart`/`touchend` still fire. This is a one-shot
  // recognition on release, not a live gesture: nothing here runs during
  // `touchmove` (there is no `touchmove` listener at all), and the only refs
  // held across the gesture are the start sample and the touch identifier -
  // see the gesture golden rule in `.claude/rules/editor.md`.
  //
  // Skipped entirely while a tool is armed: `useWorkspaceGestures`' overlay
  // handlers own that tap (placing an element, or a drag-tool's own
  // `touchstart` already having called `stopPropagation`), and re-checked at
  // release since arming never changes mid-gesture but the check is cheap
  // enough not to assume it.
  const touchTapStartRef = useRef<TapGestureSample | null>(null);
  const touchTapIdRef = useRef<number | null>(null);
  const touchTapMultiRef = useRef(false);

  const readScrollTop = () =>
    (workspaceRef.current?.scrollTop || 0) + (document.scrollingElement?.scrollTop || 0);

  const readTapSample = (touch: Touch, time: number): TapGestureSample => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    return {
      x: touch.clientX,
      y: touch.clientY,
      time,
      viewportScale: vv?.scale ?? 1,
      viewportOffsetLeft: vv?.offsetLeft ?? 0,
      viewportOffsetTop: vv?.offsetTop ?? 0,
      scrollTop: readScrollTop(),
    };
  };

  const resetTouchTap = () => {
    touchTapStartRef.current = null;
    touchTapIdRef.current = null;
    touchTapMultiRef.current = false;
  };

  const handlePagesContainerTouchStart = (e: TouchEvent) => {
    if (e.touches.length > 1) {
      // A second finger joining disqualifies the whole sequence, even the
      // touch that started it - a pinch always disqualifies, never resets
      // into tracking the newest finger.
      touchTapMultiRef.current = true;
      return;
    }
    const touch = e.changedTouches[0];
    if (!touch) return;
    touchTapStartRef.current = readTapSample(touch, Date.now());
    touchTapIdRef.current = touch.identifier;
    touchTapMultiRef.current = false;
  };

  const handlePagesContainerTouchEnd = (e: TouchEvent) => {
    const start = touchTapStartRef.current;
    const trackedId = touchTapIdRef.current;
    if (!start || trackedId == null) return;
    const endTouch = Array.from(e.changedTouches).find((t) => t.identifier === trackedId);
    if (!endTouch) return; // some other touch ended; the tracked one is still down
    const multiTouch = touchTapMultiRef.current;
    const end = readTapSample(endTouch, Date.now());
    resetTouchTap();

    // A touchend another handler already preventDefault()ed (e.g. useFillTap's
    // fill-mode tap-to-place, `?next=1`) was a tap on something, not blank space -
    // don't undo what that handler just did by deselecting here.
    if (e.defaultPrevented) return;
    if (selectedTool) return; // an armed tool's own overlay gesture owns this tap
    if (!classifyTouchTap(start, end, { multiTouch })) return;
    if (!isBlankAreaTarget(e.target, BLANK_AREA_EXCLUDED_SELECTOR)) return;

    deactivateAll();
  };

  const handlePagesContainerTouchCancel = () => {
    resetTouchTap();
  };

  // Fill mode: the page overlay's taps and hover (useFillTap decides nothing itself).
  const fillTap = useFillTap({
    tool: fillTool,
    targetsOf: (pageIndex) => reachTargetsByPage.get(pageIndex) ?? [],
    pageGeometryOf: (pageIndex) => pageSizes[pageIndex],
    engaged: () => fillKeyOf(document.activeElement) !== null || activeElementId !== null,
    delegate: (event, pageIndex, at, tool) => handlePageClick(event, pageIndex, at, tool),
    dismiss: deactivateAll,
  });

  // One element, drawn exactly as production draws it; fill mode renders text
  // elements through FillLayer (in reading order) and the rest here.
  const renderElement = (el: EditorElement, size: PageGeometry) => (
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
      /* MOBI-16: only the element actually in the edit
         session gets a fieldNav, and only when the
         document has a detected field to walk at all -
         same `hasFields` gate SignToolbar.tsx uses for
         the top toolbar's copy of this control, so a
         free-placed box in a document with no detected
         fields still gets today's full toolbar rather
         than a Previous/Next pair with nowhere to go.
         Every other wrapper's prop stays the stable
         `null` default, so this never re-renders a
         wrapper that isn't about to collapse its
         toolbar. Off in fill mode: the platform's own
         next and previous do the hopping there. */
      fieldNav={!fill.enabled && fieldNavigation.hasFields && editingElementId === el.id ? {
        hasNext: fieldNavigation.hasNext,
        hasPrevious: fieldNavigation.hasPrevious,
        onNext: fieldNavigation.goToNext,
        onPrevious: fieldNavigation.goToPrevious,
        direction: fieldNavigation.direction,
      } : null}
    >
      {ELEMENT_RENDERERS[el.type]({
        element: el,
        onChange: makeOnChange(el.id),
        onSelect: makeOnSelect(el.id),
        pageWidthPoints: size.width,
        messages,
      })}
    </DraggableWrapper>
  );

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

          {fill.enabled && <FocusProxy />}

          {/* PDF Pages rendering container */}
          <div
            className={workspaceStyles['pages-container']}
            onClick={(e) => {
              // Fill mode: a click on a fill input is that input's own focus.
              if (fillKeyOf(e.target as Element | null) !== null) return;
              deactivateAll();
            }}
            onTouchStart={handlePagesContainerTouchStart}
            onTouchEnd={handlePagesContainerTouchEnd}
            onTouchCancel={handlePagesContainerTouchCancel}
          >
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
                      className={`${workspaceStyles['page-overlay']}${fill.enabled && fillTool !== 'text' && fillTool !== 'none' ? ` ${fillStyles['taps-go-to-tool']}` : ''}`}
                      // Capture sees a tap on an existing checkbox mark before
                      // its wrapper consumes the bubble event, so the same
                      // detected square remains a real toggle target. Fill mode
                      // asks fillTapDecision first (useFillTap).
                      onClickCapture={(e) => (fill.enabled ? fillTap.onClickCapture(e, pageIdx) : handlePageClick(e, pageIdx))}
                      onMouseDown={(e) => {
                        if (fill.enabled) fillTap.onMouseDown();
                        handleOverlayPointerDown(e, pageIdx);
                      }}
                      // Capture, not bubble: an element's own touchstart stops
                      // propagation (makeOnSelect), and fill mode must still see a
                      // touch that starts on a mark to untick its box at touchend.
                      onTouchStartCapture={fill.enabled ? (e) => fillTap.onTouchStart(e, pageIdx) : undefined}
                      onTouchStart={(e) => handleOverlayPointerDown(e, pageIdx)}
                      onTouchEnd={fill.enabled ? (e) => fillTap.onTouchEnd(e, pageIdx) : undefined}
                      onTouchCancel={fill.enabled ? fillTap.onTouchCancel : undefined}
                      onPointerMove={fill.enabled ? (e) => fillTap.onPointerMove(e, pageIdx) : undefined}
                      onPointerLeave={fill.enabled ? fillTap.onPointerLeave : undefined}
                    >
                      {/* In fill mode a slot draws its own frame over a comb or cell. */}
                      {!fill.enabled && (selectedTool === 'text' || selectedTool === 'date') && (
                        <>
                          <FormFieldHints regions={formRegions.combs} kind="comb" pageIndex={pageIdx} />
                          <FormFieldHints regions={formRegions.cells} kind="cell" pageIndex={pageIdx} />
                        </>
                      )}
                      {selectedTool === 'symbol' && (
                        <FormFieldHints regions={formRegions.checkboxes} kind="checkbox" pageIndex={pageIdx} aimedKey={fill.aimedKey} />
                      )}
                      {fill.enabled ? (
                        <>
                          {pageElements.filter((el) => el.type !== 'text').map((el) => renderElement(el, size))}
                          {/* After the rest, so typed text sits above a whiteout drawn under it. */}
                          <FillLayer
                            items={fillPages[pageIdx] ?? []}
                            pageWidthPoints={size.width}
                            enterKeyHintOf={enterKeyHintOf}
                            slotLabel={t.textButton}
                            renderText={(el) => renderElement(el, size)}
                            onEnter={focusNextFillInput}
                            onCommitSlot={commitSlot}
                            slotElementOf={slotElementOf}
                          />
                        </>
                      ) : pageElements.map((el) => renderElement(el, size))}
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
