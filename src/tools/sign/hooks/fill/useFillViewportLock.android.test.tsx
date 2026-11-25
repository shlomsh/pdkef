// @vitest-environment jsdom
// @vitest-environment-options { "userAgent": "Mozilla/5.0 (Linux; Android 14; Pixel 7)" }
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useFillViewportLock } from './useFillViewportLock.ts';

// Split from useFillViewportLock.test.tsx only for its user agent (Android).
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

  it('leaves the meta alone off iOS, where nothing zooms on focus', () => {
    expect(navigator.userAgent).toContain('Android');
    mount(true);
    expect(metaContent()).toBe(ORIGINAL);
  });
});
