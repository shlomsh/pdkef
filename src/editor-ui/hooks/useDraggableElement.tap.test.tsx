import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import useDraggableElement from './useDraggableElement.js';

// MOBI-21 review fix coverage. No @testing-library/preact-hooks in this repo
// - see useCurrentPage.test.jsx/useCoarsePointer.test.tsx for the same
// tiny-harness pattern used for hook tests elsewhere. The harness renders the
// actual draggable node and wires handlePointerDown to it exactly as
// DraggableWrapper.tsx does (onMouseDown / onTouchStart), so every test
// dispatches real Touch/MouseEvents at the real DOM node rather than calling
// hook internals directly - the same "drive it like the browser would" style
// as DraggableWrapper.gestureInvariants.test.tsx.

type ApiRef = { current: { handlePointerDown: (e: Event) => void } | null };

function Harness({
  apiRef,
  onSelect = () => {},
  onChange = () => {},
  onTap,
  touchNeedsSelection = false,
  isSelected = false,
}: {
  apiRef: ApiRef;
  onSelect?: (e: Event) => void;
  onChange?: (changes: Record<string, number>) => void;
  onTap?: (() => void) | null;
  touchNeedsSelection?: boolean;
  isSelected?: boolean;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // A text element with no explicit width/minWidth and ltr direction, so
  // textAnchorsRightEdge(element) is false and the ordinary left-anchored
  // clamp math applies - keeps the drag math boring so these tests stay
  // about tap detection, not clamping.
  const element = { id: 'el-1', type: 'text', left: 20, top: 10, text: 'Hi', fontSize: 12, textDirection: 'ltr' };
  const getPageWrapper = () => wrapperRef.current;

  const { handlePointerDown } = useDraggableElement({
    element,
    elementRef,
    getPageWrapper,
    onSelect,
    onChange,
    onTap: onTap ?? null,
    touchNeedsSelection,
    isSelected,
  });

  apiRef.current = { handlePointerDown };

  return (
    <div ref={wrapperRef}>
      <div ref={elementRef} data-el onMouseDown={handlePointerDown} onTouchStart={handlePointerDown} />
    </div>
  );
}

// .claude/rules/editor.md's "Geometry rules": a 0x0 jsdom default rect
// saturates every delta to +/-Infinity, which would make a passing test here
// prove nothing about the 8px tolerance or the clamp math it interacts with.
// Both the page wrapper and the dragged element get a realistic, non-square
// rect instead.
function pageRect() {
  return new DOMRect(0, 0, 600, 800);
}

function elRect() {
  return new DOMRect(260, 380, 80, 20);
}

function mount({
  onSelect,
  onChange,
  onTap,
  touchNeedsSelection,
  isSelected,
}: {
  onSelect?: (e: Event) => void;
  onChange?: (changes: Record<string, number>) => void;
  onTap?: (() => void) | null;
  touchNeedsSelection?: boolean;
  isSelected?: boolean;
} = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const apiRef: ApiRef = { current: null };
  act(() => {
    render(
      <Harness
        apiRef={apiRef}
        onSelect={onSelect}
        onChange={onChange}
        onTap={onTap}
        touchNeedsSelection={touchNeedsSelection}
        isSelected={isSelected}
      />,
      host
    );
  });
  const wrapper = host.querySelector('div') as HTMLDivElement;
  wrapper.getBoundingClientRect = pageRect;
  const el = host.querySelector('[data-el]') as HTMLDivElement;
  el.getBoundingClientRect = elRect;
  return { host, el, wrapper, unmount: () => act(() => render(null, host)) };
}

// Touch/TouchEvent init dicts here only ever carry the fields the hook and
// the gesture controller actually read (touches, cancelable) - jsdom does
// not validate Touch objects, so plain point literals are enough (confirmed
// against jsdom 30's TouchEvent: a dispatched event's `.touches` is exactly
// the array passed in, no Touch-instance coercion).
function touch(clientX: number, clientY: number) {
  return { clientX, clientY } as Touch;
}

function dispatchTouchStart(target: EventTarget, touches: Touch[], { cancelable = true } = {}) {
  act(() => {
    target.dispatchEvent(
      new TouchEvent('touchstart', { touches, changedTouches: touches, bubbles: true, cancelable })
    );
  });
}

function dispatchTouchMove(touches: Touch[]) {
  act(() => {
    window.dispatchEvent(
      new TouchEvent('touchmove', { touches, changedTouches: touches, bubbles: true, cancelable: true })
    );
  });
}

function dispatchTouchEnd(lastTouch: Touch) {
  act(() => {
    window.dispatchEvent(
      new TouchEvent('touchend', { touches: [], changedTouches: [lastTouch], bubbles: true, cancelable: true })
    );
  });
}

function dispatchTouchCancel() {
  act(() => {
    window.dispatchEvent(new TouchEvent('touchcancel', { touches: [], changedTouches: [], bubbles: true }));
  });
}

function dispatchMouseDown(target: EventTarget, clientX: number, clientY: number) {
  act(() => {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX, clientY }));
  });
}

