import usePdfCoordinates from './usePdfCoordinates.js';
import { startGesture } from '../editor/gestures/controller.ts';
import { createElementId } from '../editor/model/ids.ts';
import { getElementDefinition } from '../editor/registry/index.ts';
import {
  DEFAULT_COLOR_BLUE,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE_PT,
  DEFAULT_SYMBOL_WIDTH_PCT,
  ASPECT_RATIO_SYMBOL
} from '../constants/signGeometry.js';

/**
 * Encapsulates the two gesture handlers that turn raw DOM pointer events on the
 * PDF page overlay into SignTool state dispatch calls.
 *
 * Extracted from PdfWorkspace to slim that component down and make the gesture
 * state machine independently testable.
 *
 * @param {object} params
 * @param {string|null}  params.selectedTool       - currently active tool name
 * @param {function}     params.dispatch            - SignTool context dispatch
 * @param {object|null}  params.activeSignature     - currently selected signature
 * @param {function}     params.setTempPlacement    - opens signature placement dialog
 * @param {function}     params.setDialogOpen       - opens the signature creation dialog
 * @param {function}     params.placeSignatureAt    - places an existing signature
 * @param {function}     params.logAction           - action history logger
 * @param {function}     params.setAnnouncement     - a11y live-region setter
 * @param {string}       params.initialColor        - last remembered element color for new placements
 * @param {number}       params.initialStrokeWidth  - last remembered stroke width for new placements
 * @param {string}       params.initialFont         - last remembered font family for new text elements
 * @param {number}       params.initialFontSize     - last remembered font size for new text elements
 * @param {string|null}  params.initialDirection    - last remembered text direction ('ltr'|'rtl'|null)
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
}) {
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
  const handlePageClick = (e, pageIndex) => {
    if (!selectedTool) return;
    const definition = getElementDefinition(selectedTool);
    if (definition.creation.mode !== 'point') {
      if (definition.creation.mode === 'external' && selectedTool === 'signature') {
        const container = e.currentTarget;
        const { x: leftPercent, y: topPercent } = getPointerPercent(e, container);
        if (activeSignature) {
          placeSignatureAt(activeSignature.dataUrl, activeSignature.aspectRatio, pageIndex, leftPercent, topPercent);
        } else {
          setTempPlacement({ pageIndex, left: leftPercent, top: topPercent });
          setDialogOpen(true);
        }
      }
      return;
    }
    e.stopPropagation();

    if (e.target.closest('.sign-element')) return;

    const container = e.currentTarget;
    const { x: leftPercent, y: topPercent } = getPointerPercent(e, container);

    const id = createElementId();
    const symbolWidth = DEFAULT_SYMBOL_WIDTH_PCT;
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
    });
    dispatch({ type: 'ADD_ELEMENT', payload: newEl });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
    if (selectedTool === 'text') {
      logAction('ADD_TEXT', id, pageIndex, 'Added text box');
      setAnnouncement('Added text box. Click or double click to type.');
    } else {
      logAction('ADD_SYMBOL', id, pageIndex, 'Added symbol');
      setAnnouncement('Added symbol.');
    }
  };

  /**
   * Handles pointer-down on the page overlay for drag-drawn tools
   * (whiteout, line, ellipse, rectangle). Attaches global move/up listeners
   * for the duration of the drag gesture, then cleans them up on pointer-up.
   */
  const handleOverlayPointerDown = (e, pageIndex) => {
    if (!selectedTool) return;
    const definition = getElementDefinition(selectedTool);
    if (definition.creation.mode !== 'drag') return;
    if (e.target.closest('.sign-element')) return;
    e.stopPropagation();

    if (!e.touches) e.preventDefault();

    const tool = selectedTool;
    const container = e.currentTarget;
    const { x: startLeftPercent, y: startTopPercent } = getPointerPercent(e, container);
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
      container.querySelectorAll('[data-editor-element-id]'),
    ).find((node) => node.dataset.editorElementId === id);

    startGesture({
      computePatch: (moveEvent) => {
      if (moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
      const { x: moveX, y: moveY } = getPointerCoords(moveEvent);

      if (isLineTool) {
        const { x, y } = getPointerPercent(moveEvent, container);
        const x2 = Math.max(0, Math.min(100, x));
        const y2 = Math.max(0, Math.min(100, y));
        return { x2, y2 };
      }

      const { x: widthPercent, y: heightPercent } = getDeltaPercent(
        moveX - clientX,
        moveY - clientY,
        container,
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

        if (isLineTool) {
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
      if (patch) {
        dispatch({ type: 'UPDATE_ELEMENT', payload: { id, changes: patch } });
      }

      const dimensions = getDimensions(container);
      dispatch({
        type: 'ENSURE_MINIMUM_SIZE',
        payload: {
          id,
          tool,
          rectWidth: dimensions.width,
          rectHeight: dimensions.height,
          startLeftPercent,
          startTopPercent,
        },
      });

      if (tool === 'whiteout') {
        logAction('ADD_WHITEOUT', id, pageIndex, 'Added whiteout box');
        setAnnouncement('Added whiteout box.');
      } else {
        logAction('ADD_SHAPE', id, pageIndex, `Added ${tool}`);
        setAnnouncement(`Added ${tool}.`);
      }
      },
    });
  };

  return { handlePageClick, handleOverlayPointerDown };
}
