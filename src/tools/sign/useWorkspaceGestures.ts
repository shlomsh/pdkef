import usePdfCoordinates from '../../editor-ui/hooks/usePdfCoordinates.js';
import { startGesture } from '../../lib/gestures/controller.ts';
import type { GestureEvent } from '../../lib/gestures/controller.ts';
import { createElementId } from '../../editor/model/ids.ts';
import {
  captureAddedElement,
  captureElementSnapshots,
  type HistoryLogger,
} from '../../editor/model/actionHistory.ts';
import type {
  EditorElement,
  EditorElementPatch,
  SignToolType,
  SymbolMark,
  TextDirection,
} from '../../editor/model/editorModel.ts';
import type { SavedSignature } from '../../editor/model/savedSignature.ts';
import type { PageGeometry } from '../../editor/geometry/coords.ts';
import { getElementDefinition } from '../../editor/registry/index.ts';
import { ensureMinimumElementSize } from '../../editor/geometry/minimumSize.ts';
import {
  cellRegionAt,
  checkboxRegionAt,
  combRegionAt,
  placeTextOnField,
  type FieldRegion,
  type TypableField,
} from '../../editor/text/combPlacement.ts';
import { placeSymbolOnRegion } from '../../editor/registry/symbol.ts';
import { DESIGN_BOX, markInkExtent } from '../../editor/registry/symbolMarks.ts';
import { formatDate, isDateFormatId, toIsoDateString } from '../../editor/text/dateFormat.ts';
import type { FormFieldRegions } from './useFormFieldRegions.ts';
import { englishSignMessages, formatMessage, signElementTypeLabel, type SignMessages } from '../../i18n/toolMessages';
import {
  DEFAULT_COLOR_BLUE,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE_PT,
  DEFAULT_SYMBOL_WIDTH_PCT,
  ASPECT_RATIO_SYMBOL,
  TEXT_BOX_LINE_HEIGHT_EM,
  PAGE_HEIGHT_DEFAULT_PTS,
  PAGE_WIDTH_DEFAULT_PTS
} from '../../constants/signGeometry.js';

export type WorkspaceCreationTool = SignToolType;

export interface PendingSignaturePlacement {
  pageIndex: number;
  left: number;
  top: number;
}

type WorkspaceGestureAction =
  | { type: 'ADD_ELEMENT'; payload: EditorElement }
  | { type: 'UPDATE_ELEMENT'; payload: { id: string; changes: EditorElementPatch } }
  | { type: 'DELETE_ELEMENT'; payload: string }
  | { type: 'SET_ACTIVE_ELEMENT_ID'; payload: string | null }
  | { type: 'SET_EDITING_ELEMENT_ID'; payload: string | null }
  | { type: 'DISARM_TOOL' }
  | {
      type: 'ENSURE_MINIMUM_SIZE';
      payload: {
        id: string;
        tool: WorkspaceCreationTool;
        rectWidth: number;
        rectHeight: number;
        startLeftPercent: number;
        startTopPercent: number;
      };
    };

export interface WorkspaceGestureOptions {
  selectedTool: WorkspaceCreationTool | null;
  /** Existing document elements, used to toggle a mark already in a detected checkbox. */
  elements?: EditorElement[];
  dispatch: (action: WorkspaceGestureAction) => void;
  activeSignature: SavedSignature | null;
  setTempPlacement: (placement: PendingSignaturePlacement) => void;
  setDialogOpen: (open: boolean) => void;
  placeSignatureAt: (
    dataUrl: string,
    aspectRatio: number,
    pageIndex: number,
    leftPercent: number,
    topPercent: number,
  ) => void;
  logAction: HistoryLogger<EditorElement>;
  setAnnouncement: (message: string) => void;
  initialColor?: string;
  initialWhiteoutColor?: string;
  initialStrokeWidth?: number;
  initialFont?: string;
  initialFontSize?: number;
  initialDirection?: TextDirection | null;
  /** Remembered `dateFormat.ts` `DateFormatId`; the 'date' tool only. */
  initialDateFormat?: string;
  initialSymbolWidth?: number;
  initialSymbolMark?: SymbolMark;
  pageSizes?: PageGeometry[];
  /** Printed grids and free-text cells recovered from the page's own vector
   * content and text (MOBI-03, MOBI-11). */
  formRegions?: FormFieldRegions;
  nextElementIndex?: number;
  gestureCancelRef?: { current: (() => void) | null };
  /** LOC-16 stage 2-5: optional and English-default, same shape as
   * SignToolbar.tsx's `messages` prop. */
  messages?: Partial<SignMessages>;
}

