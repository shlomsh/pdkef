// @vitest-environment jsdom
// @vitest-environment-options { "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useFillViewportLock } from './useFillViewportLock.ts';

// QUAL-44: this used to be a Playwright case (fill-mode-zoom.spec.js, "the old
// editor never gets maximum-scale"). The old editor is `enabled === false`
// (`isFillMode('?next=0')`), and what that must guarantee is that the hook
// leaves the viewport meta exactly as the page shipped it.
const ORIGINAL = 'width=device-width, initial-scale=1';

function Harness({ enabled }: { enabled: boolean }) {
  useFillViewportLock(enabled);
  return null;
}

describe('useFillViewportLock', () => {
  let meta: HTMLMetaElement;
  let host: HTMLDivElement;

  const mount = (enabled: boolean) => act(() => { render(<Harness enabled={enabled} />, host); });
  const metaContent = () => meta.getAttribute('content');

  beforeEach(() => {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = ORIGINAL;
    document.head.appendChild(meta);
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    act(() => render(null, host));
    host.remove();
    meta.remove();
  });

  it('clamps zoom-on-focus at rest when enabled on an iPhone, and gives the meta back on unmount', () => {
    mount(true);
    expect(metaContent()).toBe(`${ORIGINAL}, maximum-scale=1`);

    act(() => render(null, host));
    expect(metaContent()).toBe(ORIGINAL);
  });

  it('never touches the meta in the old editor (?next=0), even with a field being typed in', () => {
    mount(false);
    const field = document.createElement('textarea');
    document.body.appendChild(field);
    act(() => {
      field.focus();
      field.value = 'typed';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(metaContent()).toBe(ORIGINAL);
    field.remove();
  });
});
