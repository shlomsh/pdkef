import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFillMode } from './useFillMode.ts';

// QUAL-44: useFillViewportLock.test.tsx proves the hook leaves the meta alone
// with `enabled === false`; this proves `?next=0` is what makes it false, all
// the way through useFillMode and useFillDocumentEffects.
const ORIGINAL = 'width=device-width, initial-scale=1';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';

function Harness() {
  useFillMode(vi.fn(), []);
  return null;
}

describe('useFillMode - the viewport lock follows ?next=', () => {
  let meta: HTMLMetaElement;
  let host: HTMLDivElement;
  const originalUrl = window.location.href;

  const mountAt = (search: string) => {
    window.history.replaceState(null, '', `/sign/${search}`);
    act(() => { render(<Harness />, host); });
  };

  beforeEach(() => {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = ORIGINAL;
    document.head.appendChild(meta);
    host = document.createElement('div');
    document.body.appendChild(host);
    Object.defineProperty(navigator, 'userAgent', { value: IPHONE, configurable: true });
  });

  afterEach(() => {
    act(() => render(null, host));
    host.remove();
    meta.remove();
    delete (navigator as { userAgent?: string }).userAgent;
    window.history.replaceState(null, '', originalUrl);
  });

  it('keeps the page\'s viewport meta untouched on an iPhone under ?next=0, the old editor', () => {
    mountAt('?next=0');
    expect(meta.getAttribute('content')).toBe(ORIGINAL);
  });

  it('clamps zoom-on-focus on an iPhone under ?next=1, fill mode', () => {
    mountAt('?next=1');
    expect(meta.getAttribute('content')).toBe(`${ORIGINAL}, maximum-scale=1`);
  });
});
