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

describe('useFillMode - an open free slot and a page turn (SIGN-43)', () => {
  it('closes the open free slot when that page\'s turns change', () => {
    let fill: ReturnType<typeof useFillMode> | null = null;
    function TurnHarness({ turns }: { turns: Record<number, 1 | 2 | 3> }) {
      fill = useFillMode(vi.fn(), [], turns);
      return null;
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    window.history.replaceState(null, '', '/sign/?next=1');
    act(() => { render(<TurnHarness turns={{}} />, host); });
    act(() => { fill!.fillContextValue.openFreeSlot({ pageIndex: 1, x: 10, y: 10 }); });
    expect(fill!.fillContextValue.freeAt).not.toBeNull();
    act(() => { render(<TurnHarness turns={{ 0: 1 }} />, host); });
    expect(fill!.fillContextValue.freeAt).not.toBeNull(); // another page turned: slot stays
    act(() => { render(<TurnHarness turns={{ 0: 1, 1: 1 }} />, host); });
    expect(fill!.fillContextValue.freeAt).toBeNull();
    act(() => render(null, host));
    host.remove();
  });
});
