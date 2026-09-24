import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import useDraggableElement from './useDraggableElement.js';

// MOBI-31 coverage. A two-finger pinch whose first finger lands on a Sign
// element must never be read as a drag: today's bug was the element jumping
// to wherever the pinch's midpoint happened to move. Same tiny harness as
// useDraggableElement.tap.test.tsx - drives real Touch/MouseEvents at the
// real DOM node, matching DraggableWrapper's own onMouseDown/onTouchStart
// wiring, rather than calling hook internals directly.

type ApiRef = { current: { handlePointerDown: (e: Event) => void } | null };

function Harness({
  apiRef,
  onSelect = () => {},
  onChange = () => {},
  onTap = null,
}: {
  apiRef: ApiRef;
  onSelect?: (e: Event) => void;
  onChange?: (changes: Record<string, number>) => void;
  onTap?: (() => void) | null;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const element = { id: 'el-1', type: 'text', left: 20, top: 10, text: 'Hi', fontSize: 12, textDirection: 'ltr' };
  const getPageWrapper = () => wrapperRef.current;

  const { handlePointerDown } = useDraggableElement({
    element,
    elementRef,
    getPageWrapper,
    onSelect,
    onChange,
    onTap,
  });

  apiRef.current = { handlePointerDown };

  return (
    <div ref={wrapperRef}>
      <div ref={elementRef} data-el onMouseDown={handlePointerDown} onTouchStart={handlePointerDown} />
    </div>
  );
}

// .claude/rules/editor.md's "Geometry rules": a realistic, non-square rect,
// never jsdom's 0x0 default.
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
}: {
  onSelect?: (e: Event) => void;
  onChange?: (changes: Record<string, number>) => void;
  onTap?: (() => void) | null;
} = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const apiRef: ApiRef = { current: null };
  act(() => {
    render(<Harness apiRef={apiRef} onSelect={onSelect} onChange={onChange} onTap={onTap} />, host);
  });
  const wrapper = host.querySelector('div') as HTMLDivElement;
  wrapper.getBoundingClientRect = pageRect;
  const el = host.querySelector('[data-el]') as HTMLDivElement;
  el.getBoundingClientRect = elRect;
  return { host, el, wrapper, unmount: () => act(() => render(null, host)) };
}

function touch(clientX: number, clientY: number) {
  return { clientX, clientY } as Touch;
}

function dispatchTouchStart(target: EventTarget, touches: Touch[]) {
  const event = new TouchEvent('touchstart', { touches, changedTouches: touches, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
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

describe('useDraggableElement MOBI-31 pinch cancellation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('cancels the move, restores the DOM and commits nothing once a second finger joins', () => {
    const onChange = vi.fn();
    const { el } = mount({ onChange });

    dispatchTouchStart(el, [touch(300, 400)]);
    dispatchTouchMove([touch(330, 400)]); // single-finger move - live preview only
    expect(el.style.transform).toBe('translate(30px, 0px)');

    dispatchTouchMove([touch(330, 400), touch(370, 440)]); // second finger joins mid-drag
    expect(el.style.transform).toBe('none'); // preview undone, same as a plain cancel

    // A late touchend for the (already-cancelled) gesture commits nothing.
    dispatchTouchEnd(touch(330, 400));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not fire onTap for a pinch that started as a single-finger tap candidate', () => {
    const onTap = vi.fn();
    const { el } = mount({ onTap });

    dispatchTouchStart(el, [touch(300, 400)]); // valid tap candidate at the start
    dispatchTouchMove([touch(300, 400), touch(340, 440)]); // second finger joins - cancels the gesture
    dispatchTouchEnd(touch(300, 400));

    expect(onTap).not.toHaveBeenCalled();
  });

  it('ignores a touchstart that already carries two touches - no select, no drag, no preventDefault', () => {
    const onSelect = vi.fn();
    const onChange = vi.fn();
    const { el } = mount({ onSelect, onChange });

    const event = dispatchTouchStart(el, [touch(300, 400), touch(340, 440)]);

    expect(onSelect).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    // No gesture started, so a touchend for it commits nothing either.
    dispatchTouchEnd(touch(300, 400));
    expect(onChange).not.toHaveBeenCalled();
    expect(el.style.transform).toBe('');
  });
});
