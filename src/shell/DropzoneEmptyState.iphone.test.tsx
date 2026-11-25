// @vitest-environment jsdom
// @vitest-environment-options { "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" }
import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { ComponentProps } from 'preact';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import DropzoneEmptyState from './DropzoneEmptyState.tsx';

// Split from DropzoneEmptyState.test.tsx: the component reads navigator.userAgent, which jsdom takes from the environment options above.
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
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

  it('shows no iOS notice on the first render, regardless of platform', () => {
    mount();
    expect(host().textContent).not.toContain(IOS_HINT_TEXT);
  });

  it('shows the notice after mount on a stubbed iOS navigator', async () => {
    mount();
    await flushMountEffect();
    expect(host().textContent).toContain(IOS_HINT_TEXT);
  });

  it('never shows the notice when the tool has not opted in, even on iOS', async () => {
    mount({ showIosFilesHint: false });
    await flushMountEffect({ showIosFilesHint: false });
    expect(host().textContent).not.toContain(IOS_HINT_TEXT);
  });

  describe('the cloud drive hint names the button on show', () => {
    const hint = () => host().querySelector('[data-cloud-drive-hint]');
    const showHint = async (props: Props) => {
      mount({ showIosFilesHint: false, showCloudDriveHint: true, ...props });
      await flushMountEffect({ showIosFilesHint: false, showCloudDriveHint: true, ...props });
    };

    it("says Scan's own button and offers no PDF how-to for photos", async () => {
      await showHint({ accept: 'image/jpeg,image/png,application/pdf', pickLabel: 'Choose photos' });
      expect(hint().textContent).toContain('Choose photos can open');
      expect(hint().textContent).not.toContain('Choose files');
      expect(hint().querySelector('a')).toBeNull();
    });

    it('offers no PDF how-to on a picker that only takes images', async () => {
      await showHint({ accept: 'image/jpeg,image/png' });
      expect(hint().querySelector('a')).toBeNull();
    });

    it('says Choose file on a one-file PDF tool and keeps the how-to', async () => {
      await showHint({ multiple: false });
      expect(hint().textContent).toContain('Choose file can open');
      expect(hint().querySelector('a').getAttribute('href')).toBe('/how-to-open-a-pdf-from-google-drive/');
    });
  });

});
