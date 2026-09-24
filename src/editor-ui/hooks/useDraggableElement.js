import { useEffect, useRef } from 'preact/hooks';
import usePdfCoordinates from './usePdfCoordinates.js';
import { startGesture } from '../../lib/gestures/controller.ts';
import { textAnchorsRightEdge } from '../../lib/signHelpers.js';
import {
  DEFAULT_FALLBACK_ELEMENT_WIDTH_PCT,
  DEFAULT_FALLBACK_ELEMENT_HEIGHT_PCT
} from '../../constants/signGeometry.js';

// MOBI-21. How far a finger may travel and still have meant a tap rather than
// a move. It is deliberately the browser's own touch slop (Chromium and
// WebKit both use 8 CSS px to tell a tap from a scroll/drag), not a number
// chosen here: below it the gesture is what a person reads as "I touched
// that", above it they have started moving the box. There is no threshold in
// `src/lib/gestures/controller.ts` to reuse - it commits whatever the last
// move computed - so this is the one place that has to name it, and it is
// read only to decide whether `onTap` fires. The drag itself still commits
// exactly as before at any distance, tap or not.
const TAP_MOVEMENT_TOLERANCE_PX = 8;

// MOBI-21 review fix. How long a touch may be held before a release stops
// counting as a tap. 500ms is roughly where platforms (iOS's long-press,
// Android's default) start treating a hold as a long-press rather than a
// tap, so a finger resting on the box past that point no longer opens an
// edit session.
const TAP_HOLD_LIMIT_MS = 500;

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
 * @param {import('../../editor/geometry/coords.js').PageGeometry} [params.pageGeometry] - rotated/cropped page frame
 * @param {function} params.onSelect       - called on pointer down to activate the element
 * @param {function} params.onChange       - called on pointer up to commit the new position
 * @param {function|null} [params.onTap]   - MOBI-21: called once on release when a TOUCH gesture
 *                                           turned out to be a tap (no meaningful movement). The
 *                                           caller decides what a tap means and whether this
 *                                           element has one at all; passing nothing keeps the old
 *                                           behaviour exactly. Never called for a mouse gesture,
 *                                           so the desktop click/double-click model is untouched.
 */
