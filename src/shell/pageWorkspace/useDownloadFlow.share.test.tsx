import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recentActions, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
import { useDownloadFlow, type DownloadFlowInput } from './useDownloadFlow.ts';

// The real usePdfShare runs. Only the browser's share sheet is absent in jsdom, so navigator.share is the one forced line.
type Prepared = DownloadFlowInput['prepared'];
const blob = new Blob(['x'], { type: 'application/pdf' });
const ready = (): Prepared => ({ status: 'ready', blob, url: 'blob:x', parts: null, generation: 1, prepareNow: vi.fn() });

describe('useDownloadFlow share outcomes', () => {
  let container: HTMLElement;
  let flow: ReturnType<typeof useDownloadFlow>;
  const announce = vi.fn();
  const base = (messages = { ready: 'Ready', shared: 'Shared', canceled: 'Canceled', shareError: 'Failed' }): DownloadFlowInput => ({
    prepared: ready(), from: 'split', fileName: 'out.pdf', blocked: null, announce, messages, onDelivered: vi.fn(),
  });
  function Probe(props: DownloadFlowInput) {
    flow = useDownloadFlow(props);
    return null;
  }
  const mount = (input: DownloadFlowInput) => act(() => render(<Probe {...input} />, container));
  // Forced: jsdom has no navigator.share.
  const shareSheet = (answer: () => Promise<void>) => Object.defineProperty(navigator, 'share', { configurable: true, value: answer });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    announce.mockClear();
    resetActionTrailForTests();
  });
  afterEach(() => {
    render(null, container);
    container.remove();
    delete (navigator as { share?: unknown }).share;
  });

  it('a completed Share counts as a tap (processing, then done) and records a share; a canceled or failed one does neither', async () => {
    shareSheet(() => Promise.reject(new DOMException('closed', 'AbortError')));
    mount(base());
    expect(flow.shareReady).toBe(true);
    const taps: string[] = [flow.tap];
    await act(async () => { await flow.handleShare(); });
    expect(flow.tap).toBe('idle');
    expect(recentActions()).not.toContain('share');
    shareSheet(() => Promise.reject(new Error('share failed')));
    await act(async () => { await flow.handleShare(); });
    expect(recentActions()).not.toContain('share');
    shareSheet(() => Promise.resolve());
    await act(async () => { await flow.handleShare(); });
    taps.push(flow.tap);
    expect(taps).toEqual(['idle', 'done']);
    expect(recentActions()).toContain('share');
  });

  it('an empty share message is still announced, as before the outcome was extracted', async () => {
    shareSheet(() => Promise.resolve());
    mount(base({ ready: 'Ready', shared: '', canceled: 'Canceled', shareError: 'Failed' }));
    await act(async () => { await flow.handleShare(); });
    expect(announce).toHaveBeenCalledWith('');
  });
});
