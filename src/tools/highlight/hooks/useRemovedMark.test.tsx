import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNDO_CHIP_MS, useRemovedMark } from './useRemovedMark.ts';

let container: HTMLElement | null = null;
let api: ReturnType<typeof useRemovedMark>;

function Probe({ elements }: { elements: readonly unknown[] }) {
  api = useRemovedMark(elements);
  return null;
}

function mount(elements: readonly unknown[]) {
  container = document.createElement('div');
  act(() => render(<Probe elements={elements} />, container!));
}

function rerender(elements: readonly unknown[]) {
  act(() => render(<Probe elements={elements} />, container!));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  vi.useRealTimers();
});

describe('useRemovedMark', () => {
  it('starts with nothing removed', () => {
    mount([1, 2]);
    expect(api.removed).toBeNull();
  });

  it('shows, then dismisses itself after five seconds', () => {
    mount([1, 2]);
    act(() => api.show({ x: 1, y: 2 }));
    expect(api.removed).toEqual({ at: { x: 1, y: 2 } });
    act(() => { vi.advanceTimersByTime(UNDO_CHIP_MS - 1); });
    expect(api.removed).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(api.removed).toBeNull();
  });

  it('keeps the render that carries the delete itself', () => {
    mount([1, 2]);
    act(() => { api.show(null); render(<Probe elements={[1]} />, container!); });
    expect(api.removed).toEqual({ at: null });
  });

  it('a later elements change dismisses it', () => {
    mount([1, 2]);
    act(() => { api.show(null); render(<Probe elements={[1]} />, container!); });
    expect(api.removed).not.toBeNull();
    rerender([1, 3]);
    expect(api.removed).toBeNull();
  });

  it('a second show restarts the timer', () => {
    mount([1]);
    act(() => api.show(null));
    act(() => { vi.advanceTimersByTime(UNDO_CHIP_MS - 1000); });
    act(() => api.show(null));
    act(() => { vi.advanceTimersByTime(UNDO_CHIP_MS - 1000); });
    expect(api.removed).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(api.removed).toBeNull();
  });

  it('dismiss clears it', () => {
    mount([1]);
    act(() => api.show(null));
    act(() => api.dismiss());
    expect(api.removed).toBeNull();
  });
});
