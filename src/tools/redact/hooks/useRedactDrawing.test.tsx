import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useRedactDrawing from './useRedactDrawing.ts';
import type { RedactState } from '../state/redactState.ts';

// Native scrolling has to be cancelled by the page's own touchmove, and
// Chrome ignores preventDefault() from a passive listener, so both halves of
// that are pinned here: the listener is registered non-passive, and a drag
// that is drawing a box cancels its touchmove.
describe('useRedactDrawing - touch drag-draw', () => {
  let host: HTMLElement;
  let handlePointerDown!: ReturnType<typeof useRedactDrawing>['handlePointerDown'];

  function Probe() {
    ({ handlePointerDown } = useRedactDrawing({
      state: { tool: { activeStyle: 'whiteout', activeBlurStrength: 1 } } as RedactState,
      dispatch: vi.fn(),
      setAnnouncement: vi.fn(),
      disarmTool: vi.fn(),
      brushKind: null,
      samplePage: () => '#ffffff',
      add: vi.fn(),
    }));
    return <div />;
  }

  const touchAt = (target: Element, x: number, y: number) => ({ identifier: 1, target, clientX: x, clientY: y });

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<Probe />, host));
  });
  afterEach(() => {
    act(() => render(null, host));
    host.remove();
    vi.restoreAllMocks();
  });

  function startTouchDraw() {
    const overlay = document.createElement('div');
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400, x: 0, y: 0 } as DOMRect);
    const start = new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touchAt(overlay, 30, 30)] as never });
    Object.defineProperty(start, 'currentTarget', { value: overlay });
    handlePointerDown(start as never, 0);
  }

  it('cancels the touchmove of a drag-drawn box so the page does not scroll under the finger', () => {
    startTouchDraw();
    const move = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touchAt(host, 90, 90)] as never });
    window.dispatchEvent(move);
    window.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] }));

    expect(move.defaultPrevented).toBe(true);
  });

  it('registers the touchmove listener as non-passive, or the browser would ignore that cancel', () => {
    const add = vi.spyOn(window, 'addEventListener');
    try {
      startTouchDraw();
      window.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] }));

      const touchmove = add.mock.calls.find(([type]) => type === 'touchmove');
      expect(touchmove?.[2]).toMatchObject({ passive: false });
    } finally {
      add.mockRestore();
    }
  });
});
