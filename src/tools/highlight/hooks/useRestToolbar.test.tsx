import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HINT_KEY, HINT_MS } from '../lib/marker/hint.ts';
import { REST } from '../lib/marker/restDetector.ts';
import { useRestToolbar } from './useRestToolbar.ts';

let container: HTMLElement | null = null;
let api: ReturnType<typeof useRestToolbar>;

function Probe() {
  api = useRestToolbar();
  return null;
}

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<Probe />, container!));
}

const markNode = (id: string) => {
  const node = document.createElement('div');
  node.setAttribute('data-element-id', id);
  const child = document.createElement('span');
  node.appendChild(child);
  return child;
};
const blank = document.createElement('div');

function move(x: number, y: number, over: Element | null, extra: { pointerType?: string; buttons?: number } = {}) {
  act(() => api.onPointerMove({ clientX: x, clientY: y, target: over ?? blank, pointerType: 'mouse', buttons: 0, ...extra } as unknown as PointerEvent));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('useRestToolbar rest detection', () => {
  it('opens the toolbar for the highlight the pointer rested on', () => {
    mount();
    const over = markNode('a');
    move(100, 100, over);
    act(() => { vi.advanceTimersByTime(REST.restMs - 1); });
    expect(api.targetId).toBeNull();
    act(() => { vi.advanceTimersByTime(2); });
    expect(api.targetId).toBe('a');
  });

  it('a pointer that keeps moving more than 3 px never rests', () => {
    mount();
    const over = markNode('a');
    for (let i = 0; i < 10; i += 1) {
      move(100 + i * 5, 100, over);
      act(() => { vi.advanceTimersByTime(200); });
    }
    expect(api.targetId).toBeNull();
  });

  it('leaving the highlight cancels the rest', () => {
    mount();
    move(100, 100, markNode('a'));
    act(() => { vi.advanceTimersByTime(300); });
    move(100, 100, null);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(api.targetId).toBeNull();
  });

  it('leaving the page cancels the rest', () => {
    mount();
    move(100, 100, markNode('a'));
    act(() => api.onPointerLeave());
    act(() => { vi.advanceTimersByTime(1000); });
    expect(api.targetId).toBeNull();
  });

  it('a finger never rests, and a held button is a stroke, not a rest', () => {
    mount();
    move(100, 100, markNode('a'), { pointerType: 'touch' });
    move(100, 100, markNode('b'), { buttons: 1 });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(api.targetId).toBeNull();
  });

  it('the end of a stroke blocks rest until the pointer is 12 px away', () => {
    mount();
    const over = markNode('a');
    move(100, 100, over);
    act(() => api.strokeEnd());
    move(105, 100, over);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(api.targetId).toBeNull();
    move(120, 100, over);
    act(() => { vi.advanceTimersByTime(REST.restMs + 1); });
    expect(api.targetId).toBe('a');
  });

  it('while open it ignores moves, and after close it can rest again', () => {
    mount();
    const over = markNode('a');
    move(100, 100, over);
    act(() => { vi.advanceTimersByTime(REST.restMs + 1); });
    move(300, 300, markNode('b'));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(api.targetId).toBe('a');
    act(() => api.close());
    expect(api.targetId).toBeNull();
    move(300, 300, markNode('b'));
    act(() => { vi.advanceTimersByTime(REST.restMs + 1); });
    expect(api.targetId).toBe('b');
  });

  it('a tap opens a highlight at once', () => {
    mount();
    act(() => api.openFor('a'));
    expect(api.targetId).toBe('a');
  });
});

describe('useRestToolbar hint', () => {
  const ink = { x: 40, bottom: 12, rtl: false };

  it('shows after the first mark, once, for four seconds', () => {
    mount();
    act(() => api.showHint(ink));
    expect(api.hint).toEqual(ink);
    expect(localStorage.getItem(HINT_KEY)).toBe('1');
    act(() => { vi.advanceTimersByTime(HINT_MS - 1); });
    expect(api.hint).not.toBeNull();
    act(() => { vi.advanceTimersByTime(2); });
    expect(api.hint).toBeNull();
  });

  it('stays away once it has been seen', () => {
    localStorage.setItem(HINT_KEY, '1');
    mount();
    act(() => api.showHint(ink));
    expect(api.hint).toBeNull();
  });

  it('a new stroke takes it away', () => {
    mount();
    act(() => api.showHint(ink));
    act(() => api.clearHint());
    expect(api.hint).toBeNull();
  });
});
