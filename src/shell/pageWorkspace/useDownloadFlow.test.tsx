import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recentActions, resetActionTrailForTests } from '../../lib/actionTrail.ts';
import { decideDownloadState, deliverParts, useDownloadFlow, type DownloadFlowInput } from './useDownloadFlow.ts';

const share = vi.hoisted(() => ({ download: vi.fn(), prepare: vi.fn(), prepareFiles: vi.fn(), clearPrepared: vi.fn(), sharePrepared: vi.fn() }));
vi.mock('../../lib/usePdfShare.js', () => ({
  usePdfShare: () => ({ shareReady: false, ...share }),
}));
const store = vi.hoisted(() => ({ saveHandoff: vi.fn() }));
vi.mock('../../lib/drafts/draftStore.ts', () => store);

type Prepared = DownloadFlowInput['prepared'];
const blob = new Blob(['x'], { type: 'application/pdf' });
const ready = (generation = 1): Prepared => ({ status: 'ready', blob, url: 'blob:x', parts: null, generation, prepareNow: vi.fn() });
const pending = (): Prepared => ({ status: 'pending', blob: null, url: null, parts: null, generation: 0, prepareNow: vi.fn() });

const partBlobs = [new Blob(['a']), new Blob(['b']), new Blob(['c'])];
const parts = partBlobs.map((partBlob, i) => ({ blob: partBlob, filename: `out-page-${i + 1}.pdf` }));
const readyParts = (generation = 1): Prepared => ({ status: 'ready', blob: null, url: null, parts: parts.map((p, i) => ({ ...p, url: `blob:part-${i}` })), generation, prepareNow: vi.fn() });

