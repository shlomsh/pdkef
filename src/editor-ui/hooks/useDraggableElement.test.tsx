import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach } from 'vitest';
import useDraggableElement from './useDraggableElement.js';

// DEBT-73. A drag that starts while the previous one has not released must
// leave `isDragging` true: the outgoing gesture's cancel() resets that flag,
// so the new gesture has to set it after the cancel, not before.

type ApiRef = { current: { isDragging: { current: boolean } } | null };

function Harness({ apiRef }: { apiRef: ApiRef }) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const element = { id: 'el-1', type: 'text', left: 20, top: 10, text: 'Hi', fontSize: 12, textDirection: 'ltr' };

  const { handlePointerDown, isDragging } = useDraggableElement({
    element,
    elementRef,
    getPageWrapper: () => wrapperRef.current,
    onSelect: () => {},
    onChange: () => {},
  });

  apiRef.current = { isDragging };

  return (
    <div ref={wrapperRef}>
      <div ref={elementRef} data-el onMouseDown={handlePointerDown} />
    </div>
  );
}

describe('useDraggableElement replacing a live gesture', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps isDragging true when a second drag starts before the first released', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const apiRef: ApiRef = { current: null };
    act(() => {
      render(<Harness apiRef={apiRef} />, host);
    });
    // Realistic page rect, never jsdom's 0x0 (.claude/rules/editor.md).
    (host.querySelector('div') as HTMLDivElement).getBoundingClientRect = () => new DOMRect(0, 0, 600, 800);
    const el = host.querySelector('[data-el]') as HTMLDivElement;
    el.getBoundingClientRect = () => new DOMRect(260, 380, 80, 20);

    const down = (x: number, y: number) =>
      act(() => {
        el.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
      });

    down(300, 400);
    expect(apiRef.current!.isDragging.current).toBe(true);

    down(310, 410); // second gesture, first never released
    expect(apiRef.current!.isDragging.current).toBe(true);
  });
});
