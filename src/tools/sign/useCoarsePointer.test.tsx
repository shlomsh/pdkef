import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import useCoarsePointer from './useCoarsePointer.js';

// No @testing-library/preact-hooks in this repo - see useCurrentPage.test.jsx
// for the same tiny-harness pattern used for hook tests elsewhere.
function Harness({ apiRef }: { apiRef: { current: { coarse: boolean } } }) {
  apiRef.current = { coarse: useCoarsePointer() };
  return null;
}

type Listener = (event: { matches: boolean }) => void;

/**
 * A controllable MediaQueryList. `modern` picks which listener API it exposes,
 * because the hook has to work on a Safari old enough to have only addListener.
 */
function installMatchMedia({ matches = false, modern = true } = {}) {
  const listeners: Listener[] = [];
  const query = {
    matches,
    media: '(pointer: coarse)',
    ...(modern
      ? {
          addEventListener: (_: string, fn: Listener) => listeners.push(fn),
          removeEventListener: (_: string, fn: Listener) => {
            const at = listeners.indexOf(fn);
            if (at >= 0) listeners.splice(at, 1);
          },
        }
      : {
          addListener: (fn: Listener) => listeners.push(fn),
          removeListener: (fn: Listener) => {
            const at = listeners.indexOf(fn);
            if (at >= 0) listeners.splice(at, 1);
          },
        }),
  };
  const matchMedia = vi.fn(() => query);
  Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true, writable: true });
  return {
    matchMedia,
    listenerCount: () => listeners.length,
    emit: (next: boolean) => {
      query.matches = next;
      listeners.forEach((fn) => fn({ matches: next }));
    },
  };
}

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const apiRef = { current: { coarse: false } };
  act(() => {
    render(<Harness apiRef={apiRef} />, host);
  });
  return { host, apiRef, unmount: () => act(() => render(null, host)) };
}

describe('useCoarsePointer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('reports the query the browser actually matches', () => {
    installMatchMedia({ matches: true });
    const { apiRef } = mount();
    expect(apiRef.current.coarse).toBe(true);
  });

  it('asks for pointer coarseness, not a width breakpoint', () => {
    // The bug this hook answers is the iOS keyboard moving the visual viewport,
    // which a phone in landscape has too - and landscape is wider than any
    // phone breakpoint in the stylesheets.
    const media = installMatchMedia();
    mount();
    expect(media.matchMedia).toHaveBeenCalledWith('(pointer: coarse)');
  });

  it('follows the pointer type changing under it', () => {
    const media = installMatchMedia({ matches: false });
    const { apiRef } = mount();
    expect(apiRef.current.coarse).toBe(false);
    act(() => media.emit(true));
    expect(apiRef.current.coarse).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const media = installMatchMedia({ matches: true });
    const { unmount } = mount();
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it('uses the deprecated listener API when that is all the browser has', () => {
    const media = installMatchMedia({ matches: false, modern: false });
    const { apiRef, unmount } = mount();
    expect(media.listenerCount()).toBe(1);
    act(() => media.emit(true));
    expect(apiRef.current.coarse).toBe(true);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it('stays false where there is no matchMedia at all, rather than throwing', () => {
    Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true, writable: true });
    const { apiRef } = mount();
    expect(apiRef.current.coarse).toBe(false);
  });
});
