// @vitest-environment jsdom
// @vitest-environment-options { "userAgent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36" }
import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { ComponentProps } from 'preact';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import DropzoneEmptyState from './DropzoneEmptyState.tsx';

// Split from DropzoneEmptyState.test.tsx: the component reads navigator.userAgent, which jsdom takes from the environment options above.
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
type Props = Partial<ComponentProps<typeof DropzoneEmptyState>>;

const IOS_HINT_TEXT = 'On iPhone or iPad, share the PDF to Files';

describe('DropzoneEmptyState', () => {
  let mounted: HTMLDivElement | null = null;
  const host = () => mounted as HTMLDivElement;

  beforeEach(() => {
    // Live control: the page really has this user agent.
    expect(navigator.userAgent).toBe(UA);
  });

  afterEach(() => {
    if (mounted) {
      act(() => render(null, mounted as HTMLDivElement));
      mounted.remove();
      mounted = null;
    }
  });

  function mount(props: Props = {}) {
    const container = document.createElement('div');
    mounted = container;
    document.body.appendChild(container);
    // Not wrapped in act(): the first-render guarantee is about the render before effects run.
    render(<DropzoneEmptyState onFiles={() => {}} showIosFilesHint {...props} />, container);
  }

  async function flushMountEffect(props: Props = {}) {
    await act(async () => {
      render(<DropzoneEmptyState onFiles={() => {}} showIosFilesHint {...props} />, host());
    });
  }

  it('never shows the notice on a stubbed Android navigator', async () => {
    mount();
    await flushMountEffect();
    expect(host().textContent).not.toContain(IOS_HINT_TEXT);
  });
});