export type PageClickEvent = MouseEvent & { currentTarget: HTMLElement };
export type PagePointerEvent = GestureEvent & { currentTarget: HTMLElement };

interface BoxPlacementPatch {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface LinePlacementPatch {
  x2: number;
  y2: number;
}

type PlacementPatch = BoxPlacementPatch | LinePlacementPatch;

/**
 * A detected checkbox is a real form field, not merely a spot on the page.
 *
 * Match its existing mark by the centre of the mark's ink rather than the
 * centre of its element box: a check's ink sits high within that box, and a
 * snapped x deliberately makes its box larger than the printed square. This
 * also makes a mark that was gently nudged but remains in its box removable.
 */
function symbolIsInCheckbox(element: EditorElement, region: FieldRegion): boolean {
  if (element.type !== 'symbol') return false;
  const ink = markInkExtent(element.mark);
  const x = element.left + (ink.centerX / DESIGN_BOX) * element.width;
  const y = element.top + (ink.centerY / DESIGN_BOX) * element.height;
  return x >= region.left
    && x <= region.left + region.width
    && y >= region.top
    && y <= region.top + region.height;
}

/**
 * Encapsulates the two gesture handlers that turn raw DOM pointer events on the
 * PDF page overlay into SignTool state dispatch calls.
 *
 * Extracted from PdfWorkspace to slim that component down and make the gesture
 * state machine independently testable.
 *
 */
export default function useWorkspaceGestures({
  selectedTool,
  dispatch,
  activeSignature,
  setTempPlacement,
  setDialogOpen,
  placeSignatureAt,
  logAction,
  setAnnouncement,
  initialColor = DEFAULT_COLOR_BLUE,
  initialWhiteoutColor = '#ffffff',
  initialStrokeWidth = DEFAULT_STROKE_WIDTH,
  initialFont = DEFAULT_FONT_FAMILY,
  initialFontSize = DEFAULT_FONT_SIZE_PT,
  initialDirection = null,
  initialDateFormat = 'locale',
  initialSymbolWidth = DEFAULT_SYMBOL_WIDTH_PCT,
  initialSymbolMark = 'check',
  pageSizes = [],
  formRegions = { detection: 'pending', combs: [], checkboxes: [], cells: [], pageDirections: [] },
  elements = [],
  nextElementIndex = 0,
  // PdfWorkspace supplies a ref it owns for component teardown. Keeping this
  // handler factory hook-free also preserves its direct unit-test contract.
  gestureCancelRef = { current: null },
  messages,
}: WorkspaceGestureOptions) {
  const t: SignMessages = { ...englishSignMessages, ...messages };
  const {
    getPointerCoords,
    getPointerPercent,
    getDeltaPercent,
    getWidthPercentToHeightPercent,
    getDimensions,
  } = usePdfCoordinates();

  /**
   * Handles a click on a page overlay for point-placement tools
   * (text, symbol, signature). No-ops for drag-drawn tools.
   */
  const handlePageClick = (e: PageClickEvent, pageIndex: number) => {
    if (!selectedTool) return;
    // 'date' has no registry entry of its own - it places an ordinary
    // TextElement (see editorModel.ts's SignToolType comment), prefilled below.
    const definition = getElementDefinition(selectedTool === 'date' ? 'text' : selectedTool);
    if (definition.creation.mode !== 'point') {
      if (definition.creation.mode === 'external' && selectedTool === 'signature') {
        const container = e.currentTarget;
        const { x: leftPercent, y: topPercent } = getPointerPercent(e, container, pageSizes[pageIndex]);
        if (activeSignature) {
          placeSignatureAt(activeSignature.dataUrl, activeSignature.aspectRatio, pageIndex, leftPercent, topPercent);
          dispatch({ type: 'DISARM_TOOL' });
        } else {
          setTempPlacement({ pageIndex, left: leftPercent, top: topPercent });
          setDialogOpen(true);
        }
      }
      return;
    }
    const container = e.currentTarget;
    const pageGeometry = pageSizes[pageIndex];
    const { x: leftPercent, y: topPercent } = getPointerPercent(e, container, pageGeometry);

    const id = createElementId();
    const symbolWidth = initialSymbolWidth;
    // A text box's on-screen height is its font size (points) scaled by the same
    // factor the page itself is rendered at, so as a share of the page it is just
    // em-height / page height in points — no DOM measurement needed.
    const pageHeightPoints = pageGeometry?.height || PAGE_HEIGHT_DEFAULT_PTS;
    const textHeight = (initialFontSize * TEXT_BOX_LINE_HEIGHT_EM / pageHeightPoints) * 100;
    if (!definition.creation.create) return;
    const newEl = definition.creation.create({
      id,
      pageIndex,
      point: { left: leftPercent, top: topPercent },
      color: initialColor,
      whiteoutColor: initialWhiteoutColor,
      strokeWidth: initialStrokeWidth,
      font: initialFont,
      fontSize: initialFontSize,
      direction: initialDirection,
      symbolWidth,
      symbolHeight: getWidthPercentToHeightPercent(symbolWidth, ASPECT_RATIO_SYMBOL, container),
      symbolMark: initialSymbolMark,
      textHeight,
    });
    if (selectedTool === 'date' && newEl.type === 'text') {
      const dateValue = toIsoDateString(new Date());
      const dateFormatId = isDateFormatId(initialDateFormat) ? initialDateFormat : 'locale';
      newEl.text = formatDate(dateValue, dateFormatId);
      newEl.dateFormatId = dateFormatId;
      newEl.dateValue = dateValue;
    }
    // A text box placed on a printed grid takes that grid's span and cell
    // count, so the person types once instead of dragging a side handle until
    // the digits happen to line up (MOBI-04). It stays an ordinary text
    // element with `width` set - `isComb` is still derived from `width` and
    // gains no second source of truth - so undo, draft persistence and the
    // export registry all carry on unchanged. 'date' places an ordinary text
    // element too (see the definition lookup above), so it gets the same
    // snap as 'text' throughout this block.
    const point = { x: leftPercent, y: topPercent };
    const snapsToFields = selectedTool === 'text' || selectedTool === 'date';
    const combRegion = snapsToFields
      ? combRegionAt(formRegions.combs, point, pageIndex)
      : null;
    // A free-text cell (MOBI-11: a name, an address line - no fixed pitch)
    // only matters when the tap did not already land on a comb; combs are
    // the more specific match and formCells.js already skips any cell that
    // overlaps one, so this is a defensive ordering rather than a real
    // ambiguity today.
    //
    // A signature cell (a closed box captioned "signature", or SNG-10's open
    // signature line) is excluded here, not upstream in `formRegions.cells`
    // (`useFormFieldRegions.ts`'s own doc on that field says why): signature
    // placement is a different creation mode, a saved-signature dialog, not
    // a point tap, so a signature region is never a typable target for the
    // text/date tool - the count and the hint overlay still know it exists.
    const cellRegion = snapsToFields && !combRegion
      ? cellRegionAt(formRegions.cells.filter((cell) => cell.kind !== 'signature'), point, pageIndex)
      : null;
    const field: TypableField | null = combRegion
      ? { kind: 'comb', region: combRegion }
      : cellRegion ? { kind: 'cell', region: cellRegion } : null;
    // A field-spanned box has no growing edge to anchor either way
    // (combPlacement.ts) and is sitting on one specific spot on a page whose
    // own text already reads a given direction, so it takes that direction -
    // never `initialDirection`'s product default - the same seed
    // useFieldNavigation.ts uses for the identical case reached by Next
    // instead of a tap. getEffectiveTextDirection only honours this seed for
    // a field-spanned box in the first place (see its own doc), so a free
    // placement elsewhere still gets `initialDirection` untouched.
    if (field && newEl.type === 'text') {
      newEl.textDirection = formRegions.pageDirections?.[pageIndex] ?? initialDirection ?? 'ltr';
    }
    const checkboxRegion = selectedTool === 'symbol'
      ? checkboxRegionAt(formRegions.checkboxes, point, pageIndex)
      : null;

    // A printed square acts as a toggle, not an ever-growing stack of marks.
    // Do this before creating the candidate element so the second tap remains
    // a single reversible delete action, including after a draft restore.
    const existingCheckboxMark = checkboxRegion
      ? elements.find((element) => symbolIsInCheckbox(element, checkboxRegion))
      : null;
    if (existingCheckboxMark) {
      e.stopPropagation();
      const snapshots = captureElementSnapshots(elements, (element) => element.id === existingCheckboxMark.id);
      dispatch({ type: 'DELETE_ELEMENT', payload: existingCheckboxMark.id });
      dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
      dispatch({ type: 'DISARM_TOOL' });
      logAction(
        'delete',
        'DELETE_ELEMENT',
        existingCheckboxMark.pageIndex,
        t.removedSymbolFromBoxDescription,
        snapshots,
      );
      setAnnouncement(t.removedSymbolFromBoxAnnouncement);
      return;
    }

    // A mark covers the very target that toggles it. Check for a detected-box
    // toggle above before treating clicks on an editor element as selection or
    // dragging gestures; ordinary annotations still retain that behaviour.
    if ((e.target as Element | null)?.closest('[data-editor-element]')) return;

    e.stopPropagation();
    // A comb takes the run's span and cell count; a free-text cell gives the
    // box the cell's span as `minWidth`, never `width`, with its font size
    // cellFontSize's answer rather than whatever was last used - see
    // placeTextOnCell's own docstring for why. placeTextOnField is the one
    // owner of both, shared with the Next/Previous field move
    // (useFieldNavigation) - neither kind needs `direction` any more, since
    // neither has an anchored edge left to flip (see its own docstring).
    const snapped = field
      ? placeTextOnField(field, {
        fontSize: initialFontSize,
        fontFamily: initialFont,
        pageWidthPoints: pageGeometry?.width || PAGE_WIDTH_DEFAULT_PTS,
        pageHeightPoints,
      })
      : (checkboxRegion && placeSymbolOnRegion(checkboxRegion, initialSymbolMark, {
        pageWidthPoints: pageGeometry?.width || PAGE_WIDTH_DEFAULT_PTS,
        pageHeightPoints,
      }));
    const placed = snapped ? { ...newEl, ...snapped } : newEl;

    dispatch({ type: 'ADD_ELEMENT', payload: placed });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
    // One placement per arming, so the next click on empty page area falls
    // through to the workspace's deselect handler instead of making a second
    // element the user never asked for. A locked tool stays armed. Landing on
    // a detected field is still one placement, so it disarms the same way.
    dispatch({ type: 'DISARM_TOOL' });
    if (selectedTool === 'text') {
      // A box you just placed opens ready to type - the one case where placing
      // and editing are the same intent. This replaces the old per-element
      // `autoFocus` flag, so the caret has exactly one owner.
      dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: id });
      logAction('add', 'ADD_TEXT', pageIndex, t.addedTextBoxDescription, [captureAddedElement(placed, nextElementIndex)]);
      setAnnouncement(combRegion
        ? formatMessage(t.addedTextBoxCombAnnouncementTemplate, { cells: combRegion.cells })
        : t.addedTextBoxAnnouncement);
    } else if (selectedTool === 'date') {
      // Already has its content, unlike a freshly placed (empty) text box, so
      // this selects it for the format control rather than opening a typing
      // session on text nobody is about to retype.
      logAction('add', 'ADD_TEXT', pageIndex, t.addedDateBoxDescription, [captureAddedElement(placed, nextElementIndex)]);
      setAnnouncement(t.addedDateBoxAnnouncement);
    } else {
      logAction('add', 'ADD_SYMBOL', pageIndex, t.addedSymbolDescription, [captureAddedElement(placed, nextElementIndex)]);
      setAnnouncement(checkboxRegion ? t.addedSymbolInBoxAnnouncement : t.addedSymbolAnnouncement);
    }
  };

  /**
   * Handles pointer-down on the page overlay for drag-drawn tools
   * (whiteout, line, ellipse, rectangle). Attaches global move/up listeners
   * for the duration of the drag gesture, then cleans them up on pointer-up.
   */
  const handleOverlayPointerDown = (e: PagePointerEvent, pageIndex: number) => {
    if (!selectedTool) return;
    // 'date' is point-mode (see handlePageClick above) so this always returns
    // before using the definition either way; resolved the same for the type
    // checker.
    const definition = getElementDefinition(selectedTool === 'date' ? 'text' : selectedTool);
    if (definition.creation.mode !== 'drag' || !definition.creation.create) return;
    if ((e.target as Element | null)?.closest('[data-editor-element]')) return;
    e.stopPropagation();

    if (!('touches' in e) || !e.touches) e.preventDefault();

    const tool = selectedTool;
    const container = e.currentTarget;
    const pageGeometry = pageSizes[pageIndex];
    const { x: startLeftPercent, y: startTopPercent } = getPointerPercent(e, container, pageGeometry);
    const { x: clientX, y: clientY } = getPointerCoords(e);

    const id = createElementId();
    const newEl = definition.creation.create({
      id, pageIndex, point: { left: startLeftPercent, top: startTopPercent }, color: initialColor,
      whiteoutColor: initialWhiteoutColor, strokeWidth: initialStrokeWidth, font: initialFont,
      fontSize: initialFontSize, direction: initialDirection,
    });
    const isLineTool = newEl.type === 'line';

    dispatch({ type: 'ADD_ELEMENT', payload: newEl });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });

    const getElementNode = () => Array.from(
      container.querySelectorAll<HTMLElement>('[data-editor-element-id]'),
    ).find((node) => node.dataset.editorElementId === id);

    gestureCancelRef.current?.();
    gestureCancelRef.current = startGesture<PlacementPatch>({
      computePatch: (moveEvent) => {
      if ('touches' in moveEvent && moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
      const { x: moveX, y: moveY } = getPointerCoords(moveEvent);

      if (isLineTool) {
        const { x, y } = getPointerPercent(moveEvent, container, pageGeometry);
        const x2 = Math.max(0, Math.min(100, x));
        const y2 = Math.max(0, Math.min(100, y));
        return { x2, y2 };
      }

      const { x: widthPercent, y: heightPercent } = getDeltaPercent(
        moveX - clientX,
        moveY - clientY,
        container,
        pageGeometry,
      );

      return {
        left: widthPercent < 0 ? startLeftPercent + widthPercent : startLeftPercent,
        top: heightPercent < 0 ? startTopPercent + heightPercent : startTopPercent,
        width: Math.abs(widthPercent),
        height: Math.abs(heightPercent),
      };
      },
      writeDOM: (patch) => {
        const elementNode = getElementNode();
        if (!elementNode) return;

        if ('x2' in patch) {
          elementNode.querySelectorAll('line').forEach((line) => {
            line.setAttribute('x2', `${patch.x2}%`);
            line.setAttribute('y2', `${patch.y2}%`);
          });
          return;
        }

        elementNode.style.left = `${patch.left}%`;
        elementNode.style.top = `${patch.top}%`;
        elementNode.style.width = `${patch.width}%`;
        elementNode.style.height = `${patch.height}%`;
      },
      commit: (patch) => {
      gestureCancelRef.current = null;
      if (patch) {
        dispatch({ type: 'UPDATE_ELEMENT', payload: { id, changes: patch } });
      }

      const dimensions = getDimensions(container);
      const minimumSizeContext = {
        tool,
        rectWidth: dimensions.width,
        rectHeight: dimensions.height,
        startLeftPercent,
        startTopPercent,
      };
      dispatch({
        type: 'ENSURE_MINIMUM_SIZE',
        payload: {
          id,
          ...minimumSizeContext,
        },
      });

      const finalElement = ensureMinimumElementSize(
        (patch ? { ...newEl, ...patch } : newEl) as EditorElement,
        minimumSizeContext,
      );

      dispatch({ type: 'DISARM_TOOL' });

      if (tool === 'whiteout') {
        logAction('add', 'ADD_WHITEOUT', pageIndex, t.addedWhiteoutDescription, [captureAddedElement(finalElement, nextElementIndex)]);
        setAnnouncement(t.addedWhiteoutAnnouncement);
      } else {
        // LOC-16: the raw shape tool id used to be interpolated directly into
        // this copy (`.claude/rules/editor.md`'s "never interpolate a raw
        // tool id into copy") - signElementTypeLabel resolves it to the same
        // display label the Shapes menu and ElementToolbar use.
        const label = signElementTypeLabel(t, tool);
        logAction('add', 'ADD_SHAPE', pageIndex, formatMessage(t.addedShapeDescriptionTemplate, { label }), [captureAddedElement(finalElement, nextElementIndex)]);
        setAnnouncement(formatMessage(t.addedShapeAnnouncementTemplate, { label }));
      }
      },
      cancel: () => {
      gestureCancelRef.current = null;
      dispatch({ type: 'DELETE_ELEMENT', payload: id });
      dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
      },
    });
  };

  return { handlePageClick, handleOverlayPointerDown };
}
