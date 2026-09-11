// @ts-nocheck - mirrors FileDropzone.test.tsx's own untyped-test convention.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import DropzoneEmptyState from './DropzoneEmptyState.tsx';

const IPHONE_NAVIGATOR = {
  platform: 'iPhone',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  maxTouchPoints: 5,
};

const ANDROID_NAVIGATOR = {
  platform: 'Linux armv8l',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  maxTouchPoints: 5,
};

const DESKTOP_NAVIGATOR = {
  platform: 'MacIntel',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  maxTouchPoints: 0,
};

const IOS_HINT_TEXT = 'On iPhone or iPad, share the PDF to Files';

describe('DropzoneEmptyState', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.unstubAllGlobals();
  });

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    // Deliberately not wrapped in act(): act flushes effects, and the
    // hydration-match guarantee is specifically about the render that
    // happens before they run - see FileDropzone.tsx's `recents` comment,
    // which this component follows for the same reason (no `navigator` on
    // the server, so the first client render must agree with it).
    render(<DropzoneEmptyState onFiles={() => {}} showIosFilesHint {...props} />, container);
  }

  async function flushMountEffect(props = {}) {
    await act(async () => {
      render(<DropzoneEmptyState onFiles={() => {}} showIosFilesHint {...props} />, container);
    });
  }

  it('shows no iOS notice on the first render, regardless of platform', () => {
    vi.stubGlobal('navigator', IPHONE_NAVIGATOR);
    mount();
    expect(container.textContent).not.toContain(IOS_HINT_TEXT);
  });

  it('shows the notice after mount on a stubbed iOS navigator', async () => {
    vi.stubGlobal('navigator', IPHONE_NAVIGATOR);
    mount();
    await flushMountEffect();
    expect(container.textContent).toContain(IOS_HINT_TEXT);
  });

  it('never shows the notice on a stubbed Android navigator', async () => {
    vi.stubGlobal('navigator', ANDROID_NAVIGATOR);
    mount();
    await flushMountEffect();
    expect(container.textContent).not.toContain(IOS_HINT_TEXT);
  });

  it('never shows the notice on a stubbed desktop navigator', async () => {
    vi.stubGlobal('navigator', DESKTOP_NAVIGATOR);
    mount();
    await flushMountEffect();
    expect(container.textContent).not.toContain(IOS_HINT_TEXT);
  });

  it('never shows the notice when the tool has not opted in, even on iOS', async () => {
    vi.stubGlobal('navigator', IPHONE_NAVIGATOR);
    mount({ showIosFilesHint: false });
    await flushMountEffect({ showIosFilesHint: false });
    expect(container.textContent).not.toContain(IOS_HINT_TEXT);
  });
});
