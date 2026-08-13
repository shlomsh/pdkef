import usePdfCoordinates from './usePdfCoordinates.js';
import { startGesture } from '../editor/gestures/controller.ts';
import { getElementDefinition } from '../editor/registry/index.ts';
import { getEffectiveTextDirection } from './sign.js';
import {
  DEFAULT_START_WIDTH_PCT,
  DEFAULT_FONT_SIZE_PT,
  ASPECT_RATIO_SYMBOL,
  ASPECT_RATIO_TEXT,
  MIN_COMB_WIDTH_PCT
} from '../constants/signGeometry.js';

/**
 * Encapsulates the resize gesture for a single element, dispatching per-type
 * geometry math and DOM paint through the registry (line/box/text/centered -
 * see editor/registry/*'s resizeBehavior). Extracted from DraggableWrapper so
 * Redact's box-only elements (blackout/blur/whiteout, which only ever exercise
 * the box branch) can share it instead of hand-rolling the same startGesture
 * wiring around the same applyBoxResize call (see E7.5).
 *
 * @param {object}   params
 * @param {object}   params.element        - the element data object from state
 * @param {object}   params.elementRef     - ref to the element's DOM node (owned by caller)
 * @param {function} params.getPageWrapper - () => closest page-wrapper node | null
 * @param {number}   params.pageWidthPoints - page width in PDF points (0 if the caller has no notion of it - only text/centered resize read it)
 * @param {function} params.onChange       - called on pointer up to commit the resized geometry
 */
