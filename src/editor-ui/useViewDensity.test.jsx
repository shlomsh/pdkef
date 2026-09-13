import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import useViewDensity from './useViewDensity.js';

// No @testing-library/preact-hooks in this repo - see useObjectUrls.test.jsx
// for the same tiny-harness pattern used for hook tests elsewhere.
function Harness({ apiRef }) {
  apiRef.current = useViewDensity();
  return null;
}

const STORAGE_KEY = 'pdf-toolkit:view-density';

describe('useViewDensity', () => {
  let container;
  let apiRef;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-view-density');
    document.documentElement.removeAttribute('data-draft-hint');
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: null };
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    document.documentElement.removeAttribute('data-view-density');
    document.documentElement.removeAttribute('data-draft-hint');
  });

  it('defaults to condensed when nothing is stored', () => {
    act(() => {
      render(<Harness apiRef={apiRef} />, container);
    });
    expect(apiRef.current[0]).toBe('condensed');
    expect(document.documentElement.getAttribute('data-view-density')).toBe('condensed');
  });

  it('reads an already-stored value on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'relaxed');
    act(() => {
      render(<Harness apiRef={apiRef} />, container);
    });
    expect(apiRef.current[0]).toBe('relaxed');
  });

  it('a written value round-trips through localStorage and the html attribute', () => {
    act(() => {
      render(<Harness apiRef={apiRef} />, container);
    });

    act(() => apiRef.current[1]('relaxed'));
    expect(apiRef.current[0]).toBe('relaxed');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('relaxed');
    expect(document.documentElement.getAttribute('data-view-density')).toBe('relaxed');

    act(() => apiRef.current[1]('condensed'));
    expect(apiRef.current[0]).toBe('condensed');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('condensed');
    expect(document.documentElement.getAttribute('data-view-density')).toBe('condensed');
  });

  it('a throwing localStorage does not break the hook', () => {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    Storage.prototype.setItem = () => { throw new Error('blocked'); };

    try {
      act(() => {
        render(<Harness apiRef={apiRef} />, container);
      });
      expect(apiRef.current[0]).toBe('condensed');

      act(() => apiRef.current[1]('relaxed'));
      expect(apiRef.current[0]).toBe('relaxed');
      expect(document.documentElement.getAttribute('data-view-density')).toBe('relaxed');
    } finally {
      Storage.prototype.getItem = originalGetItem;
      Storage.prototype.setItem = originalSetItem;
    }
  });

  it('ignores a garbage stored value and falls back to the default', () => {
    localStorage.setItem(STORAGE_KEY, 'huge');
    act(() => {
      render(<Harness apiRef={apiRef} />, container);
    });
    expect(apiRef.current[0]).toBe('condensed');
  });

  // Regression: ToolPageLayout.astro's pre-paint script sets a static
  // `data-draft-hint` attribute for CLS avoidance before hydration, and
  // ToolHero.astro's collapse CSS treats it as its own trigger, independent
  // of `data-view-density`. Switching to Relaxed at runtime must retire that
  // stale hint too, or the hero stays collapsed and the click looks like a
  // no-op - see ToolHero.astro's comment on the two gates.
  it('switching away from condensed clears a stale draft-hint attribute', () => {
    document.documentElement.setAttribute('data-draft-hint', '1');
    act(() => {
      render(<Harness apiRef={apiRef} />, container);
    });
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(true);

    act(() => apiRef.current[1]('relaxed'));
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
  });

  it('does not touch draft-hint while density stays condensed', () => {
    document.documentElement.setAttribute('data-draft-hint', '1');
    act(() => {
      render(<Harness apiRef={apiRef} />, container);
    });

    act(() => apiRef.current[1]('condensed'));
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(true);
  });
});