function dispatchMouseUp(clientX: number, clientY: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX, clientY }));
  });
}

describe('useDraggableElement MOBI-21 tap detection (review fixes)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('calls onTap exactly once for a single-finger touch that releases with no movement', () => {
    const onTap = vi.fn();
    const { el } = mount({ onTap });

    dispatchTouchStart(el, [touch(300, 400)]);
    dispatchTouchEnd(touch(300, 400));

    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('does not call onTap once the finger has moved past the 8px tolerance', () => {
    const onTap = vi.fn();
    const { el } = mount({ onTap });

    dispatchTouchStart(el, [touch(300, 400)]);
    dispatchTouchMove([touch(320, 400)]); // dx = 20px > TAP_MOVEMENT_TOLERANCE_PX
    dispatchTouchEnd(touch(320, 400));

    expect(onTap).not.toHaveBeenCalled();
  });

  it('still calls onTap when the finger stays inside the 8px slop', () => {
    const onTap = vi.fn();
    const { el } = mount({ onTap });

    dispatchTouchStart(el, [touch(300, 400)]);
    dispatchTouchMove([touch(305, 400)]); // dx = 5px, inside the 8px tolerance
    dispatchTouchEnd(touch(305, 400));

    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('never calls onTap for a mouse gesture, even with zero movement', () => {
    const onTap = vi.fn();
    const { el } = mount({ onTap });

    dispatchMouseDown(el, 300, 400);
    dispatchMouseUp(300, 400);

    expect(onTap).not.toHaveBeenCalled();
  });

  // Review finding #1 (multi-finger): a TouchList is always truthy, so a
  // pinch that starts with a second finger already down must not read as a
  // tap candidate just because `e.touches` exists.
  it('does not call onTap when the touchstart already carries two touches', () => {
    const onTap = vi.fn();
    const { el } = mount({ onTap });

    dispatchTouchStart(el, [touch(300, 400), touch(340, 440)]);
    dispatchTouchEnd(touch(300, 400));

    expect(onTap).not.toHaveBeenCalled();
  });

  // Review finding #1, the other half: a pinch that starts with ONE finger on
  // the box (a valid tap candidate at touchstart) must stop being one the
  // moment a second finger joins mid-gesture.
  it('does not call onTap when a second finger joins during the gesture', () => {
    const onTap = vi.fn();
    const { el } = mount({ onTap });

    dispatchTouchStart(el, [touch(300, 400)]);
    dispatchTouchMove([touch(300, 400), touch(340, 440)]); // second finger, no movement on the first
    dispatchTouchEnd(touch(300, 400));

    expect(onTap).not.toHaveBeenCalled();
  });

  // Review finding #2 (fling stop): the touchstart that merely stops an
  // in-flight scroll fling is non-cancelable and the finger doesn't move -
  // it must never read as a tap that opens the keyboard.
  it('does not call onTap for a non-cancelable touchstart (a fling-stopping touch)', () => {
    const onTap = vi.fn();
    const { el } = mount({ onTap });

    dispatchTouchStart(el, [touch(300, 400)], { cancelable: false });
    dispatchTouchEnd(touch(300, 400));

    expect(onTap).not.toHaveBeenCalled();
  });

  // Review finding #4 (long-press): a hold past TAP_HOLD_LIMIT_MS (500ms) is
  // a long-press, not a tap, even with zero movement.
  it('does not call onTap when the touch is held past the long-press limit', () => {
    vi.useFakeTimers();
    const onTap = vi.fn();
    const { el } = mount({ onTap });

    dispatchTouchStart(el, [touch(300, 400)]);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    dispatchTouchEnd(touch(300, 400));

    expect(onTap).not.toHaveBeenCalled();
  });

  it('still calls onTap for a quick release inside the long-press limit', () => {
    vi.useFakeTimers();
    const onTap = vi.fn();
    const { el } = mount({ onTap });

    dispatchTouchStart(el, [touch(300, 400)]);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    dispatchTouchEnd(touch(300, 400));

    expect(onTap).toHaveBeenCalledTimes(1);
  });

  // Review finding #3 (order): the flag must be set AFTER the outgoing
  // gesture's own cancelDragRef.current?.() call, whose cancel() resets the
  // same flag - otherwise a still-live gesture at pointer-down wipes the
  // *new* gesture's tap candidacy the instant it is set. A second
  // touchstart on the same element while the first gesture is still live
  // (no touchend/touchcancel yet) starts a fresh gesture whose own,
  // unrelated release must still be read as a tap.
  it('still calls onTap for a fresh touch that interrupts a still-live previous gesture', () => {
    const onTap = vi.fn();
    const { el } = mount({ onTap });

    dispatchTouchStart(el, [touch(300, 400)]); // gesture A starts, never released
    dispatchTouchStart(el, [touch(300, 400)]); // gesture B interrupts it
    dispatchTouchEnd(touch(300, 400)); // gesture B releases with no movement

    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('does not call onTap when the gesture is interrupted by touchcancel', () => {
    const onTap = vi.fn();
    const { el } = mount({ onTap });

    dispatchTouchStart(el, [touch(300, 400)]);
    dispatchTouchCancel();

    expect(onTap).not.toHaveBeenCalled();
  });

  it('does not throw and still commits the position when no onTap is passed', () => {
    const onChange = vi.fn();
    const { el } = mount({ onChange, onTap: null });

    expect(() => {
      dispatchTouchStart(el, [touch(300, 400)]);
      dispatchTouchEnd(touch(300, 400));
    }).not.toThrow();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  // UNDO-04: a touch that stays inside the tap slop is not a move, so it
  // must not commit a position - that would log a near-invisible "Moved"
  // undo step and drop the redo stack.
  it('calls onTap and not onChange for a touch tap with ~3px of movement', () => {
    const onTap = vi.fn();
    const onChange = vi.fn();
    const { el } = mount({ onTap, onChange });

    dispatchTouchStart(el, [touch(300, 400)]);
    dispatchTouchMove([touch(303, 400)]); // dx = 3px, inside the 8px tolerance
    dispatchTouchEnd(touch(303, 400));

    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  // UNDO-04: past the tap slop this is a real move, so it still commits,
  // and it is never read as a tap.
  it('calls onChange with the moved position for a touch drag past 8px, and not onTap', () => {
    const onTap = vi.fn();
    const onChange = vi.fn();
    const { el } = mount({ onTap, onChange });

    dispatchTouchStart(el, [touch(300, 400)]);
    dispatchTouchMove([touch(320, 400)]); // dx = 20px > TAP_MOVEMENT_TOLERANCE_PX
    dispatchTouchEnd(touch(320, 400));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  });

  // UNDO-04: a long-press within the slop is neither a tap (held too long)
  // nor a move (never left the slop), so it commits nothing at all.
  it('calls neither onChange nor onTap for a touch long-press within the slop', () => {
    vi.useFakeTimers();
    const onTap = vi.fn();
    const onChange = vi.fn();
    const { el } = mount({ onTap, onChange });

    dispatchTouchStart(el, [touch(300, 400)]);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    dispatchTouchEnd(touch(300, 400));

    expect(onChange).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
  });
});

// SNG-04: docs/sign-next-gen-guidelines.md §2.2, fill mode's touch-vs-scroll
// rule. `dispatchMouseDown`/`dispatchMouseUp` (no `touches`) exercise the
// "mouse is unchanged" half; touch cases drive `touchNeedsSelection`.
describe('useDraggableElement SNG-04 (fill mode touch claim)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not select or drag an unselected element on a touch, in fill mode', () => {
    const onSelect = vi.fn();
    const onChange = vi.fn();
    const { el } = mount({ onSelect, onChange, touchNeedsSelection: true, isSelected: false });

    dispatchTouchStart(el, [touch(300, 400)]);
    dispatchTouchMove([touch(320, 400)]); // past the 8px tolerance - would be a drag otherwise
    dispatchTouchEnd(touch(320, 400));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves the touchstart unprevented for an unselected element in fill mode, so native scroll proceeds', () => {
    const { el } = mount({ touchNeedsSelection: true, isSelected: false });

    const seen: TouchEvent[] = [];
    el.addEventListener('touchstart', (e) => { seen.push(e as TouchEvent); });
    dispatchTouchStart(el, [touch(300, 400)]);

    expect(seen).toHaveLength(1);
    expect(seen[0].defaultPrevented).toBe(false);
  });

  it('still drags an already-selected element on a touch, in fill mode', () => {
    const onChange = vi.fn();
    const { el } = mount({ onChange, touchNeedsSelection: true, isSelected: true });

    dispatchTouchStart(el, [touch(300, 400)]);
    dispatchTouchMove([touch(320, 400)]);
    dispatchTouchEnd(touch(320, 400));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('drags an unselected element on a touch outside fill mode, unchanged', () => {
    const onSelect = vi.fn();
    const onChange = vi.fn();
    const { el } = mount({ onSelect, onChange, touchNeedsSelection: false, isSelected: false });

    dispatchTouchStart(el, [touch(300, 400)]);
    dispatchTouchMove([touch(320, 400)]);
    dispatchTouchEnd(touch(320, 400));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('never blocks a mouse gesture, even when touchNeedsSelection is true and the element is unselected', () => {
    const onSelect = vi.fn();
    const onChange = vi.fn();
    const { el } = mount({ onSelect, onChange, touchNeedsSelection: true, isSelected: false });

    dispatchMouseDown(el, 300, 400);
    dispatchMouseUp(320, 400);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
