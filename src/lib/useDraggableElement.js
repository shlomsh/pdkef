import { useRef } from 'preact/hooks';
import usePdfCoordinates from './usePdfCoordinates.js';
import { getEffectiveTextDirection } from './sign.js';
import {
  DEFAULT_FALLBACK_ELEMENT_WIDTH_PCT,
  DEFAULT_FALLBACK_ELEMENT_HEIGHT_PCT
} from '../constants/signGeometry.js';

/**
 * Encapsulates the complex drag-to-move gesture for a single element inside
 * a DraggableWrapper.
 *
 * Extracted from DraggableWrapper to slim that component down and make the
 * pointer gesture independently testable. The hook holds the ref-based
 * imperative drag state (isDragging, dragOffset, dragStartPos) and returns:
 *
 *   - `handlePointerDown` — to attach to the element's onMouseDown / onTouchStart
 *   - `isDragging`        — a ref (not state) so the transform effect can gate on it
 *   - `dragOffset`        — a ref holding the live pixel delta for the transform
 *
 * The hook does NOT hold elementRef — that lives in DraggableWrapper because it
 * is also passed to Floating UI. The element node is forwarded in via the
 * `elementRef` param so `handlePointerDown` can mutate its transform.
 *
 * @param {object}   params
 * @param {object}   params.element        - the element data object from state
 * @param {object}   params.elementRef     - ref to the element's DOM node (owned by caller)
 * @param {function} params.getPageWrapper - () => closest .sign-page-wrapper node | null
 * @param {function} params.onSelect       - called on pointer down to activate the element
 * @param {function} params.onChange       - called on pointer up to commit the new position
 */
export default function useDraggableElement({
  element,
  elementRef,
  getPageWrapper,
  onSelect,
  onChange,
}) {
  const { getPointerCoords, getDeltaPercent, getElementPercentSize } = usePdfCoordinates();

  const dragStartPos = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e) => {
    if (
      e.target.closest('.sign-element-actions') ||
      e.target.closest('.sign-element-resizer')
    ) {
      return;
    }

    onSelect(e);

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    e.preventDefault();

    // Captured once for the gesture — the page wrapper can't change while dragging.
    const pageWrapper = getPageWrapper();
    if (!pageWrapper) return;

    const { x: clientX, y: clientY } = getPointerCoords(e);

    dragStartPos.current = {
      x: clientX,
      y: clientY,
      left: element.left,
      top: element.top,
    };

    // Text boxes are CSS auto-sized (no stored `element.width`), so the only
    // accurate width comes from measuring the actual rendered box — captured
    // once here, since it can't change over the course of a drag. (Read-only,
    // gesture-time measurement, same pattern as `textStartRect` in the resize
    // handler — not a render effect, so it can't reintroduce the
    // measure-then-mutate-position drift bug.)
    const textWidthPercentAtStart =
      element.type === 'text' && elementRef.current
        ? getElementPercentSize(elementRef.current, pageWrapper).width
        : null;

    isDragging.current = true;

    const handlePointerMove = (moveEvent) => {
      const { x: moveX, y: moveY } = getPointerCoords(moveEvent);

      const dx = moveX - dragStartPos.current.x;
      const dy = moveY - dragStartPos.current.y;
      dragOffset.current = { x: dx, y: dy };
      if (elementRef.current) {
        elementRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    };

    const handlePointerUp = () => {
      isDragging.current = false;
      if (elementRef.current) elementRef.current.style.transform = 'none';

      const wrapper = getPageWrapper();
      const { x: dxPercent, y: dyPercent } = getDeltaPercent(
        dragOffset.current.x,
        dragOffset.current.y,
        wrapper,
      );

      if (element.type === 'line') {
        onChange({
          x1: Math.max(0, Math.min(100, element.x1 + dxPercent)),
          y1: Math.max(0, Math.min(100, element.y1 + dyPercent)),
          x2: Math.max(0, Math.min(100, element.x2 + dxPercent)),
          y2: Math.max(0, Math.min(100, element.y2 + dyPercent)),
        });
      } else {
        let newLeft = dragStartPos.current.left + dxPercent;
        let newTop = dragStartPos.current.top + dyPercent;

        const widthPercent =
          element.type === 'text'
            ? (textWidthPercentAtStart ?? DEFAULT_FALLBACK_ELEMENT_WIDTH_PCT)
            : (element.width || DEFAULT_FALLBACK_ELEMENT_WIDTH_PCT);

        if (
          element.type === 'text' &&
          getEffectiveTextDirection(element) === 'rtl'
        ) {
          newLeft = Math.max(widthPercent, Math.min(100, newLeft));
        } else {
          newLeft = Math.max(0, Math.min(100 - widthPercent, newLeft));
        }
        newTop = Math.max(0, Math.min(100 - (element.height || DEFAULT_FALLBACK_ELEMENT_HEIGHT_PCT), newTop));
        onChange({ left: newLeft, top: newTop });
      }

      dragOffset.current = { x: 0, y: 0 };
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
  };

  return { handlePointerDown, isDragging, dragOffset };
}
