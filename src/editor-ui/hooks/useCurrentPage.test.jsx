import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import useCurrentPage from './useCurrentPage.js';

// No @testing-library/preact-hooks in this repo - see useObjectUrls.test.jsx
// for the same tiny-harness pattern used for hook tests elsewhere.
function Harness({ apiRef, active, numPages }) {
  const rootRef = useRef(document.createElement('div'));
  const pageRefs = useRef([]);
  apiRef.current = {
    result: useCurrentPage({ active, rootRef, pageRefs, numPages }),
    rootRef,
    pageRefs,
  };
  return null;
}

// A controllable stand-in for the real thing (jsdom has no layout, so the
// global stub in test/setup.js is an inert no-op). Captures every instance so
// a test can fire its callback with hand-picked intersectionRatio entries.
class FakeIntersectionObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    this.observed = [];
    FakeIntersectionObserver.instances.push(this);
  }

  observe(el) {
    this.observed.push(el);
  }

  disconnect() {
    this.observed = [];
  }

  fire(entries) {
    this.callback(entries);
  }
}

describe('useCurrentPage', () => {
  let container;
  let apiRef;
  let originalIO;

  beforeEach(() => {
    originalIO = globalThis.IntersectionObserver;
    FakeIntersectionObserver.instances = [];
    globalThis.IntersectionObserver = FakeIntersectionObserver;
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: null };
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    globalThis.IntersectionObserver = originalIO;
  });

  it('defaults to page 1 when inactive', () => {
    act(() => {
      render(<Harness apiRef={apiRef} active={false} numPages={3} />, container);
    });
    expect(apiRef.current.result).toBe(1);
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it('defaults to page 1 and skips observing for a single-page document', () => {
    act(() => {
      render(<Harness apiRef={apiRef} active={true} numPages={1} />, container);
    });
    expect(apiRef.current.result).toBe(1);
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it('reports the page with the highest intersection ratio', () => {
    act(() => {
      render(<Harness apiRef={apiRef} active={true} numPages={3} />, container);
      apiRef.current.pageRefs.current = [
        document.createElement('div'),
        document.createElement('div'),
        document.createElement('div'),
      ];
    });
    act(() => {
      render(<Harness apiRef={apiRef} active={true} numPages={3} />, container);
    });

    const observer = FakeIntersectionObserver.instances.at(-1);
    const pages = apiRef.current.pageRefs.current;

    act(() => {
      observer.fire([
        { target: pages[0], intersectionRatio: 0.1 },
        { target: pages[1], intersectionRatio: 0.9 },
        { target: pages[2], intersectionRatio: 0 },
      ]);
    });
    expect(apiRef.current.result).toBe(2);

    act(() => {
      observer.fire([{ target: pages[2], intersectionRatio: 1 }]);
    });
    expect(apiRef.current.result).toBe(3);
  });

  it('resets to page 1 and disconnects when it goes inactive', () => {
    act(() => {
      render(<Harness apiRef={apiRef} active={true} numPages={2} />, container);
      apiRef.current.pageRefs.current = [document.createElement('div'), document.createElement('div')];
    });
    act(() => {
      render(<Harness apiRef={apiRef} active={true} numPages={2} />, container);
    });

    const observer = FakeIntersectionObserver.instances.at(-1);
    const disconnectSpy = vi.spyOn(observer, 'disconnect');
    act(() => {
      observer.fire([{ target: apiRef.current.pageRefs.current[1], intersectionRatio: 1 }]);
    });
    expect(apiRef.current.result).toBe(2);

    act(() => {
      render(<Harness apiRef={apiRef} active={false} numPages={2} />, container);
    });
    expect(apiRef.current.result).toBe(1);
    expect(disconnectSpy).toHaveBeenCalled();
  });
});
