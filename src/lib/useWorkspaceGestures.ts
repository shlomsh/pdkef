import usePdfCoordinates from './usePdfCoordinates.js';
import { startGesture } from '../editor/gestures/controller.ts';
import type { GestureEvent } from '../editor/gestures/controller.ts';
import { createElementId } from '../editor/model/ids.ts';
import { captureAddedElement, type HistoryLogger } from '../editor/model/actionHistory.ts';
import type {
  EditorElement,
  EditorElementPatch,
  SignToolType,
  SymbolMark,
  TextDirection,
} from '../editor/model/editorModel.ts';
import type { SavedSignature } from '../editor/model/savedSignature.ts';
import type { PageGeometry } from '../editor/geometry/coords.ts';
import { getElementDefinition } from '../editor/registry/index.ts';
import { ensureMinimumElementSize } from '../editor/geometry/minimumSize.ts';
import {
  DEFAULT_COLOR_BLUE,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE_PT,
  DEFAULT_SYMBOL_WIDTH_PCT,
  ASPECT_RATIO_SYMBOL,
  TEXT_BOX_LINE_HEIGHT_EM,
  PAGE_HEIGHT_DEFAULT_PTS
} from '../constants/signGeometry.js';

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
  initialSymbolWidth?: number;
  initialSymbolMark?: SymbolMark;
  pageSizes?: PageGeometry[];
  nextElementIndex?: number;
  gestureCancelRef?: { current: (() => void) | null };
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
  initialSymbolWidth = DEFAULT_SYMBOL_WIDTH_PCT,
  initialSymbolMark = 'check',
  pageSizes = [],
  nextElementIndex = 0,
  // PdfWorkspace supplies a ref it owns for component teardown. Keeping this
  // handler factory hook-free also preserves its direct unit-test contract.
  gestureCancelRef = { current: null },
}: WorkspaceGestureOptions) {
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
    const definition = getElementDefinition(selectedTool);
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
    e.stopPropagation();

    if ((e.target as Element | null)?.closest('[data-editor-element]')) return;

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
    dispatch({ type: 'ADD_ELEMENT', payload: newEl });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
    // One placement per arming, so the next click on empty page area falls
    // through to the workspace's deselect handler instead of making a second
    // element the user never asked for. A locked tool stays armed.
    dispatch({ type: 'DISARM_TOOL' });
    if (selectedTool === 'text') {
      // A box you just placed opens ready to type - the one case where placing
      // and editing are the same intent. This replaces the old per-element
      // `autoFocus` flag, so the caret has exactly one owner.
      dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: id });
      logAction('add', 'ADD_TEXT', pageIndex, 'Added text box', [captureAddedElement(newEl, nextElementIndex)]);
      setAnnouncement('Added text box. Type your text.');
    } else {
      logAction('add', 'ADD_SYMBOL', pageIndex, 'Added symbol', [captureAddedElement(newEl, nextElementIndex)]);
      setAnnouncement('Added symbol.');
    }
  };

  /**
   * Handles pointer-down on the page overlay for drag-drawn tools
   * (whiteout, line, ellipse, rectangle). Attaches global move/up listeners
   * for the duration of the drag gesture, then cleans them up on pointer-up.
   */
  const handleOverlayPointerDown = (e: PagePointerEvent, pageIndex: number) => {
    if (!selectedTool) return;
    const definition = getElementDefinition(selectedTool);
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
        logAction('add', 'ADD_WHITEOUT', pageIndex, 'Added whiteout box', [captureAddedElement(finalElement, nextElementIndex)]);
        setAnnouncement('Added whiteout box.');
      } else {
        logAction('add', 'ADD_SHAPE', pageIndex, `Added ${tool}`, [captureAddedElement(finalElement, nextElementIndex)]);
        setAnnouncement(`Added ${tool}.`);
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
