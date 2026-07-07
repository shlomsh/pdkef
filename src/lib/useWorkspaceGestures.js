import usePdfCoordinates from './usePdfCoordinates.js';
import {
  DEFAULT_COLOR_BLUE,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE_PT,
  DEFAULT_SYMBOL_WIDTH_PCT,
  ASPECT_RATIO_SYMBOL,
  DEFAULT_WHITEOUT_COLOR
} from '../constants/signGeometry.js';

const DRAG_DRAWN_TOOLS = ['whiteout', 'line', 'ellipse', 'rectangle'];

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
    if (DRAG_DRAWN_TOOLS.includes(selectedTool)) return;
    e.stopPropagation();

    if (e.target.closest('.sign-element')) return;

    const container = e.currentTarget;
    const { x: leftPercent, y: topPercent } = getPointerPercent(e, container);

    if (selectedTool === 'text') {
      const id = crypto.randomUUID
        ? crypto.randomUUID()
        : `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newEl = {
        id,
        type: 'text',
        pageIndex,
        left: leftPercent,
        top: topPercent,
        text: '',
        fontSize: initialFontSize,
        fontWeight: 'normal',
        fontStyle: 'normal',
        fontFamily: initialFont,
        color: initialColor,
        autoFocus: true,
        // Only set textDirection when the user has explicitly chosen one previously;
        // null lets the auto-detector run on fresh elements (content-based detection).
        ...(initialDirection != null ? { textDirection: initialDirection } : {}),
      };
      dispatch({ type: 'ADD_ELEMENT', payload: newEl });
      dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
      logAction('ADD_TEXT', id, pageIndex, 'Added text box');
      setAnnouncement('Added text box. Click or double click to type.');
    } else if (selectedTool === 'symbol') {
      const id = crypto.randomUUID
        ? crypto.randomUUID()
        : `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const widthPercent = DEFAULT_SYMBOL_WIDTH_PCT;
      const heightPercent = getWidthPercentToHeightPercent(widthPercent, ASPECT_RATIO_SYMBOL, container);
      const newEl = {
        id,
        type: 'symbol',
        pageIndex,
        left: leftPercent - widthPercent / 2,
        top: topPercent - heightPercent / 2,
        width: widthPercent,
        height: heightPercent,
      };
      dispatch({ type: 'ADD_ELEMENT', payload: newEl });
      dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
      logAction('ADD_SYMBOL', id, pageIndex, 'Added symbol');
      setAnnouncement('Added symbol.');
    } else if (selectedTool === 'signature') {
      if (activeSignature) {
        placeSignatureAt(
          activeSignature.dataUrl,
          activeSignature.aspectRatio,
          pageIndex,
          leftPercent,
          topPercent,
        );
      } else {
        setTempPlacement({ pageIndex, left: leftPercent, top: topPercent });
        setDialogOpen(true);
      }
    }
  };

  /**
   * Handles pointer-down on the page overlay for drag-drawn tools
   * (whiteout, line, ellipse, rectangle). Attaches global move/up listeners
   * for the duration of the drag gesture, then cleans them up on pointer-up.
   */
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

    const id = crypto.randomUUID
      ? crypto.randomUUID()
      : `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newEl = isLineTool
      ? {
          id,
          type: 'line',
          pageIndex,
          x1: startLeftPercent,
          y1: startTopPercent,
          x2: startLeftPercent,
          y2: startTopPercent,
          color: initialColor,
          strokeWidth: initialStrokeWidth,
        }
      : {
          id,
          type: tool,
          pageIndex,
          left: startLeftPercent,
          top: startTopPercent,
          width: 0,
          height: 0,
          ...(tool === 'whiteout'
            ? { color: DEFAULT_WHITEOUT_COLOR }
            : { color: initialColor, strokeWidth: initialStrokeWidth }),
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

      const { x: widthPercent, y: heightPercent } = getDeltaPercent(
        moveX - clientX,
        moveY - clientY,
        container,
      );

      dispatch({
        type: 'UPDATE_ELEMENT',
        payload: {
          id,
          changes: {
            left: widthPercent < 0 ? startLeftPercent + widthPercent : startLeftPercent,
            top: heightPercent < 0 ? startTopPercent + heightPercent : startTopPercent,
            width: Math.abs(widthPercent),
            height: Math.abs(heightPercent),
          },
        },
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
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
  };

  return { handlePageClick, handleOverlayPointerDown };
}
