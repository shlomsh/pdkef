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
    const measuredSizePercentAtStart =
      element.type === 'text' && elementRef.current
        ? getElementPercentSize(elementRef.current, pageWrapper)
        : null;
    const widthPercent =
      element.type === 'text'
        ? (measuredSizePercentAtStart?.width ?? DEFAULT_FALLBACK_ELEMENT_WIDTH_PCT)
        : (element.width || DEFAULT_FALLBACK_ELEMENT_WIDTH_PCT);
    const heightPercent =
      element.type === 'text'
        ? (measuredSizePercentAtStart?.height ?? DEFAULT_FALLBACK_ELEMENT_HEIGHT_PCT)
        : (element.height || DEFAULT_FALLBACK_ELEMENT_HEIGHT_PCT);
    const pageRect = pageWrapper.getBoundingClientRect();

    isDragging.current = true;

    const handlePointerMove = (moveEvent) => {
      const { x: moveX, y: moveY } = getPointerCoords(moveEvent);

      const dx = moveX - dragStartPos.current.x;
      const dy = moveY - dragStartPos.current.y;
      if (element.type === 'line') {
        dragOffset.current = { x: dx, y: dy };
        return;
      }

      const rawDxPercent = pageRect.width ? (dx / pageRect.width) * 100 : 0;
      const rawDyPercent = pageRect.height ? (dy / pageRect.height) * 100 : 0;

      const minDxPercent =
        element.type === 'text' && getEffectiveTextDirection(element) === 'rtl'
          ? widthPercent - dragStartPos.current.left
          : -dragStartPos.current.left;
      const maxDxPercent =
        element.type === 'text' && getEffectiveTextDirection(element) === 'rtl'
          ? 100 - dragStartPos.current.left
          : 100 - widthPercent - dragStartPos.current.left;
      const minDyPercent = -dragStartPos.current.top;
      const maxDyPercent = 100 - heightPercent - dragStartPos.current.top;
      const clampedDxPercent = Math.max(minDxPercent, Math.min(maxDxPercent, rawDxPercent));
      const clampedDyPercent = Math.max(minDyPercent, Math.min(maxDyPercent, rawDyPercent));
      const clampedDx = (clampedDxPercent / 100) * pageRect.width;
      const clampedDy = (clampedDyPercent / 100) * pageRect.height;

      dragOffset.current = { x: clampedDx, y: clampedDy };
      if (elementRef.current) {
        elementRef.current.style.transform = `translate(${clampedDx}px, ${clampedDy}px)`;
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

        if (
          element.type === 'text' &&
          getEffectiveTextDirection(element) === 'rtl'
        ) {
          newLeft = Math.max(widthPercent, Math.min(100, newLeft));
        } else {
          newLeft = Math.max(0, Math.min(100 - widthPercent, newLeft));
        }
        newTop = Math.max(0, Math.min(100 - heightPercent, newTop));
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
