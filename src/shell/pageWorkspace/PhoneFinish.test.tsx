import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PhoneFinish from './PhoneFinish.tsx';

const labels = { download: 'Download', ready: 'Ready', closeStrip: 'Close', handoffFailed: 'Failed', nothing: 'Every page is skipped' };

describe('PhoneFinish', () => {
  let container: HTMLElement;
  const mount = (downloadState: string, withLabel = true) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const flow = {
      downloadState, downloadLinkReady: false, showStrip: false, handoffBusy: false, handoffFailed: false,
      onQuietDownloadTap: vi.fn(), onQuietPreparingTap: vi.fn(), requestHandoff: vi.fn(), closeStrip: vi.fn(),
    };
    act(() => render(
      <PhoneFinish
        flow={flow as never}
        prepared={{ status: 'idle', url: null, prepareNow: vi.fn() } as never}
        fileName="a.pdf"
        detail=""
        handoffs={[]}
        labels={withLabel ? labels : { ...labels, nothing: undefined }}
      />,
      container,
    ));
    return container;
  };
  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it('says why the disabled Download cannot run, and ties it to the button', () => {
    const c = mount('nothing');
    const note = c.querySelector('[data-quiet-note]');
    expect(note?.textContent).toBe('Every page is skipped');
    const button = c.querySelector('[data-quiet-download]');
    expect(button?.getAttribute('aria-describedby')).toBe(note?.id);
  });

  it('shows no note in any other state, or when the tool gives no wording', () => {
    expect(mount('ready').querySelector('[data-quiet-note]')).toBeNull();
    render(null, container);
    container.remove();
    expect(mount('nothing', false).querySelector('[data-quiet-note]')).toBeNull();
  });
});
