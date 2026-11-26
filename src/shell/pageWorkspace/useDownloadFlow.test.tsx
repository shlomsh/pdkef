import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { peekHandoff, saveHandoff } from '#lib/drafts/draftStore.ts';
import { reportHandedOn, resetUsageEventsForTests } from '#lib/telemetry/productAnalytics.ts';
import { recentActions, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
import { openNewerStore } from '#lib/drafts/newerStore.test-helper.ts';
import { holdDraftStore } from '#lib/drafts/heldStore.test-helper.ts';
import { setScreen } from '../../test/support/screen.ts';
import { decideDownloadState, deliverParts, useDownloadFlow, type DownloadFlowInput } from './useDownloadFlow.ts';

vi.mock('#lib/telemetry/productAnalytics.ts', { spy: true });
// The draft store runs for real on fake-indexeddb; the spy sees the call. A refused save is a real VersionError,
// a held save is a real held transaction, and a save that throws or fails late is forced.
vi.mock('#lib/drafts/draftStore.ts', { spy: true });

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

// The real usePdfShare runs. What download saw is read off the real object URL and the clicked anchor.
const downloads: [Blob, string][] = [];
const onDownloadClick = (event: Event) => {
  const link = event.target as HTMLAnchorElement;
  if (link.tagName !== 'A' || !link.download) return;
  event.preventDefault(); // jsdom would try to navigate to the blob: url
  const urls = vi.mocked(URL.createObjectURL);
  const at = urls.mock.results.findIndex((result) => result.value === link.href);
  downloads.push([urls.mock.calls[at][0] as Blob, link.download]);
};
const expectDownloads = (expected: [Blob, string][]) => {
  expect(downloads.map(([, name]) => name)).toEqual(expected.map(([, name]) => name));
  downloads.forEach(([saved], i) => expect(saved).toBe(expected[i][0]));
};
// What the native share sheet was handed, one list of files per share.
const sheets: File[][] = [];
const sheetKeys: string[][] = [];
// Forced: jsdom has no navigator.share, so the sheet is a function that records the files it is handed.
const shareSheet = (answer: () => Promise<void> = () => Promise.resolve()) => Object.defineProperty(navigator, 'share', {
  configurable: true,
  value: (data: { files: File[] }) => { sheets.push(data.files); sheetKeys.push(Object.keys(data)); return answer(); },
});
const described = async (files: File[]) => Promise.all(files.map(async (file) => ({ name: file.name, type: file.type, text: await file.text() })));

describe('useDownloadFlow', () => {
  let container: HTMLElement;
  let flow: ReturnType<typeof useDownloadFlow>;
  const announce = vi.fn();
  const onDelivered = vi.fn();
  const base = (prepared: Prepared, blocked: DownloadFlowInput['blocked'] = null): DownloadFlowInput => ({
    prepared,
    from: 'split',
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
    setScreen({ width: 600 }); // a phone
    vi.clearAllMocks();
    vi.mocked(saveHandoff).mockReset();
    vi.mocked(reportHandedOn).mockClear();
    resetUsageEventsForTests();
    indexedDB = new IDBFactory();
    localStorage.clear();
    downloads.length = 0;
    sheets.length = 0;
    sheetKeys.length = 0;
    vi.spyOn(URL, 'createObjectURL');
    document.addEventListener('click', onDownloadClick, true);
    shareSheet();
  });
  afterEach(() => {
    document.removeEventListener('click', onDownloadClick, true);
    vi.mocked(URL.createObjectURL).mockRestore();
    delete (navigator as { share?: unknown }).share;
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
    expect(downloads).toEqual([]);
    mount(base(ready()));
    expectDownloads([[blob, 'out.pdf']]);
    expect(flow.downloadState).toBe('saved');
    expect(flow.tap).toBe('done');
    expect(flow.showStrip).toBe(false);
  });

  it('shows the compressing look only after a tap before the build is done, then delivers', () => {
    const building = pending();
    mount(base(building));
    // Quiet means quiet: a build under way, with no tap, keeps the ready look.
    expect(flow.downloadState).toBe('ready');
    expect(building.prepareNow).not.toHaveBeenCalled();
    act(() => flow.onRowPreparingTap());
    expect(building.prepareNow).toHaveBeenCalled();
    expect(flow.downloadState).toBe('preparing');
    expect(downloads).toEqual([]);
    mount(base(ready()));
    expectDownloads([[blob, 'out.pdf']]);
    expect(flow.downloadState).toBe('saved');
    expect(announce).toHaveBeenCalledTimes(1);
    expect(onDelivered).toHaveBeenCalledTimes(1);
  });

  it('a tap that beats the build counts as a download once the blob is delivered, and not before', () => {
    resetActionTrailForTests();
    const waiting = pending();
    mount(base(waiting));
    act(() => flow.onRowPreparingTap());
    expect(recentActions()).not.toContain('download');
    mount(base(ready()));
    expect(recentActions()).toContain('download');
  });

  it('opens the strip only for the quiet Download tap on a phone width', () => {
    mount(base(pending()));
    act(() => flow.onQuietPreparingTap());
    mount(base(ready()));
    expect(flow.showStrip).toBe(true);

    act(() => setScreen({ width: 1280 }));
    expect(flow.showStrip).toBe(false); // the window widened past the bar that holds the strip
    mount(base(pending()));
    act(() => flow.reset());
    act(() => flow.onQuietPreparingTap());
    mount(base(ready(2)));
    expect(flow.showStrip).toBe(false);
  });

  it('a quiet tap still waiting when reset() runs does not open the strip for a later completion-row tap', () => {
    mount(base(pending()));
    act(() => flow.onQuietPreparingTap());
    act(() => flow.reset());
    mount(base(pending()));
    act(() => flow.onRowPreparingTap());
    mount(base(ready(2)));
    expect(flow.downloadState).toBe('saved');
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
    expect(flow.shareReady).toBe(true);
    act(() => flow.onQuietDownloadTap());
    expect(flow.showStrip).toBe(true);
    act(() => flow.reset());
    expect(flow.tap).toBe('idle');
    expect(flow.downloadedOnce).toBe(false);
    expect(flow.showStrip).toBe(false);
    expect(flow.shareReady).toBe(false);
  });

  it('parts: Share prepares every part, and a ready blob output still uses prepare', async () => {
    mount(base(readyParts()));
    await act(async () => { await flow.handleShare(); });
    expect(sheets).toHaveLength(1);
    expect(await described(sheets[0])).toEqual([
      { name: 'out-page-1.pdf', type: 'application/pdf', text: 'a' },
      { name: 'out-page-2.pdf', type: 'application/pdf', text: 'b' },
      { name: 'out-page-3.pdf', type: 'application/pdf', text: 'c' },
    ]);
    mount(base(ready(2)));
    await act(async () => { await flow.handleShare(); });
    expect(sheets).toHaveLength(2);
    expect(await described(sheets[1])).toEqual([{ name: 'out.pdf', type: 'application/pdf', text: 'x' }]);
  });

  it('a single blob is shared with its own type (PDF to Image shares a PNG, not a PDF)', async () => {
    const png = new Blob(['x'], { type: 'image/png' });
    mount(base({ ...ready(), blob: png }));
    await act(async () => { await flow.handleShare(); });
    expect(sheets).toHaveLength(1);
    expect(await described(sheets[0])).toEqual([{ name: 'out.pdf', type: 'image/png', text: 'x' }]);
    expect(sheetKeys).toEqual([['files']]); // a title or text becomes a stray file on iOS (DEBT-60)
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
    expectDownloads([[blob, 'out.pdf']]);
    const third = pending();
    mount(base(third));
    expect(third.prepareNow).not.toHaveBeenCalled();
  });

  it('parts: Share hands each part over with its own type (PDF to Image shares PNGs)', async () => {
    const png = new Blob(['x'], { type: 'image/png' });
    mount(base({ ...readyParts(), parts: [{ blob: png, filename: 'a-page-1.png', url: 'blob:p' }] }));
    await act(async () => { await flow.handleShare(); });
    expect(sheets).toHaveLength(1);
    expect(await described(sheets[0])).toEqual([{ name: 'a-page-1.png', type: 'image/png', text: 'x' }]);
  });

  it('parts: a tap on an already-ready output delivers every part once, ready to saved without preparing', async () => {
    vi.useFakeTimers();
    try {
      mount(base(readyParts()));
      const states: string[] = [flow.downloadState];
      act(() => flow.onRowPreparingTap());
      states.push(flow.downloadState);
      expectDownloads([[parts[0].blob, 'out-page-1.pdf']]);
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expectDownloads(parts.map((p) => [p.blob, p.filename]));
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
      expectDownloads(parts.map((p) => [p.blob, p.filename]));
      expect(flow.downloadState).toBe('saved');
      act(() => flow.onRowPreparingTap());
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expectDownloads([...parts, ...parts].map((p) => [p.blob, p.filename]));
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed hand-off message is cleared by reset() and by the output going stale', async () => {
    await openNewerStore();
    mount(base(ready()));
    await act(async () => { await flow.requestHandoff('compress'); });
    expect(await vi.mocked(saveHandoff).mock.results.at(-1)!.value).toBe(false);
    expect(flow.handoffFailed).toBe(true);
    act(() => flow.reset());
    expect(flow.handoffFailed).toBe(false);
    await act(async () => { await flow.requestHandoff('compress'); });
    expect(flow.handoffFailed).toBe(true);
    mount(base(pending()));
    expect(flow.handoffFailed).toBe(false);
  });

  it('a merge hand-off is saved under merge and navigates to the merge href', async () => {
    const navigate = vi.fn();
    mount({ ...base(ready()), navigate });
    await act(async () => { await flow.requestHandoff('merge'); });
    expect(vi.mocked(saveHandoff).mock.calls.at(-1)![0]).toBe('merge');
    expect(await peekHandoff('merge')).toMatchObject({ fileName: 'out.pdf', fileType: 'application/pdf' });
    expect(navigate).toHaveBeenCalledWith('/merge/');
  });

  it('a hand-off that proceeds reports the file handed on once, under the sending tool', async () => {
    mount({ ...base(ready()), from: 'merge', navigate: vi.fn() });
    await act(async () => { await flow.requestHandoff('compress'); });
    expect(reportHandedOn).toHaveBeenCalledTimes(1);
    expect(reportHandedOn).toHaveBeenCalledWith('merge');
  });

  it('a hand-off whose save throws reports nothing', async () => {
    await openNewerStore();
    mount({ ...base(ready()), navigate: vi.fn() });
    await act(async () => { await flow.requestHandoff('compress'); });
    expect(await vi.mocked(saveHandoff).mock.results.at(-1)!.value).toBe(false);
    expect(reportHandedOn).not.toHaveBeenCalled();
  });

  it('a hand-off names the sending tool in its payload', async () => {
    mount({ ...base(ready()), from: 'merge', navigate: vi.fn() });
    await act(async () => { await flow.requestHandoff('compress'); });
    expect(vi.mocked(saveHandoff).mock.calls.at(-1)![1].from).toBe('merge');
    expect((await peekHandoff('compress'))?.from).toBe('merge');
  });

  it.each([['redact', '/redact/'], ['edit-pdf', '/organize-pdf/']] as const)(
    'a tool with no Compress or Sign hand-off (Unlock) hands off to %s under its own id',
    async (tool, href) => {
        const navigate = vi.fn();
      mount({ ...base(ready()), navigate });
      await act(async () => { await flow.requestHandoff(tool); });
      expect(vi.mocked(saveHandoff).mock.calls.at(-1)![0]).toBe(tool);
      expect(navigate).toHaveBeenCalledWith(href);
    },
  );

  it('a hand-off goes to the page the caller names instead of the registry page (a locale edition)', async () => {
    const navigate = vi.fn();
    mount({ ...base(ready()), hrefs: { compress: '/he/compress/' }, navigate });
    await act(async () => { await flow.requestHandoff('compress'); });
    expect(vi.mocked(saveHandoff).mock.calls.at(-1)![0]).toBe('compress');
    expect(navigate).toHaveBeenCalledWith('/he/compress/');
  });

  it('parts: requestHandoff does nothing', async () => {
    mount(base(readyParts()));
    await act(async () => { await flow.requestHandoff('compress'); });
    expect(flow.handoffBusy).toBe(false);
    expect(flow.handoffFailed).toBe(false);
  });

  it('a hand-off still saving when reset() runs does not navigate', async () => {
    const hold = await holdDraftStore();
    const navigate = vi.fn();
    mount({ ...base(ready()), navigate });
    let run!: Promise<void>;
    await act(async () => { run = flow.requestHandoff('compress'); await Promise.resolve(); });
    act(() => flow.reset());
    await act(async () => { await hold.release(); await run; });
    expect(await vi.mocked(saveHandoff).mock.results.at(-1)!.value).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(flow.handoffBusy).toBe(false);
  });

  it('a superseded hand-off whose save fails later leaves the newer hand-off busy', async () => {
    let failA!: (saved: boolean) => void;
    // Forced: a real store cannot be made to fail the first of two saves late and hold the second.
    vi.mocked(saveHandoff)
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

  it('a completed Share counts as a tap (processing, then done) and records a share; a canceled or failed one does neither', async () => {
    resetActionTrailForTests();
    shareSheet(() => Promise.reject(new DOMException('closed', 'AbortError')));
    mount(base(ready()));
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
    mount({ ...base(ready()), messages: { ready: 'Ready', shared: '', canceled: 'Canceled', shareError: 'Failed' } });
    await act(async () => { await flow.handleShare(); });
    expect(announce).toHaveBeenCalledWith('');
  });
});
