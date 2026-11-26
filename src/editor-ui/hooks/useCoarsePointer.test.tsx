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

const pointer = (coarse: boolean) => setScreen(coarse ? COARSE : FINE);

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
    vi.unstubAllGlobals();
  });

  it('reports the query the browser actually matches', () => {
    pointer(true);
    const { apiRef } = mount();
    expect(apiRef.current.coarse).toBe(true);
  });

  it('asks for pointer coarseness, not a width breakpoint', () => {
    // The bug this hook answers is the iOS keyboard moving the visual viewport,
    // which a phone in landscape has too - and landscape is wider than any
    // phone breakpoint in the stylesheets. A wide screen with a coarse pointer
    // is that phone, and a narrow one with a fine pointer is not.
    setScreen({ width: 1200, pointer: 'coarse', hover: 'none' });
    const wide = mount();
    expect(wide.apiRef.current.coarse).toBe(true);
    wide.unmount();
    setScreen({ width: 320, ...FINE });
    expect(mount().apiRef.current.coarse).toBe(false);
  });

  it('follows the pointer type changing under it', () => {
    pointer(false);
    const { apiRef } = mount();
    expect(apiRef.current.coarse).toBe(false);
    act(() => pointer(true));
    expect(apiRef.current.coarse).toBe(true);
    act(() => pointer(false));
    expect(apiRef.current.coarse).toBe(false);
  });

  it('unsubscribes on unmount', () => {
    // Spies through: the real matchMedia answers, and the lists it hands out are kept to see what the hook leaves on them.
    const asked = vi.spyOn(window, 'matchMedia');
    pointer(true);
    const { apiRef, unmount } = mount();
    const list = asked.mock.results.at(-1)!.value as MediaQueryList;
    const removed = vi.spyOn(list, 'removeEventListener');
    unmount();
    expect(removed).toHaveBeenCalledWith('change', expect.any(Function));
    act(() => pointer(false));
    expect(apiRef.current.coarse).toBe(true);
  });

  it('uses the deprecated listener API when that is all the browser has', () => {
    pointer(false);
    const realMatchMedia = window.matchMedia;
    const added = vi.fn();
    const removed = vi.fn();
    // Forced: an old Safari's MediaQueryList has no addEventListener, and no test browser can be put in that state.
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      const list = realMatchMedia(query);
      const events = EventTarget.prototype;
      return Object.assign(list, {
        addEventListener: undefined,
        addListener: (fn: EventListener) => { added(); events.addEventListener.call(list, 'change', fn); },
        removeListener: (fn: EventListener) => { removed(); events.removeEventListener.call(list, 'change', fn); },
      });
    });
    const { apiRef, unmount } = mount();
    expect(added).toHaveBeenCalledTimes(1);
    act(() => pointer(true));
    expect(apiRef.current.coarse).toBe(true);
    unmount();
    expect(removed).toHaveBeenCalledTimes(1);
    act(() => pointer(false));
    expect(apiRef.current.coarse).toBe(true);
  });

  it('stays false where there is no matchMedia at all, rather than throwing', () => {
    // Forced: matchMedia absent is the state under test.
    vi.stubGlobal('matchMedia', undefined);
    const { apiRef } = mount();
    expect(apiRef.current.coarse).toBe(false);
  });

  it('is right on the very first render, with no flip after the effect', () => {
    pointer(true);
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