export default function useDraggableElement({
  element,
  elementRef,
  getPageWrapper,
  pageGeometry,
  onSelect,
  onChange,
  onTap = null,
}) {
  const { getPointerCoords, getDeltaPercent, getElementPercentSize } = usePdfCoordinates();

  const dragStartPos = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const cancelDragRef = useRef(null);
  // MOBI-21: true while the gesture in flight could still turn out to be a
  // tap. A ref, not state, for the same reason everything else in this hook
  // is one - nothing about a live gesture may go through a render.
  const tapCandidate = useRef(false);
  // MOBI-21 review fix: when the current gesture started, so a long hold
  // can be told apart from a tap on release (TAP_HOLD_LIMIT_MS below).
  const tapStartTime = useRef(0);

  useEffect(() => () => cancelDragRef.current?.(), []);

  const handlePointerDown = (e) => {
    // MOBI-31: a touchstart that already carries a second touch (both
    // fingers already down - e.g. this one interrupts a still-live previous
    // gesture, see the `cancelDragRef.current?.()` call below) means the
    // gesture that is starting is a pinch, not a drag. Do nothing - no
    // select, no preventDefault - so the browser is free to read it as a
    // native pinch-zoom (see `.element`'s `touch-action: pinch-zoom` in
    // EditorElement.module.css). A second finger joining mid-drag, after
    // this handler has already returned, is instead caught centrally by
    // `startGesture`'s own onMove guard (src/lib/gestures/controller.ts).
    if ('touches' in e && e.touches && e.touches.length > 1) {
      return;
    }

    if (
      e.target.closest('[data-editor-actions]') ||
      e.target.closest('[data-editor-resizer]')
    ) {
      return;
    }

    onSelect(e);

    // Only reachable while a text edit session is open — outside one the
    // textarea is inert (see TextNode's text-input-inert class), so the target
    // is the wrapper and the drag proceeds. During editing the click belongs to
    // the caret, not to a drag.
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    e.preventDefault();

    // MOBI-21. `preventDefault()` on a `touchstart` suppresses the whole
    // synthesised mouse sequence, so on a finger there is no `click` and
    // therefore no `dblclick` — the only route a text box had back into its
    // edit session. The gesture itself is what decides now: a touch that
    // releases without meaningful movement is a tap, and the caller's
    // `onTap` runs on release. A mouse gesture never sets this, so
    // click-to-select / double-click-to-edit on a desktop is unchanged.
    // Whether *this* gesture qualifies is decided below, once the outgoing
    // gesture (if any) has been cancelled.

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

    cancelDragRef.current?.();

    // MOBI-21 review fix. Set only now, after the outgoing gesture's own
    // cancel() (above) has had its chance to reset this same flag — setting
    // it any earlier let a still-live previous gesture wipe this new
    // gesture's tap candidacy the moment pointer-down fired. Three more
    // conditions besides "onTap was given a touch event":
    //   - exactly one touch at start, so a pinch that begins with one finger
    //     on the box (`e.touches` is a truthy TouchList either way) is never
    //     read as a tap;
    //   - `e.cancelable`, so the touchstart that merely stops an in-flight
    //     scroll fling — non-cancelable, and the finger doesn't move — is
    //     never read as a tap that opens the keyboard.
    tapCandidate.current =
      !!onTap && 'touches' in e && !!e.touches && e.touches.length === 1 && e.cancelable;
    tapStartTime.current = Date.now();

    cancelDragRef.current = startGesture({
      computePatch: (moveEvent) => {
      if (moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
      const { x: moveX, y: moveY } = getPointerCoords(moveEvent);

      const dx = moveX - dragStartPos.current.x;
      const dy = moveY - dragStartPos.current.y;
      // MOBI-21: once the finger has travelled past the browser's own touch
      // slop this gesture is a move, not a tap, whatever it commits. Only a
      // ref is written here — this stays a pure patch computation, and the
      // golden rule's guard (no onChange/dispatch/setState) holds.
      if (Math.abs(dx) > TAP_MOVEMENT_TOLERANCE_PX || Math.abs(dy) > TAP_MOVEMENT_TOLERANCE_PX) {
        tapCandidate.current = false;
      }
      // MOBI-21 review fix (a second finger joining mid-gesture is never a
      // tap either) is now enforced one layer up: MOBI-31 made
      // startGesture's own onMove cancel the whole gesture the moment a
      // `touchmove` carries more than one touch, before computePatch ever
      // runs, and this hook's own `cancel` below already clears
      // tapCandidate - so a multi-touch moveEvent can no longer reach here.
      if (element.type === 'line') {
        dragOffset.current = { x: dx, y: dy };
        return dragOffset.current;
      }

      const rawDxPercent = pageRect.width ? (dx / pageRect.width) * 100 : 0;
      const rawDyPercent = pageRect.height ? (dy / pageRect.height) * 100 : 0;

      // `left` is the right edge of a free RTL box and the left edge of
      // everything else, a comb or a form-cell box included (signHelpers'
      // textAnchorsRightEdge), so the clamp asks the same question the
      // wrapper's CSS does.
      const anchorsRight = textAnchorsRightEdge(element);
      const minDxPercent = anchorsRight
        ? widthPercent - dragStartPos.current.left
        : -dragStartPos.current.left;
      const maxDxPercent = anchorsRight
        ? 100 - dragStartPos.current.left
        : 100 - widthPercent - dragStartPos.current.left;
      const minDyPercent = -dragStartPos.current.top;
      const maxDyPercent = 100 - heightPercent - dragStartPos.current.top;
      const clampedDxPercent = Math.max(minDxPercent, Math.min(maxDxPercent, rawDxPercent));
      const clampedDyPercent = Math.max(minDyPercent, Math.min(maxDyPercent, rawDyPercent));
      const clampedDx = (clampedDxPercent / 100) * pageRect.width;
      const clampedDy = (clampedDyPercent / 100) * pageRect.height;

      dragOffset.current = { x: clampedDx, y: clampedDy };
      return dragOffset.current;
      },
      writeDOM: ({ x, y }) => {
        if (element.type !== 'line' && elementRef.current) {
          elementRef.current.style.transform = `translate(${x}px, ${y}px)`;
        }
      },
      commit: () => {
      cancelDragRef.current = null;
      isDragging.current = false;
      if (elementRef.current) elementRef.current.style.transform = 'none';

      const wrapper = getPageWrapper();
      const { x: dxPercent, y: dyPercent } = getDeltaPercent(
        dragOffset.current.x,
        dragOffset.current.y,
        wrapper,
        pageGeometry,
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

        if (textAnchorsRightEdge(element)) {
          newLeft = Math.max(widthPercent, Math.min(100, newLeft));
        } else {
          newLeft = Math.max(0, Math.min(100 - widthPercent, newLeft));
        }
        newTop = Math.max(0, Math.min(100 - heightPercent, newTop));
        onChange({ left: newLeft, top: newTop });
      }

      dragOffset.current = { x: 0, y: 0 };

      // MOBI-21: last, so the position this gesture committed is already in
      // state before the tap's own meaning (opening a text edit session) is
      // acted on. MOBI-21 review fix: a hold longer than TAP_HOLD_LIMIT_MS
      // is a long-press, not a tap, even without meaningful movement.
      if (tapCandidate.current) {
        const heldTooLong = Date.now() - tapStartTime.current > TAP_HOLD_LIMIT_MS;
        tapCandidate.current = false;
        if (!heldTooLong) onTap();
      }
      },
      cancel: () => {
      cancelDragRef.current = null;
      isDragging.current = false;
      tapCandidate.current = false;
      if (elementRef.current) elementRef.current.style.transform = 'none';
      dragOffset.current = { x: 0, y: 0 };
      },
    });
  };

  return { handlePointerDown, isDragging, dragOffset };
}
