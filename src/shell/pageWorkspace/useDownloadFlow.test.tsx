import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decideDownloadState, useDownloadFlow, type DownloadFlowInput } from './useDownloadFlow.ts';

const share = vi.hoisted(() => ({ download: vi.fn(), prepare: vi.fn(), clearPrepared: vi.fn() }));
vi.mock('../../lib/usePdfShare.js', () => ({
  usePdfShare: () => ({ shareReady: false, sharePrepared: vi.fn(), ...share }),
}));

type Prepared = DownloadFlowInput['prepared'];
const blob = new Blob(['x'], { type: 'application/pdf' });
const ready = (generation = 1): Prepared => ({ status: 'ready', blob, url: 'blob:x', generation, prepareNow: vi.fn() });
const pending = (): Prepared => ({ status: 'pending', blob: null, url: null, generation: 0, prepareNow: vi.fn() });

describe('decideDownloadState', () => {
  it('lets a blocked tool win over everything else', () => {
    expect(decideDownloadState('one-file', 'ready', true, false)).toBe('one-file');
    expect(decideDownloadState('error', 'ready', false, false)).toBe('error');
  });
  it('keeps the ready look while a build waits, and prepares only for a tap that beat it', () => {
    expect(decideDownloadState(null, 'pending', false, false)).toBe('ready');
    expect(decideDownloadState(null, 'pending', false, true)).toBe('preparing');
    expect(decideDownloadState(null, 'idle', false, false)).toBe('preparing');
  });
  it('is saved only once a ready output was delivered', () => {
    expect(decideDownloadState(null, 'ready', false, false)).toBe('ready');
    expect(decideDownloadState(null, 'ready', true, false)).toBe('saved');
  });
});

describe('useDownloadFlow', () => {
  let container: HTMLElement;
  let flow: ReturnType<typeof useDownloadFlow>;
  let wide: boolean;
  const announce = vi.fn();
  const onDelivered = vi.fn();
  const base = (prepared: Prepared, blocked: DownloadFlowInput['blocked'] = null): DownloadFlowInput => ({
    prepared,
    fileName: 'out.pdf',
    hrefs: { compress: '/compress/', sign: '/sign/' },
    blocked,
    announce,
    messages: { ready: 'Ready', shared: 'Shared', canceled: 'Canceled', shareError: 'Failed' },
    onDelivered,
  });
  function Probe(props: DownloadFlowInput) {
    flow = useDownloadFlow(props);
    return null;
  }
  const mount = (input: DownloadFlowInput) => act(() => render(<Probe {...input} />, container));

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    wide = false;
    window.matchMedia = ((query: string) => ({
      matches: !wide && query.includes('max-width'),
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    vi.clearAllMocks();
  });
  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it('a tap on a ready output saves it and reports done', () => {
    mount(base(ready()));
    expect(flow.downloadState).toBe('ready');
    act(() => flow.onDownloadTap());
    expect(flow.downloadState).toBe('saved');
    expect(flow.tap).toBe('done');
    expect(onDelivered).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Ready');
  });

  it('a tap that beats the build prepares, then delivers when the blob is ready', () => {
    const waiting = pending();
    mount(base(waiting));
    act(() => flow.onRowPreparingTap());
    expect(waiting.prepareNow).toHaveBeenCalled();
    expect(flow.downloadState).toBe('preparing');
    expect(share.download).not.toHaveBeenCalled();
    mount(base(ready()));
    expect(share.download).toHaveBeenCalledWith(blob, 'out.pdf');
    expect(flow.downloadState).toBe('saved');
    expect(flow.tap).toBe('done');
    expect(flow.showStrip).toBe(false);
  });

  it('opens the strip only for the quiet Download tap on a phone width', () => {
    mount(base(pending()));
    act(() => flow.onQuietPreparingTap());
    mount(base(ready()));
    expect(flow.showStrip).toBe(true);

    wide = true;
    mount(base(pending()));
    act(() => flow.reset());
    act(() => flow.onQuietPreparingTap());
    mount(base(ready(2)));
    expect(flow.showStrip).toBe(false);
  });

  it('closes the strip when anything changes after saved', () => {
    mount(base(ready()));
    act(() => flow.onQuietDownloadTap());
    expect(flow.showStrip).toBe(true);
    mount(base(ready(), 'error'));
    mount(base(ready()));
    expect(flow.showStrip).toBe(false);
  });

  it('lets blocked win and reset clear the flow', () => {
    mount(base(ready(), 'one-file'));
    expect(flow.downloadState).toBe('one-file');
    expect(flow.downloadLinkReady).toBe(false);
    mount(base(ready()));
    act(() => flow.onQuietDownloadTap());
    expect(flow.showStrip).toBe(true);
    act(() => flow.reset());
    expect(flow.tap).toBe('idle');
    expect(flow.downloadedOnce).toBe(false);
    expect(flow.showStrip).toBe(false);
    expect(share.clearPrepared).toHaveBeenCalled();
  });
});
