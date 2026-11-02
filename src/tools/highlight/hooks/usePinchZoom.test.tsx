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
    const { col, commit } = mountTouch();
    col.dispatchEvent(touchEvent('touchstart', [f(100, 100), f(200, 100)]));
    col.dispatchEvent(touchEvent('touchmove', [f(80, 140), f(280, 140)]));
    col.dispatchEvent(touchEvent('touchend', [f(80, 140)]));
    expect(commit).toHaveBeenCalledWith(2, 2, { x: 150, y: 100 }, false, { x: 30, y: 40 });
  });

  it('two fingers that only travel move the page and commit no zoom', () => {
    const { ws, col, commit } = mountTouch();
    ws.scrollLeft = 100;
    ws.scrollTop = 500;
    col.dispatchEvent(touchEvent('touchstart', [f(100, 100), f(200, 100)]));
    col.dispatchEvent(touchEvent('touchmove', [f(70, 160), f(170, 160)]));
    expect(col.style.transform).toMatch(/^translate\(-30px, [\d.]+px\) scale\(1\)$/);
    col.dispatchEvent(touchEvent('touchend', [f(70, 160)]));
    expect(commit).not.toHaveBeenCalled();
    expect(ws.scrollLeft).toBe(130);
    expect(ws.scrollTop).toBe(440);
  });
});
