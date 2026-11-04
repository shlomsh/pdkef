import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePinchZoom } from './usePinchZoom.ts';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function Surface({ track }: { track: () => MediaStreamTrack | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  usePinchZoom(ref, track);
  return <div ref={ref} data-surface />;
}
const fakeTrack = (zoom?: { min: number; max: number; step?: number }) => ({
  getCapabilities: () => (zoom ? { zoom } : {}),
  getSettings: () => ({ zoom: 1 }),
  getConstraints: () => ({ width: { ideal: 1920 } }),
  applyConstraints: vi.fn().mockResolvedValue(undefined),
});
function mount(track: ReturnType<typeof fakeTrack> | undefined) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<Surface track={() => track as unknown as MediaStreamTrack} />, container!));
  return container.querySelector('[data-surface]') as HTMLElement;
}
const touch = (el: HTMLElement, type: string, ...points: Array<[number, number]>) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
  el.dispatchEvent(event);
  return event;
};

describe('usePinchZoom', () => {
  it('a pinch zooms the track and keeps its other constraints', () => {
    const track = fakeTrack({ min: 1, max: 10 });
    const el = mount(track);
    touch(el, 'touchstart', [0, 0], [100, 0]);
    touch(el, 'touchmove', [0, 0], [200, 0]);
    expect(track.applyConstraints).toHaveBeenCalledWith({ width: { ideal: 1920 }, advanced: [{ zoom: 2 }] });
  });
  it('one finger does nothing', () => {
    const track = fakeTrack({ min: 1, max: 10 });
    const el = mount(track);
    touch(el, 'touchstart', [0, 0]);
    touch(el, 'touchmove', [50, 0]);
    expect(track.applyConstraints).not.toHaveBeenCalled();
  });
  it('lifting a finger ends the pinch', () => {
    const track = fakeTrack({ min: 1, max: 10 });
    const el = mount(track);
    touch(el, 'touchstart', [0, 0], [100, 0]);
    touch(el, 'touchend', [0, 0]);
    touch(el, 'touchmove', [0, 0], [200, 0]);
    expect(track.applyConstraints).not.toHaveBeenCalled();
  });
  it('a camera with no zoom, or no camera yet, is left alone', () => {
    for (const track of [fakeTrack(), undefined]) {
      const el = mount(track);
      touch(el, 'touchstart', [0, 0], [100, 0]);
      touch(el, 'touchmove', [0, 0], [200, 0]);
      expect(track?.applyConstraints ?? vi.fn()).not.toHaveBeenCalled();
      act(() => render(null, container!));
    }
  });
  it('the browser never gets the pinch, zoom on offer or not', () => {
    const el = mount(fakeTrack());
    const gesture = new Event('gesturestart', { bubbles: true, cancelable: true });
    el.dispatchEvent(gesture);
    expect(gesture.defaultPrevented).toBe(true);
  });
});
