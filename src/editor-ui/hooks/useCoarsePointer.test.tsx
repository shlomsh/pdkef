import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { setScreen } from '../../test/support/screen.ts';
import useCoarsePointer from './useCoarsePointer.ts';

// No @testing-library/preact-hooks in this repo - see useCurrentPage.test.jsx
// for the same tiny-harness pattern used for hook tests elsewhere.
function Harness({ apiRef }: { apiRef: { current: { coarse: boolean } } }) {
  apiRef.current = { coarse: useCoarsePointer() };
  return null;
}

const COARSE = { pointer: 'coarse', hover: 'none' } as const;
const FINE = { pointer: 'fine', hover: 'hover' } as const;

/**
 * The screen's pointer, on a real matchMedia. `modern: false` removes addEventListener from the
 * lists, because the hook has to work on a Safari old enough to have only addListener.
 */
function installScreen({ coarse = false, modern = true } = {}) {
  setScreen(coarse ? COARSE : FINE);
  const live = new Set<EventListenerOrEventListenerObject>();
  const real = window.matchMedia;
  const subscribe = (list: MediaQueryList, fn: EventListenerOrEventListenerObject, type = 'change') => { live.add(fn); EventTarget.prototype.addEventListener.call(list, type, fn); };
  const unsubscribe = (list: MediaQueryList, fn: EventListenerOrEventListenerObject, type = 'change') => { live.delete(fn); EventTarget.prototype.removeEventListener.call(list, type, fn); };
  const matchMedia = vi.fn((query: string) => {
    const list = real(query);
    // Counts the listeners the hook leaves on the list, through whichever API it used.
    list.addListener = (fn) => subscribe(list, fn as EventListenerOrEventListenerObject);
    list.removeListener = (fn) => unsubscribe(list, fn as EventListenerOrEventListenerObject);
    if (modern) {
      list.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject) => subscribe(list, fn, type)) as typeof list.addEventListener;
      list.removeEventListener = ((type: string, fn: EventListenerOrEventListenerObject) => unsubscribe(list, fn, type)) as typeof list.removeEventListener;
    } else {
      // Forced: an old Safari's MediaQueryList has no addEventListener, and no test browser can be put in that state.
      Object.defineProperty(list, 'addEventListener', { value: undefined });
    }
    return list;
  });
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
  return {
    matchMedia,
    listenerCount: () => live.size,
    emit: (next: boolean) => setScreen(next ? COARSE : FINE),
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
  const installed = window.matchMedia;
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    window.matchMedia = installed;
  });

  it('reports the query the browser actually matches', () => {
    installScreen({ coarse: true });
    const { apiRef } = mount();
    expect(apiRef.current.coarse).toBe(true);
  });

  it('asks for pointer coarseness, not a width breakpoint', () => {
    // The bug this hook answers is the iOS keyboard moving the visual viewport,
    // which a phone in landscape has too - and landscape is wider than any
    // phone breakpoint in the stylesheets.
    const media = installScreen();
    mount();
    expect(media.matchMedia).toHaveBeenCalledWith('(pointer: coarse)');
  });

  it('follows the pointer type changing under it', () => {
    const media = installScreen();
    const { apiRef } = mount();
    expect(apiRef.current.coarse).toBe(false);
    act(() => media.emit(true));
    expect(apiRef.current.coarse).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const media = installScreen({ coarse: true });
    const { unmount } = mount();
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it('uses the deprecated listener API when that is all the browser has', () => {
    const media = installScreen({ modern: false });
    const { apiRef, unmount } = mount();
    expect(media.listenerCount()).toBe(1);
    act(() => media.emit(true));
    expect(apiRef.current.coarse).toBe(true);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it('stays false where there is no matchMedia at all, rather than throwing', () => {
    // Forced: matchMedia absent is the state under test.
    Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true, writable: true });
    const { apiRef } = mount();
    expect(apiRef.current.coarse).toBe(false);
  });

  it('is right on the very first render, with no flip after the effect', () => {
    installScreen({ coarse: true });
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useCoarsePointer());
      return null;
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<Probe />, host));
    expect(seen[0]).toBe(true);
    act(() => render(null, host));
  });
});
