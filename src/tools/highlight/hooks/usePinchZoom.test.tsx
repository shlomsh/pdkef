// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { usePinchZoom } from './usePinchZoom.ts';
import { ZOOM_MAX } from '../lib/zoom/fit.ts';

function Harness(props: Parameters<typeof usePinchZoom>[0]) {
  usePinchZoom(props);
  return null;
}

describe('usePinchZoom', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('leaves no preview transform behind when a pinch at the zoom bound commits nothing', () => {
    const ws = document.createElement('div');
    const col = document.createElement('div');
    document.body.append(ws, col);
    const commit = vi.fn();
    const root = document.createElement('div');
    act(() => render(<Harness workspaceRef={{ current: ws }} columnRef={{ current: col }} enabled inLamp zoomRef={{ current: ZOOM_MAX }} floorRef={{ current: 0.5 }} commit={commit} />, root));
    ws.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -50, clientX: 10, clientY: 10, cancelable: true }));
    expect(col.style.transform).toBe('translate(0px, 0px) scale(1)');
    vi.advanceTimersByTime(200);
    expect(col.style.transform).toBe('');
    expect(col.style.transformOrigin).toBe('');
    expect(commit).not.toHaveBeenCalled();
  });

  it('a wheel pinch out stops at the floor, however far it goes', () => {
    const ws = document.createElement('div');
    const col = document.createElement('div');
    document.body.append(ws, col);
    const commit = vi.fn();
    const root = document.createElement('div');
    act(() => render(<Harness workspaceRef={{ current: ws }} columnRef={{ current: col }} enabled inLamp zoomRef={{ current: 1 }} floorRef={{ current: 0.8 }} commit={commit} />, root));
    ws.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: 500, clientX: 10, clientY: 10, cancelable: true }));
    expect(col.style.transform).toMatch(/scale\(0\.8\)$/);
    vi.advanceTimersByTime(200);
    expect(commit).toHaveBeenCalledWith(0.8, 0.8, { x: 10, y: 10 });
  });

  const touchEvent = (type: string, touches: Array<{ clientX: number; clientY: number }>) =>
    Object.assign(new Event(type, { bubbles: true, cancelable: true }), { touches });

  function mountTouch(zoom = 1) {
    const ws = document.createElement('div');
    const col = document.createElement('div');
    document.body.append(ws, col);
    Object.defineProperty(ws, 'scrollWidth', { value: 1000 });
    Object.defineProperty(ws, 'clientWidth', { value: 400 });
    Object.defineProperty(ws, 'scrollHeight', { value: 3000 });
    Object.defineProperty(ws, 'clientHeight', { value: 800 });
    const commit = vi.fn();
    act(() => render(<Harness workspaceRef={{ current: ws }} columnRef={{ current: col }} enabled inLamp zoomRef={{ current: zoom }} floorRef={{ current: 0.5 }} commit={commit} />, document.createElement('div')));
    return { ws, col, commit };
  }
  const f = (x: number, y: number) => ({ clientX: x, clientY: y });

  // A wide column (rect 1000 wide, scrolled 100px in) in a 400 wide view with no padding: it may move only until an edge meets the view's.
  function mountWide() {
    const m = mountTouch();
    m.col.getBoundingClientRect = () => ({ left: -100, top: 0, width: 1000, height: 3000, right: 900, bottom: 3000, x: -100, y: 0, toJSON() {} }) as DOMRect;
    m.ws.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 800, right: 400, bottom: 800, x: 0, y: 0, toJSON() {} }) as DOMRect;
    return m;
  }

  it('a pinch read from touches zooms after a touchstart sequence that began as one finger', () => {
    const { col, commit } = mountTouch();
    col.dispatchEvent(touchEvent('touchstart', [f(100, 100)]));
    col.dispatchEvent(touchEvent('touchstart', [f(100, 100), f(200, 100)]));
    const move = touchEvent('touchmove', [f(50, 100), f(250, 100)]);
    col.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(true);
    expect(col.style.transform).toMatch(/scale\(2\)$/);
    col.dispatchEvent(touchEvent('touchend', [f(50, 100)]));
    expect(col.style.transform).toBe('');
    expect(commit).toHaveBeenCalledWith(2, 2, { x: 150, y: 100 });
  });

  it('a pinch that also travels hands the midpoint travel to the commit', () => {
    const { col, commit } = mountWide();
    col.dispatchEvent(touchEvent('touchstart', [f(100, 100), f(200, 100)]));
    col.dispatchEvent(touchEvent('touchmove', [f(80, 140), f(280, 140)]));
    col.dispatchEvent(touchEvent('touchend', [f(80, 140)]));
    expect(commit).toHaveBeenCalledWith(2, 2, { x: 150, y: 100 }, false, { x: 30, y: 40 });
  });

  it('two fingers that only travel move the page and commit no zoom', () => {
    const { ws, col, commit } = mountWide();
    ws.scrollLeft = 100;
    ws.scrollTop = 500;
    col.dispatchEvent(touchEvent('touchstart', [f(100, 100), f(200, 100)]));
    col.dispatchEvent(touchEvent('touchmove', [f(70, 160), f(170, 160)]));
    expect(col.style.transform).toBe('translate(-30px, 0px) scale(1)');
    col.dispatchEvent(touchEvent('touchend', [f(70, 160)]));
    expect(commit).not.toHaveBeenCalled();
    expect(ws.scrollLeft).toBe(130);
    // The page was already at the top, so the downward pan is held back and the scroll stays.
    expect(ws.scrollTop).toBe(500);
  });

  it('a pan past the board edge shows a clamped transform while the fingers are down', () => {
    const { col } = mountWide();
    col.dispatchEvent(touchEvent('touchstart', [f(100, 100), f(200, 100)]));
    col.dispatchEvent(touchEvent('touchmove', [f(270, 100), f(370, 100)]));
    // The fingers travelled 170px right, but the column's left edge may only come back to the view's left edge.
    expect(col.style.transform).toBe('translate(100px, 0px) scale(1)');
  });

  it('a pan-only release moves the scroll by what the preview showed, so nothing jumps', () => {
    const { ws, col, commit } = mountWide();
    ws.scrollLeft = 100;
    col.dispatchEvent(touchEvent('touchstart', [f(100, 100), f(200, 100)]));
    col.dispatchEvent(touchEvent('touchmove', [f(270, 100), f(370, 100)]));
    const shown = Number(/translate\((-?[\d.]+)px/.exec(col.style.transform)![1]);
    col.dispatchEvent(touchEvent('touchend', [f(270, 100)]));
    expect(commit).not.toHaveBeenCalled();
    expect(ws.scrollLeft).toBe(100 - shown);
  });

  it('a pinch that pans past the edge hands the commit the travel the preview showed', () => {
    const { col, commit } = mountWide();
    col.dispatchEvent(touchEvent('touchstart', [f(100, 100), f(200, 100)]));
    col.dispatchEvent(touchEvent('touchmove', [f(140, 100), f(200, 100)]));
    const shown = Number(/translate\((-?[\d.]+)px/.exec(col.style.transform)![1]);
    col.dispatchEvent(touchEvent('touchend', [f(140, 100)]));
    expect(shown).toBe(0);
    expect(commit.mock.calls[0][4].x).toBe(shown);
  });
});
