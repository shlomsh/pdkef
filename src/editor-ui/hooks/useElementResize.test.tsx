import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import useElementResize from './useElementResize.js';

// MOBI-31 coverage. A pinch whose first finger lands on a resize handle must
// never be read as a resize (today's bug: a text box's side handle turned it
// into a comb). Same "drive it like the browser would" harness style as
// useDraggableElement.tap.test.tsx/useDraggableElement.pinchCancel.test.tsx -
// real Touch events at a real DOM node, wired the way ElementResizers.tsx
// wires a handle's onTouchStart to `onResizeStart`.

type ApiRef = { current: { handleResizeStart: (e: Event, handle?: string) => void; isSpanResizing: boolean } | null };

function Harness({
  apiRef,
  element,
  handle = 'right',
  onChange = () => {},
}: {
  apiRef: ApiRef;
  element: Record<string, unknown>;
  handle?: string;
  onChange?: (changes: Record<string, unknown>) => void;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const getPageWrapper = () => wrapperRef.current;

  const { handleResizeStart, isSpanResizing } = useElementResize({
    element,
    elementRef,
    getPageWrapper,
    pageWidthPoints: 600,
    onChange,
  });

  apiRef.current = { handleResizeStart: (e) => handleResizeStart(e, handle), isSpanResizing };

  return (
    <div ref={wrapperRef}>
      <div ref={elementRef} data-el>
        <div
          data-handle
          onMouseDown={(e) => handleResizeStart(e as unknown as Event, handle)}
          onTouchStart={(e) => handleResizeStart(e as unknown as Event, handle)}
        />
      </div>
    </div>
  );
}

function pageRect() {
  return new DOMRect(0, 0, 600, 800);
}

function elRect() {
  return new DOMRect(260, 380, 80, 20);
}

function mount({
  element,
  handle,
  onChange,
}: {
  element: Record<string, unknown>;
  handle?: string;
  onChange?: (changes: Record<string, unknown>) => void;
}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const apiRef: ApiRef = { current: null };
  act(() => {
    render(<Harness apiRef={apiRef} element={element} handle={handle} onChange={onChange} />, host);
  });
  const wrapper = host.querySelector('div') as HTMLDivElement;
  wrapper.getBoundingClientRect = pageRect;
  const el = host.querySelector('[data-el]') as HTMLDivElement;
  el.getBoundingClientRect = elRect;
  const handleNode = host.querySelector('[data-handle]') as HTMLDivElement;
  return { host, el, handleNode, apiRef, unmount: () => act(() => render(null, host)) };
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

describe('useElementResize MOBI-31 pinch cancellation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('cancels a box resize, restores the DOM and commits nothing once a second finger joins', () => {
    const onChange = vi.fn();
    const rectangle = { id: 'r1', type: 'rectangle', pageIndex: 0, left: 20, top: 10, width: 30, height: 15, color: '#000', strokeWidth: 1 };
    const { el, handleNode } = mount({ element: rectangle, handle: 'right', onChange });

    expect(el.getAttribute('style')).toBeNull();

    dispatchTouchStart(handleNode, [touch(300, 400)]);
    dispatchTouchMove([touch(360, 400)]); // single-finger resize - live preview only
    expect(el.style.width).toBe('40%'); // 30% start + (60px / 600px page) * 100

    dispatchTouchMove([touch(360, 400), touch(400, 440)]); // second finger joins mid-resize
    expect(el.getAttribute('style')).toBeNull(); // every style this gesture painted is gone

    // A late touchend for the (already-cancelled) gesture commits nothing.
    dispatchTouchEnd(touch(360, 400));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('undoes the span-resizing grab-time flip when a second finger joins a text side-handle drag', () => {
    const onChange = vi.fn();
    const text = { id: 't1', type: 'text', pageIndex: 0, left: 20, top: 10, text: 'Hi', fontSize: 12, textDirection: 'ltr' };
    const { el, handleNode, apiRef } = mount({ element: text, handle: 'left', onChange });

    expect(apiRef.current!.isSpanResizing).toBe(false);

    dispatchTouchStart(handleNode, [touch(300, 400)]);
    // Grabbing a span handle flips isSpanResizing synchronously, even before
    // the first move - see the comment at its call site in useElementResize.js.
    expect(apiRef.current!.isSpanResizing).toBe(true);

    dispatchTouchMove([touch(280, 400)]); // single-finger comb-width drag
    expect(el.getAttribute('style')).not.toBeNull();

    dispatchTouchMove([touch(280, 400), touch(320, 440)]); // second finger joins mid-resize
    expect(apiRef.current!.isSpanResizing).toBe(false);
    expect(el.getAttribute('style')).toBeNull();

    dispatchTouchEnd(touch(280, 400));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a touchstart that already carries two touches - no resize starts', () => {
    const onChange = vi.fn();
    const rectangle = { id: 'r2', type: 'rectangle', pageIndex: 0, left: 20, top: 10, width: 30, height: 15, color: '#000', strokeWidth: 1 };
    const { el, handleNode, apiRef } = mount({ element: rectangle, handle: 'right', onChange });

    const event = dispatchTouchStart(handleNode, [touch(300, 400), touch(340, 440)]);

    expect(event.defaultPrevented).toBe(false);
    expect(apiRef.current!.isSpanResizing).toBe(false);
    expect(el.getAttribute('style')).toBeNull();

    // No gesture started, so a touchend for it commits nothing either.
    dispatchTouchEnd(touch(300, 400));
    expect(onChange).not.toHaveBeenCalled();
  });
});
