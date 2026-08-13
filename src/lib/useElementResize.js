import { useState } from 'preact/hooks';
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
  // Real, but purely local and short-lived (grab-to-release) - never part of
  // the committed element, never touches onChange. See the comment at its
  // one call site below for why this needs to exist at all.
  const [isSpanResizing, setIsSpanResizing] = useState(false);

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
    // Fixed for the gesture's whole duration, same as isWidthHandle below.
    const isRtl = getEffectiveTextDirection(element) === 'rtl';

    const textStartRect = element.type === 'text' && elementRef.current ? getDimensions(elementRef.current) : null;
    const textStartSizePercent = element.type === 'text' && elementRef.current
      ? getElementPercentSize(elementRef.current, pageWrapper)
      : null;
    let pendingResize = null;
    // Fixed for the gesture's whole duration (the handle never changes
    // mid-drag), so decided once rather than re-derived every frame.
    const isWidthHandle = handle === 'left' || handle === 'right';

    // Grabbing a span handle - even before the first pointermove - is the
    // one moment allowed to touch React state, because it's what lets a type
    // (text, via isSpanResizing) render whatever gesture-preview DOM it needs
    // as *real*, Preact-owned nodes before the per-frame reflow in writeDOM
    // needs one. A node writeDOM built by hand instead would sit outside
    // Preact's vnode tree for this subtree, and the next real render would
    // layer its own copy next to it rather than replace it - two sets of
    // characters (see text.ts). This is one flag flip at grab time, not a
    // committed field and not a per-frame update, so it doesn't touch
    // `onChange` and can't double the one commit release still makes.
    if (elementDefinition.resizeBehavior.applyWidthResize && isWidthHandle) {
      setIsSpanResizing(true);
    }

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
          isRtl,
          startLeft,
          startTop,
          scaleFactor: getScaleFactor(pageWrapper, pageWidthPoints),
          pageWrapper,
          textStartSizePercent,
          getElementPercentSize,
          element,
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
      if (elementDefinition.resizeBehavior.applyWidthResize && isWidthHandle) {
        const { x: dxPercent } = getDeltaPercent(rawDx, 0, pageWrapper);
        // Where the floor sits is the type's call, not this hook's - for a
        // comb it follows the cell count and font size (see combWidthFloor),
        // which is the difference between "shrink it back to about its own
        // text width and it turns back into text" and "drag it down to a slit
        // first". Types that don't declare one get the flat absolute floor.
        const widthFloor = elementDefinition.resizeBehavior.widthFloor;
        const minWidth = widthFloor
          ? widthFloor({
            element,
            fontSizePx: startFontSize * getScaleFactor(pageWrapper, pageWidthPoints),
            pageWidthPx: pageWrapper.getBoundingClientRect().width,
          })
          : MIN_COMB_WIDTH_PCT;
        // The box's actual rendered width, not `element.width || a default` -
        // for a plain (never-combed) text box that's undefined, and starting
        // from a fallback default instead of what's on screen is exactly the
        // "snaps to an arbitrary width" bug this measurement exists to avoid.
        const measuredStartWidth = textStartSizePercent ? textStartSizePercent.width : startWidth;
        return elementDefinition.resizeBehavior.applyWidthResize({
          handle,
          delta: { x: dxPercent },
          start: { left: startLeft, width: measuredStartWidth },
          isRtl,
          minWidth,
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
        setIsSpanResizing(false);
        if (pendingResize) {
          // `collapsed` (set by applyCombWidth - see text.ts) is a signal,
          // not a real element field: dragging a comb's span down past its
          // usable floor and releasing there means "close this comb", not
          // "set the width to the floor value". Stripped either way so it
          // never leaks into committed element state.
          const { collapsed, ...patch } = pendingResize;
          // Nothing to unwind on the DOM side for either outcome: the last
          // painted frame already *is* the committed picture (a collapsed drag
          // paints the plain text box back itself - see text.ts's writeDOM),
          // which matters because Preact's style diff compares against its own
          // last vnode rather than the live DOM, and so writes nothing at all
          // when a committed value comes out unchanged - routine here, since
          // collapsing sends no new `left`.
          onChange(collapsed ? { width: 0 } : patch);
          pendingResize = null;
        }
      },
    });
  };

  return { handleResizeStart, isSpanResizing };
}
