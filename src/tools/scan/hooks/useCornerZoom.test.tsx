import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CORNER_ZOOM_VAR, useCornerZoom } from './useCornerZoom.ts';

type CornerZoom = ReturnType<typeof useCornerZoom>;

let container: HTMLElement | null = null;
let api: CornerZoom;
let area: HTMLElement;

// The layout jsdom lacks: the area is 300x200 at the origin; the frame sits 20px / 10px inside the scrolled content
// and is 400x300 times the zoom, so it moves with the scroll like the real one.
function modelLayout(el: HTMLElement) {
  let left = 0;
  let top = 0;
  Object.defineProperty(el, 'scrollLeft', { configurable: true, get: () => left, set: (v: number) => { left = v; } });
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200, x: 0, y: 0 } as DOMRect);
  const frame = el.querySelector('[data-corner-frame]') as HTMLElement;
  frame.getBoundingClientRect = () => {
    const z = Number(el.style.getPropertyValue(CORNER_ZOOM_VAR) || 1);
    return { left: 20 - left, top: 10 - top, width: 400 * z, height: 300 * z } as DOMRect;
  };
}

function Probe({ resetKey }: { resetKey: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  api = useCornerZoom(ref, resetKey);
  return (
    <div ref={ref} data-area>
      <div data-corner-frame><img alt="" data-photo /></div>
      <button data-btn>b</button>
      <input data-input />
    </div>
  );
}

function mount(resetKey: unknown = 'a') {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<Probe resetKey={resetKey} />, container!));
  area = container.querySelector('[data-area]') as HTMLElement;
  modelLayout(area);
}
const rerender = (resetKey: unknown) => act(() => render(<Probe resetKey={resetKey} />, container!));
const prop = () => area.style.getPropertyValue(CORNER_ZOOM_VAR);

