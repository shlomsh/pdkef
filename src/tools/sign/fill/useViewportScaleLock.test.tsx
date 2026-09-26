import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useViewportScaleLock } from './useViewportScaleLock.ts';

// No @testing-library/preact in this repo - see useCoarsePointer.test.tsx for
// the same tiny-harness pattern used for hook tests elsewhere.
function Harness({ enabled }: { enabled: boolean }) {
  useViewportScaleLock(enabled);
  return null;
}

function setViewportMeta(content: string) {
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'viewport');
  meta.setAttribute('content', content);
  document.head.appendChild(meta);
  return meta;
}

const ORIGINAL = 'width=device-width, initial-scale=1, viewport-fit=cover';

describe('useViewportScaleLock', () => {
  let meta: HTMLMetaElement;
  let container: HTMLDivElement;

  beforeEach(() => {
    meta = setViewportMeta(ORIGINAL);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      render(null, container);
    });
    container.remove();
    meta.remove();
  });

  it('locks the viewport content when enabled', () => {
    act(() => {
      render(<Harness enabled={true} />, container);
    });
    expect(meta.getAttribute('content')).toBe(
      'width=device-width, initial-scale=1, viewport-fit=cover, minimum-scale=1, maximum-scale=1'
    );
  });

  it('restores the exact original content on unmount', () => {
    act(() => {
      render(<Harness enabled={true} />, container);
    });
    act(() => {
      render(null, container);
    });
    expect(meta.getAttribute('content')).toBe(ORIGINAL);
  });

  it('restores the exact original content when disabled after being enabled', () => {
    act(() => {
      render(<Harness enabled={true} />, container);
    });
    act(() => {
      render(<Harness enabled={false} />, container);
    });
    expect(meta.getAttribute('content')).toBe(ORIGINAL);
  });

  it('does nothing when enabled is false', () => {
    act(() => {
      render(<Harness enabled={false} />, container);
    });
    expect(meta.getAttribute('content')).toBe(ORIGINAL);
  });

  it('is a no-op when the viewport meta is missing', () => {
    meta.remove();
    expect(() => {
      act(() => {
        render(<Harness enabled={true} />, container);
      });
    }).not.toThrow();
  });
});
