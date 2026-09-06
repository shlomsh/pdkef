import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAutoFontProvisioning } from './useAutoFontProvisioning.js';
import * as fontOfflinePacks from './fontOfflinePacks.js';

// No @testing-library/preact-hooks in this repo - see useObjectUrls.test.jsx.
function Harness({ elements }) {
  useAutoFontProvisioning(elements);
  return null;
}

describe('useAutoFontProvisioning', () => {
  let container;
  const originalOnline = navigator.onLine;

  afterEach(() => {
    vi.restoreAllMocks();
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnline });
  });

  function mount(elements) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<Harness elements={elements} />, container); });
  }

  it('provisions the resolved (rendered) family for a non-default font in use', () => {
    const spy = vi.spyOn(fontOfflinePacks, 'provisionFontPack').mockResolvedValue(true);
    mount([{ type: 'text', text: 'שלומי', fontFamily: 'Caveat' }]);
    expect(spy).toHaveBeenCalledWith('Gveret Levin');
    expect(spy).not.toHaveBeenCalledWith('Caveat');
  });

  it('never provisions the precached default family', () => {
    const spy = vi.spyOn(fontOfflinePacks, 'provisionFontPack').mockResolvedValue(true);
    mount([{ type: 'text', text: 'שלום', fontFamily: 'Arimo' }]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('ignores non-text elements and text elements with no text yet', () => {
    const spy = vi.spyOn(fontOfflinePacks, 'provisionFontPack').mockResolvedValue(true);
    mount([
      { type: 'whiteout' },
      { type: 'text', text: '', fontFamily: 'Caveat' },
    ]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not re-provision the same family on a later render', () => {
    const spy = vi.spyOn(fontOfflinePacks, 'provisionFontPack').mockResolvedValue(true);
    mount([{ type: 'text', text: 'שלומי', fontFamily: 'Caveat' }]);
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => { render(<Harness elements={[{ type: 'text', text: 'שלומי!', fontFamily: 'Caveat' }]} />, container); });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not attempt to provision while offline', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const spy = vi.spyOn(fontOfflinePacks, 'provisionFontPack').mockResolvedValue(true);
    mount([{ type: 'text', text: 'שלומי', fontFamily: 'Caveat' }]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('retries on a later render if the previous attempt failed', async () => {
    const spy = vi.spyOn(fontOfflinePacks, 'provisionFontPack').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(true);
    mount([{ type: 'text', text: 'שלומי', fontFamily: 'Caveat' }]);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    act(() => { render(<Harness elements={[{ type: 'text', text: 'שלומי!', fontFamily: 'Caveat' }]} />, container); });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