describe('deliverParts', () => {
  afterEach(() => vi.useRealTimers());

  it('saves the first part at once and the rest 200 ms apart, in order', async () => {
    vi.useFakeTimers();
    const download = vi.fn();
    const done = deliverParts(parts, download);
    expect(download.mock.calls.map((c) => c[1])).toEqual(['out-page-1.pdf']);
    await vi.advanceTimersByTimeAsync(199);
    expect(download).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(download).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200);
    await done;
    expect(download.mock.calls).toEqual(parts.map((p) => [p.blob, p.filename]));
  });
});

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
  it('says nothing to download when every page is skipped, unless the tool is blocked', () => {
    expect(decideDownloadState(null, 'idle', false, false, true)).toBe('nothing');
    expect(decideDownloadState(null, 'ready', true, true, true)).toBe('nothing');
    expect(decideDownloadState('error', 'idle', false, false, true)).toBe('error');
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

  it('saving one part counts a download and settles the tap, but leaves Download as it was', () => {
    resetActionTrailForTests();
    mount(base(readyParts()));
    act(() => flow.onPartSaved());
    expect(flow.tap).toBe('done');
    expect(flow.downloadState).toBe('ready');
    expect(flow.downloadedOnce).toBe(false);
    expect(onDelivered).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
    expect(recentActions()).toContain('download');
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

  it('parts: Share prepares every part, and a ready blob output still uses prepare', () => {
    mount(base(readyParts()));
    expect(share.prepareFiles).toHaveBeenCalledWith(parts.map((p) => ({ blob: p.blob, filename: p.filename, type: 'application/pdf' })));
    expect(share.prepare).not.toHaveBeenCalled();
    mount(base(ready(2)));
    expect(share.prepare).toHaveBeenCalledWith(blob, 'out.pdf', 'application/pdf');
  });

  it('a single blob is shared with its own type (PDF to Image shares a PNG, not a PDF)', () => {
    const png = new Blob(['x'], { type: 'image/png' });
    mount(base({ ...ready(), blob: png }));
    expect(share.prepare).toHaveBeenCalledWith(png, 'out.pdf', 'image/png');
  });

  it('a tap that goes stale while the plan changes mid-build asks the new build to run now', () => {
    const first = pending();
    mount(base(first));
    act(() => flow.onRowPreparingTap());
    expect(first.prepareNow).toHaveBeenCalled();
    // The edit aborted the build and nothing re-armed: the next render is still 'pending'.
    const second = pending();
    mount(base(second));
    expect(second.prepareNow).toHaveBeenCalled();
    mount(base(ready()));
    expect(share.download).toHaveBeenCalledTimes(1);
    const third = pending();
    mount(base(third));
    expect(third.prepareNow).not.toHaveBeenCalled();
  });

  it('parts: Share hands each part over with its own type (PDF to Image shares PNGs)', () => {
    const png = new Blob(['x'], { type: 'image/png' });
    mount(base({ ...readyParts(), parts: [{ blob: png, filename: 'a-page-1.png', url: 'blob:p' }] }));
    expect(share.prepareFiles).toHaveBeenCalledWith([{ blob: png, filename: 'a-page-1.png', type: 'image/png' }]);
  });

  it('parts: a tap on an already-ready output delivers every part once, ready to saved without preparing', async () => {
    vi.useFakeTimers();
    try {
      mount(base(readyParts()));
      const states: string[] = [flow.downloadState];
      act(() => flow.onRowPreparingTap());
      states.push(flow.downloadState);
      expect(share.download).toHaveBeenCalledTimes(1);
      expect(share.download).toHaveBeenCalledWith(parts[0].blob, 'out-page-1.pdf');
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(share.download.mock.calls.map((c) => c[1])).toEqual(['out-page-1.pdf', 'out-page-2.pdf', 'out-page-3.pdf']);
      expect(states).toEqual(['ready', 'saved']);
      expect(flow.downloadState).toBe('saved');
      expect(flow.tap).toBe('done');
      expect(onDelivered).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('parts: tapped again in saved, every part is delivered again', async () => {
    vi.useFakeTimers();
    try {
      mount(base(readyParts()));
      act(() => flow.onRowPreparingTap());
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(share.download).toHaveBeenCalledTimes(3);
      expect(flow.downloadState).toBe('saved');
      act(() => flow.onRowPreparingTap());
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(share.download.mock.calls.map((c) => c[1])).toEqual([
        'out-page-1.pdf', 'out-page-2.pdf', 'out-page-3.pdf', 'out-page-1.pdf', 'out-page-2.pdf', 'out-page-3.pdf',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed hand-off message is cleared by reset() and by the output going stale', async () => {
    store.saveHandoff.mockResolvedValue(false);
    mount(base(ready()));
    await act(async () => { await flow.requestHandoff('compress'); });
    expect(flow.handoffFailed).toBe(true);
    act(() => flow.reset());
    expect(flow.handoffFailed).toBe(false);
    await act(async () => { await flow.requestHandoff('compress'); });
    expect(flow.handoffFailed).toBe(true);
    mount(base(pending()));
    expect(flow.handoffFailed).toBe(false);
  });

  it('a merge hand-off is saved under merge and navigates to the merge href', async () => {
    store.saveHandoff.mockResolvedValue(true);
    const navigate = vi.fn();
    mount({ ...base(ready()), navigate });
    await act(async () => { await flow.requestHandoff('merge'); });
    expect(store.saveHandoff.mock.calls.at(-1)[0]).toBe('merge');
    expect(navigate).toHaveBeenCalledWith('/merge/');
  });

  it.each([['redact', '/redact/'], ['edit-pdf', '/organize-pdf/']] as const)(
    'a tool with no Compress or Sign hand-off (Unlock) hands off to %s under its own id',
    async (tool, href) => {
      store.saveHandoff.mockResolvedValue(true);
      const navigate = vi.fn();
      mount({ ...base(ready()), navigate });
      await act(async () => { await flow.requestHandoff(tool); });
      expect(store.saveHandoff.mock.calls.at(-1)[0]).toBe(tool);
      expect(navigate).toHaveBeenCalledWith(href);
    },
  );

  it('a hand-off goes to the page the caller names instead of the registry page (a locale edition)', async () => {
    store.saveHandoff.mockResolvedValue(true);
    const navigate = vi.fn();
    mount({ ...base(ready()), hrefs: { compress: '/he/compress/' }, navigate });
    await act(async () => { await flow.requestHandoff('compress'); });
    expect(store.saveHandoff.mock.calls.at(-1)[0]).toBe('compress');
    expect(navigate).toHaveBeenCalledWith('/he/compress/');
  });

  it('parts: requestHandoff does nothing', async () => {
    mount(base(readyParts()));
    await act(async () => { await flow.requestHandoff('compress'); });
    expect(flow.handoffBusy).toBe(false);
    expect(flow.handoffFailed).toBe(false);
  });

  it('a hand-off still saving when reset() runs does not navigate', async () => {
    let finish!: (saved: boolean) => void;
    store.saveHandoff.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    const navigate = vi.fn();
    mount({ ...base(ready()), navigate });
    let run!: Promise<void>;
    await act(async () => { run = flow.requestHandoff('compress'); await Promise.resolve(); });
    act(() => flow.reset());
    await act(async () => { finish(true); await run; });
    expect(navigate).not.toHaveBeenCalled();
    expect(flow.handoffBusy).toBe(false);
  });

  it('a superseded hand-off whose save fails later leaves the newer hand-off busy', async () => {
    let failA!: (saved: boolean) => void;
    store.saveHandoff
      .mockReturnValueOnce(new Promise<boolean>((resolve) => { failA = resolve; }))
      .mockReturnValueOnce(new Promise<boolean>(() => {}));
    mount({ ...base(ready()), navigate: vi.fn() });
    let runA!: Promise<void>;
    await act(async () => { runA = flow.requestHandoff('compress'); await Promise.resolve(); });
    act(() => flow.reset());
    await act(async () => { void flow.requestHandoff('merge'); await Promise.resolve(); });
    expect(flow.handoffBusy).toBe(true);
    await act(async () => { failA(false); await runA; });
    expect(flow.handoffBusy).toBe(true);
    expect(flow.handoffFailed).toBe(false);
  });

  it('a completed Share counts as a tap (processing, then done); a canceled one does not', async () => {
    mount(base(ready()));
    const taps: string[] = [flow.tap];
    share.sharePrepared.mockResolvedValue({ status: 'canceled' });
    await act(async () => { await flow.handleShare(); });
    expect(flow.tap).toBe('idle');
    share.sharePrepared.mockResolvedValue({ status: 'shared' });
    await act(async () => { await flow.handleShare(); });
    taps.push(flow.tap);
    expect(taps).toEqual(['idle', 'done']);
  });
});