const wheel = (init: WheelEventInit & { target?: Element }) => {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  area.dispatchEvent(event);
  return event;
};
const touch = (type: string, ...points: Array<[number, number]>) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
  area.dispatchEvent(event);
  return event;
};
const key = (k: string, init: KeyboardEventInit = {}, target: Element | Window = window) => {
  const event = new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, cancelable: true, ...init });
  act(() => { target.dispatchEvent(event); });
  return event;
};
const mouse = (type: string, target: EventTarget, x: number, y: number, button = 0) =>
  act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button })); });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  vi.useRealTimers();
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('useCornerZoom', () => {
  it('starts at Fit with nothing to zoom out of, so the editor looks as it did before zoom', () => {
    mount();
    expect(api.zoom).toBe(1);
    expect(api.canZoomOut).toBe(false);
    expect(api.canZoomIn).toBe(true);
  });

  it('zoomIn writes 1.5 to the property and to state, so the buttons and the DOM agree', () => {
    mount();
    act(() => api.zoomIn());
    expect(prop()).toBe('1.5');
    expect(api.zoom).toBe(1.5);
    expect(api.canZoomOut).toBe(true);
  });

  // Protects the scroll during a gesture: the area only scrolls while flagged, so the flag must go on with the first DOM write, before state commits.
  it('flags the area as zoomed with the DOM write itself, and unflags it at Fit', () => {
    mount();
    area.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, clientX: 150, clientY: 100, bubbles: true, cancelable: true }));
    expect(area.hasAttribute('data-zoomed')).toBe(true);
    expect(api.zoom).toBe(1);
    act(() => api.fit());
    expect(area.hasAttribute('data-zoomed')).toBe(false);
  });

  it('a button zoom keeps the centre of the visible box where it was, so the view does not jump', () => {
    mount();
    const before = (150 - 20) / 400;
    act(() => api.zoomIn());
    const r = (area.querySelector('[data-corner-frame]') as HTMLElement).getBoundingClientRect();
    expect(r.left + before * r.width).toBeCloseTo(150, 5);
  });

  it('fit removes the property and zeroes the scroll, so Fit is the unzoomed layout again', () => {
    mount();
    act(() => api.zoomIn());
    area.scrollLeft = 40; area.scrollTop = 30;
    act(() => api.fit());
    expect(prop()).toBe('');
    expect([area.scrollLeft, area.scrollTop]).toEqual([0, 0]);
    expect(api.zoom).toBe(1);
  });

  it('a Ctrl+wheel is prevented, writes at once and commits state once after the burst, so it stays smooth', () => {
    mount();
    const first = wheel({ ctrlKey: true, deltaY: -50, clientX: 100, clientY: 80 });
    expect(first.defaultPrevented).toBe(true);
    expect(Number(prop())).toBeCloseTo(Math.exp(0.5), 5);
    expect(api.zoom).toBe(1);
    vi.advanceTimersByTime(100);
    wheel({ ctrlKey: true, deltaY: -50, clientX: 100, clientY: 80 });
    vi.advanceTimersByTime(100);
    expect(api.zoom).toBe(1);
    act(() => { vi.advanceTimersByTime(60); });
    expect(api.zoom).toBeCloseTo(Math.exp(1), 5);
    expect(prop()).toBe(String(api.zoom));
  });

  it('a plain wheel is left to scroll natively, so ordinary scrolling still works', () => {
    mount();
    const event = wheel({ deltaY: -50 });
    expect(event.defaultPrevented).toBe(false);
    expect(prop()).toBe('');
    vi.advanceTimersByTime(500);
    expect(api.zoom).toBe(1);
  });

  it('the photo point under the pointer stays within 1px across a Ctrl+wheel zoom, so the zoom aims where you point', () => {
    mount();
    const frame = area.querySelector('[data-corner-frame]') as HTMLElement;
    const at = { x: 220, y: 140 };
    const r0 = frame.getBoundingClientRect();
    const fx = (at.x - r0.left) / r0.width;
    const fy = (at.y - r0.top) / r0.height;
    for (const deltaY of [-40, -40, -30]) wheel({ ctrlKey: true, deltaY, clientX: at.x, clientY: at.y });
    const r1 = frame.getBoundingClientRect();
    expect(Math.abs(r1.left + fx * r1.width - at.x)).toBeLessThan(1);
    expect(Math.abs(r1.top + fy * r1.height - at.y)).toBeLessThan(1);
    expect(Number(prop())).toBeGreaterThan(2);
  });

  it('a two-finger move scales by the distance ratio and commits on touchend, so a pinch zooms once', () => {
    mount();
    touch('touchstart', [100, 100]);
    touch('touchstart', [100, 100], [200, 100]);
    const move = touch('touchmove', [50, 100], [250, 100]);
    expect(move.defaultPrevented).toBe(true);
    expect(Number(prop())).toBeCloseTo(2, 5);
    expect(api.zoom).toBe(1);
    act(() => { touch('touchend', [250, 100]); });
    expect(api.zoom).toBeCloseTo(2, 5);
  });

  it('a one-finger move does nothing, so panning and corner drags are not hijacked', () => {
    mount();
    touch('touchstart', [100, 100]);
    const move = touch('touchmove', [50, 100]);
    expect(move.defaultPrevented).toBe(false);
    expect(prop()).toBe('');
    expect(api.zoom).toBe(1);
  });

  it('gesturestart is prevented, so iOS never zooms the page under the editor', () => {
    mount();
    const event = new Event('gesturestart', { bubbles: true, cancelable: true });
    area.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Cmd+= zooms in, Cmd+- out and Cmd+0 fits, and the browser never sees them', () => {
    mount();
    expect(key('=').defaultPrevented).toBe(true);
    expect(api.zoom).toBe(1.5);
    key('+');
    expect(api.zoom).toBeCloseTo(2.25, 5);
    key('-');
    expect(api.zoom).toBe(1.5);
    key('0');
    expect(api.zoom).toBe(1);
    expect(prop()).toBe('');
  });

  it('the keys are ignored in a text input and with Alt down, so typing and other shortcuts are safe', () => {
    mount();
    const input = area.querySelector('[data-input]') as HTMLElement;
    const typed = key('=', {}, input);
    expect(typed.defaultPrevented).toBe(false);
    expect(api.zoom).toBe(1);
    key('=', { altKey: true });
    expect(api.zoom).toBe(1);
    key('=', { metaKey: false });
    expect(api.zoom).toBe(1);
  });

  it('a mouse drag on the photo at zoom 2 scrolls by the drag distance, so the page can be moved around', () => {
    mount();
    act(() => { api.zoomIn(); api.zoomIn(); });
    const left = area.scrollLeft;
    const top = area.scrollTop;
    mouse('mousedown', area.querySelector('[data-corner-frame]')!, 200, 150);
    mouse('mousemove', window, 170, 120);
    expect(area.scrollLeft).toBe(left + 30);
    expect(area.scrollTop).toBe(top + 30);
    mouse('mouseup', window, 170, 120);
    mouse('mousemove', window, 100, 100);
    expect(area.scrollLeft).toBe(left + 30);
  });

  // The photo takes no pointer input (no image menu on a long press), so the press lands on the frame.
  it('a press on the frame starts a pan while zoomed', () => {
    mount();
    act(() => { api.zoomIn(); api.zoomIn(); });
    const left = area.scrollLeft;
    mouse('mousedown', area.querySelector('[data-corner-frame]')!, 200, 150);
    mouse('mousemove', window, 190, 150);
    expect(area.scrollLeft).toBe(left + 10);
    mouse('mouseup', window, 190, 150);
  });

  it('a drag at Fit or from a button does nothing, so a click on a control is never a pan', () => {
    mount();
    mouse('mousedown', area.querySelector('[data-corner-frame]')!, 200, 150);
    mouse('mousemove', window, 100, 100);
    expect(area.scrollLeft).toBe(0);
    act(() => { api.zoomIn(); api.zoomIn(); });
    const left = area.scrollLeft;
    mouse('mousedown', area.querySelector('[data-btn]')!, 200, 150);
    mouse('mousemove', window, 100, 100);
    expect(area.scrollLeft).toBe(left);
    mouse('mouseup', window, 100, 100);
  });

  it('changing resetKey goes back to Fit in state and DOM, so a new page starts whole', () => {
    mount('a');
    act(() => api.zoomIn());
    area.scrollLeft = 25;
    rerender('b');
    expect(api.zoom).toBe(1);
    expect(prop()).toBe('');
    expect(area.scrollLeft).toBe(0);
  });

  it('a wheel commit pending at unmount never fires and the listeners are gone, so nothing leaks', () => {
    mount();
    wheel({ ctrlKey: true, deltaY: -50, clientX: 100, clientY: 80 });
    const spy = vi.spyOn(window, 'removeEventListener');
    act(() => render(null, container!));
    expect(vi.getTimerCount()).toBe(0);
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    const late = wheel({ ctrlKey: true, deltaY: -50 });
    expect(late.defaultPrevented).toBe(false);
    spy.mockRestore();
  });
});
