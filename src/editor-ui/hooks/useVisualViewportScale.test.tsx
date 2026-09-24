import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import useVisualViewportScale from './useVisualViewportScale.js';

// No @testing-library/preact-hooks in this repo - see useCurrentPage.test.jsx
// for the same tiny-harness pattern used for hook tests elsewhere.
function Harness() {
  useVisualViewportScale();
  return null;
}

type Listener = () => void;

/** A controllable stand-in for `window.visualViewport`. */
function installVisualViewport({ scale = 1 }: { scale?: number } = {}) {
  const listeners: Record<'resize' | 'scroll', Listener[]> = { resize: [], scroll: [] };
  const vv = {
    scale,
    addEventListener: vi.fn((type: 'resize' | 'scroll', fn: Listener) => {
      listeners[type].push(fn);
    }),
    removeEventListener: vi.fn((type: 'resize' | 'scroll', fn: Listener) => {
      const at = listeners[type].indexOf(fn);
      if (at >= 0) listeners[type].splice(at, 1);
    }),
  };
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });
  return {
    vv,
    listenerCount: (type: 'resize' | 'scroll') => listeners[type].length,
    emit: (type: 'resize' | 'scroll', nextScale?: number) => {
      if (nextScale !== undefined) vv.scale = nextScale;
      listeners[type].slice().forEach((fn) => fn());
    },
  };
}

function removeVisualViewport() {
  Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true, writable: true });
}

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    render(<Harness />, host);
  });
  return { host, unmount: () => act(() => render(null, host)) };
}

function mountTwo() {
  const hostA = document.createElement('div');
  const hostB = document.createElement('div');
  document.body.appendChild(hostA);
  document.body.appendChild(hostB);
  act(() => {
    render(<Harness />, hostA);
    render(<Harness />, hostB);
  });
  return {
    unmountA: () => act(() => render(null, hostA)),
    unmountB: () => act(() => render(null, hostB)),
  };
}

describe('useVisualViewportScale', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.style.removeProperty('--vv-scale');
    vi.restoreAllMocks();
  });

  it('writes --vv-scale from the current visualViewport.scale on mount', () => {
    installVisualViewport({ scale: 1.8 });
    const { unmount } = mount();
    expect(document.documentElement.style.getPropertyValue('--vv-scale')).toBe('1.8');
    unmount();
  });

  it('updates --vv-scale when visualViewport fires resize (pinch or auto-zoom)', () => {
    const viewport = installVisualViewport({ scale: 1 });
    const { unmount } = mount();
    expect(document.documentElement.style.getPropertyValue('--vv-scale')).toBe('1');

    act(() => viewport.emit('resize', 2.53));
    expect(document.documentElement.style.getPropertyValue('--vv-scale')).toBe('2.53');
    unmount();
  });

  it('updates --vv-scale on scroll too (panning a zoomed page)', () => {
    const viewport = installVisualViewport({ scale: 2 });
    const { unmount } = mount();
    act(() => viewport.emit('scroll'));
    expect(document.documentElement.style.getPropertyValue('--vv-scale')).toBe('2');
    unmount();
  });

  it('does nothing, and never throws, where there is no visualViewport at all', () => {
    removeVisualViewport();
    document.documentElement.style.removeProperty('--vv-scale');
    const { unmount } = mount();
    expect(document.documentElement.style.getPropertyValue('--vv-scale')).toBe('');
    unmount();
  });

  it('ref-counts: one visualViewport listener for two mounted consumers, not two', () => {
    const viewport = installVisualViewport({ scale: 1 });
    const { unmountA, unmountB } = mountTwo();
    expect(viewport.listenerCount('resize')).toBe(1);
    expect(viewport.listenerCount('scroll')).toBe(1);
    unmountA();
    unmountB();
  });

  it('detaches only when the last consumer unmounts, not the first', () => {
    const viewport = installVisualViewport({ scale: 1 });
    const { unmountA, unmountB } = mountTwo();
    unmountA();
    expect(viewport.listenerCount('resize'), 'still one consumer left').toBe(1);
    unmountB();
    expect(viewport.listenerCount('resize'), 'last consumer gone').toBe(0);
    expect(viewport.listenerCount('scroll')).toBe(0);
  });

  it('reattaches cleanly for a later, unrelated mount after a full detach', () => {
    const first = installVisualViewport({ scale: 1 });
    const { unmount } = mount();
    unmount();
    expect(first.listenerCount('resize')).toBe(0);

    const second = installVisualViewport({ scale: 1.4 });
    const { unmount: unmountSecond } = mount();
    expect(second.listenerCount('resize')).toBe(1);
    expect(document.documentElement.style.getPropertyValue('--vv-scale')).toBe('1.4');
    unmountSecond();
  });
});