export default function useElementResize({
  element,
  elementRef,
  getPageWrapper,
  pageWidthPoints,
  onChange
}) {
  const {
    getPointerCoords,
    getDeltaPercent,
    getElementPercentSize,
    getWidthPercentToHeightPercent,
    getScaleFactor,
    getWidthPercent,
    getDimensions,
    pxToPoints
  } = usePdfCoordinates();

  const elementDefinition = getElementDefinition(element.type);

  const handleResizeStart = (e, handle = 'right') => {
    e.stopPropagation();
    e.preventDefault();

    const pageWrapper = getPageWrapper();
    if (!pageWrapper) return;

    const { x: clientX, y: clientY } = getPointerCoords(e);
    const dragStartX = clientX;
    const dragStartY = clientY;
    const startWidth = element.width || DEFAULT_START_WIDTH_PCT;
    const startFontSize = element.fontSize || DEFAULT_FONT_SIZE_PT;
    const startLeft = element.left;
    const startTop = element.top;
    const startX1 = element.x1;
    const startY1 = element.y1;
    const startX2 = element.x2;
    const startY2 = element.y2;
    const defaultRatio = element.type === 'symbol' ? ASPECT_RATIO_SYMBOL : ASPECT_RATIO_TEXT;
    const ratioAtStart = element.aspectRatio || defaultRatio;
    const startHeight = element.height || getWidthPercentToHeightPercent(startWidth, ratioAtStart, pageWrapper);

    const textStartRect = element.type === 'text' && elementRef.current ? getDimensions(elementRef.current) : null;
    const textStartSizePercent = element.type === 'text' && elementRef.current
      ? getElementPercentSize(elementRef.current, pageWrapper)
      : null;
    let pendingResize = null;

    // Per-type resize-time DOM/SVG paint is registry-owned (E7.6): a type
    // that needs bespoke painting (line's SVG endpoints, text's font-size +
    // reposition) declares resizeBehavior.writeDOM; anything else falls
    // through to the generic box-style write below, with no type check.
    const paintResizePatch = (patch) => {
      pendingResize = patch;
      if (!elementRef.current) return;

      const writeDOM = elementDefinition.resizeBehavior.writeDOM;
      if (writeDOM) {
        const extra = writeDOM({
          node: elementRef.current,
          patch,
          handle,
          isRtl: getEffectiveTextDirection(element) === 'rtl',
          startLeft,
          startTop,
          scaleFactor: getScaleFactor(pageWrapper, pageWidthPoints),
          pageWrapper,
          textStartSizePercent,
          getElementPercentSize,
        });
        if (extra) pendingResize = { ...patch, ...extra };
        return;
      }

      if (patch.width !== undefined) elementRef.current.style.width = `${patch.width}%`;
      if (patch.height !== undefined) elementRef.current.style.height = `${patch.height}%`;
      if (patch.left !== undefined) elementRef.current.style.left = `${patch.left}%`;
      if (patch.top !== undefined) elementRef.current.style.top = `${patch.top}%`;
    };

    const handleResizeMove = (moveEvent) => {
      if (moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
      const { x: moveX, y: moveY } = getPointerCoords(moveEvent);
      const rawDx = moveX - dragStartX;
      const dy = moveY - dragStartY;

      const isLeft = ['left', 'top-left', 'bottom-left'].includes(handle);
      const isTop = ['top', 'top-left', 'top-right'].includes(handle);
      const normalizedDx = isLeft ? -rawDx : rawDx;
      const normalizedDy = isTop ? -dy : dy;

      if (elementDefinition.resizeBehavior.applyLineResize) {
        const { x: dxPercent, y: dyPercent } = getDeltaPercent(rawDx, dy, pageWrapper);
        return elementDefinition.resizeBehavior.applyLineResize({
          handle,
          delta: { x: dxPercent, y: dyPercent },
          start: { x1: startX1, y1: startY1, x2: startX2, y2: startY2 },
        });
      }

      if (elementDefinition.resizeBehavior.applyBoxResize) {
        const { x: dxPercent, y: dyPercent } = getDeltaPercent(rawDx, dy, pageWrapper);
        return elementDefinition.resizeBehavior.applyBoxResize({
          handle,
          delta: { x: dxPercent, y: dyPercent },
          start: { width: startWidth, height: startHeight, left: startLeft, top: startTop },
        });
      }

      // Side handles that set a width without touching font size (comb text).
      // Checked before applyTextResize because text declares both: the corner
      // handles still mean font size, and only the type knows which is which.
      if (elementDefinition.resizeBehavior.applyWidthResize && (handle === 'left' || handle === 'right')) {
        const { x: dxPercent } = getDeltaPercent(rawDx, 0, pageWrapper);
        return elementDefinition.resizeBehavior.applyWidthResize({
          handle,
          delta: { x: dxPercent },
          start: { left: startLeft, width: startWidth },
          isRtl: getEffectiveTextDirection(element) === 'rtl',
          minWidth: MIN_COMB_WIDTH_PCT,
        });
      }

      if (elementDefinition.resizeBehavior.applyTextResize) {
        return elementDefinition.resizeBehavior.applyTextResize({
          startFontSize,
          delta: { x: normalizedDx, y: normalizedDy },
          startRect: textStartRect,
          fallbackDeltaPoints: pxToPoints(normalizedDx, getScaleFactor(pageWrapper, pageWidthPoints)),
        });
      }

      if (elementDefinition.resizeBehavior.applyCenteredResize) {
        const { x: deltaWidth } = getDeltaPercent(normalizedDx, 0, pageWrapper);
        const widthPolicy = elementDefinition.resizeBehavior.minimumWidth;
        const minWidth = widthPolicy.unit === 'pixels'
          ? getWidthPercent(widthPolicy.value, pageWrapper)
          : widthPolicy.value;
        const rect = pageWrapper.getBoundingClientRect();
        return elementDefinition.resizeBehavior.applyCenteredResize({
          deltaWidth,
          minWidth,
          aspectRatio: element.aspectRatio || defaultRatio,
          page: { width: rect.width, height: rect.height },
          start: { width: startWidth, height: startHeight, left: startLeft, top: startTop },
        });
      }

      return null;
    };

    startGesture({
      computePatch: handleResizeMove,
      writeDOM: paintResizePatch,
      commit: () => {
        if (pendingResize) {
          onChange(pendingResize);
          pendingResize = null;
        }
      },
    });
  };

  return { handleResizeStart };
}
