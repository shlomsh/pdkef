import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DownloadDone, { isDownloadDoneVisible } from './DownloadDone.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('isDownloadDoneVisible', () => {
  const file = {};
  const saved = { name: 'h_a.pdf', file, revision: 3 };
  it('is visible after a successful download', () => expect(isDownloadDoneVisible(saved, file, 3)).toBe(true));
  it('is hidden once closed', () => expect(isDownloadDoneVisible(null, file, 3)).toBe(false));
  it('is hidden after the marks change', () => expect(isDownloadDoneVisible(saved, file, 4)).toBe(false));
  it('is hidden when a different file is opened', () => expect(isDownloadDoneVisible(saved, {}, 3)).toBe(false));
});

describe('DownloadDone', () => {
  it('says the saved name and closes', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const onClose = vi.fn();
    act(() => render(<DownloadDone name="highlighted_a.pdf" onClose={onClose} />, container!));
    const strip = container.querySelector('[data-download-done]')!;
    expect(strip.textContent).toBe('Saved as highlighted_a.pdf.');
    act(() => (strip.querySelector('button') as HTMLButtonElement).click());
    expect(onClose).toHaveBeenCalled();
  });
});
