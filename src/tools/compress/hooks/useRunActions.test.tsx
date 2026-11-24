import 'fake-indexeddb/auto';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuietPolicy } from '#lib/output/quietPrepare.ts';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import { recentActions, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
import { reportEdit } from '#lib/telemetry/productAnalytics.ts';
import { useCompressTool } from './useCompressTool.ts';
import * as imagesLib from '../lib/compressImages.js';
import { HeldFile } from '../../../test/support/heldFile.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';

vi.mock('../lib/compressImages.js', { spy: true });
vi.mock('#lib/telemetry/productAnalytics.ts', { spy: true });

const FAST_QUIET: QuietPolicy = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };
const LONG_QUIET: QuietPolicy = { baseMs: 60_000, stepMs: 0, maxMs: 60_000, burstWindowMs: 1 };

type Api = ReturnType<typeof useCompressTool>;

function Harness({ apiRef, quietPolicy }: { apiRef: { current: Api | null }; quietPolicy: QuietPolicy }) {
  apiRef.current = useCompressTool({ quietPolicy });
  return null;
}

type Bytes = Uint8Array<ArrayBuffer>;

async function pdfBytes(filler = 0): Promise<Bytes> {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  if (filler) doc.context.register(doc.context.stream(new Uint8Array(filler), {}));
  return new Uint8Array(await doc.save({ useObjectStreams: false }));
}

describe('useRunActions', () => {
  let root: HTMLElement;
  let api: { current: Api | null };
  let bytes: Bytes;
  const mount = (quietPolicy: QuietPolicy = FAST_QUIET) => act(() => render(<Harness apiRef={api} quietPolicy={quietPolicy} />, root));
  const ready = () => waitUntil(() => api.current!.prepared.status === 'ready');
  const open = async (file: File = new File([bytes], 'doc.pdf', { type: 'application/pdf' })) => {
    await act(async () => { api.current!.handleFilesAdded([file]); });
    await ready();
  };
  const runToken = () => api.current!.machine.read().runToken;
  const builds = () => api.current!.machine.read().runCount;
  const builtAt = (count: number) => waitUntil(() => builds() === count && api.current!.prepared.status === 'ready', { timeout: 2000 });
  const failedAt = (count: number) => waitUntil(() => builds() === count && api.current!.prepared.status === 'error', { timeout: 2000 });
  const imageLevelCalls = () => vi.mocked(imagesLib.compressPdfImages).mock.calls;
  const targetCalls = () => vi.mocked(imagesLib.compressPdfImagesToTarget).mock.calls;

  beforeEach(async () => {
    resetActionTrailForTests();
    vi.clearAllMocks();
    bytes = await pdfBytes();
    root = document.createElement('div');
    api = { current: null };
    mount();
  });
  afterEach(() => {
    act(() => render(null, root));
    vi.useRealTimers();
  });

  describe('a level click', () => {
    it('sends optionChanged, so a run in flight is no longer current', async () => {
      await open();
      const before = runToken();
      act(() => api.current!.actions.handleLevelChange('low'));
      expect(runToken()).toBe(before + 1);
      expect(api.current!.level).toBe('low');
      await builtAt(2);
      expect(imageLevelCalls().at(-1)?.[1]).toEqual(expect.objectContaining({ maxLongSidePx: 2400, quality: 0.8 }));
    });

    it('does nothing when the level is already the selected one', async () => {
      await open();
      const before = runToken();
      act(() => api.current!.actions.handleLevelChange('medium'));
      expect(runToken()).toBe(before);
      expect(api.current!.prepared.status).toBe('ready');
      await act(async () => { await drainPromises(); });
      expect(builds()).toBe(1);
    });

    it('drops a run in flight, and only the latest level builds after it', async () => {
      const doc = new HeldFile(bytes, 'doc.pdf', { held: false });
      await open(doc);
      const generation = api.current!.prepared.generation;
      doc.hold();
      act(() => api.current!.actions.handleLevelChange('high'));
      await act(async () => { await doc.started; });
      act(() => api.current!.actions.handleLevelChange('low'));
      await act(async () => { doc.release(); });
      await builtAt(3);
      await act(async () => { await drainPromises(); });
      expect(imageLevelCalls().map(([, options]) => options)).toEqual([
        expect.objectContaining({ maxLongSidePx: 1600, quality: 0.6 }),
        expect.objectContaining({ maxLongSidePx: 1000, quality: 0.4 }),
        expect.objectContaining({ maxLongSidePx: 2400, quality: 0.8 }),
      ]);
      expect(api.current!.prepared.generation).toBe(generation + 1);
    });

    it('builds the level again after a passthrough and the result comes back', async () => {
      await open();
      expect(api.current!.prepared.meta?.passthrough).toBe(true);
      act(() => api.current!.actions.handleLevelChange('low'));
      await builtAt(2);
      expect(imageLevelCalls().at(-1)?.[1]).toEqual(expect.objectContaining({ maxLongSidePx: 2400, quality: 0.8 }));
    });
  });

  describe('Try again', () => {
    let readable: boolean;
    // A file the browser cannot read for a while, as one on a drive that went away.
    class LostFile extends File {
      override arrayBuffer() { return readable ? super.arrayBuffer() : Promise.reject(new DOMException('gone', 'NotReadableError')); }
    }
    beforeEach(() => { readable = true; });
    const failedBuild = async () => {
      const lost = new LostFile([bytes], 'lost.pdf', { type: 'application/pdf' });
      await act(async () => { api.current!.handleFilesAdded([lost]); });
      await builtAt(1);
      readable = false;
      act(() => api.current!.actions.handleLevelChange('high'));
      await failedAt(2);
      return lost;
    };

    it('shows the failure, and a retry runs once more', async () => {
      await failedBuild();
      expect(runToken()).toBeGreaterThan(0);
      act(() => api.current!.actions.retry());
      expect(api.current!.machine.read().retryTap).toBe('processing');
      await failedAt(3);
    });

    it('a retry that works lands the result, and the tap reads done', async () => {
      const lost = await failedBuild();
      expect(api.current!.machine.read().retryTap).toBe('idle');
      readable = true;
      act(() => api.current!.actions.retry());
      expect(api.current!.machine.read().retryTap).toBe('processing');
      await builtAt(3);
      expect(api.current!.machine.read().retryTap).toBe('done');
      expect(api.current!.last?.blob).toBe(lost);
    });

    it('after a failed build, warming the build does not rebuild', async () => {
      await failedBuild();
      await act(async () => { api.current!.actions.warmBuild(); await drainPromises(); });
      expect(api.current!.prepared.status).toBe('error');
      expect(builds()).toBe(2);
    });

    it('warming the build before a failure starts it at once, not after the quiet wait', async () => {
      act(() => render(null, root));
      mount(LONG_QUIET);
      await open();
      act(() => api.current!.actions.handleLevelChange('high'));
      expect(builds()).toBe(1);
      act(() => api.current!.actions.warmBuild());
      await builtAt(2);
    });
  });

  describe('the target size', () => {
    const targetKBs = () => targetCalls().map(([, options]) => options.targetKB);

    it('a preset runs at once at the new size, and the new size is what builds', async () => {
      await open();
      act(() => api.current!.actions.handleLevelChange('target'));
      await builtAt(2);
      const before = runToken();
      act(() => api.current!.actions.handleTargetKBChange(500));
      expect(runToken()).toBe(before + 1);
      expect(api.current!.targetKB).toBe(500);
      await builtAt(3);
      expect(targetKBs()).toEqual([100, 500]);
    });

    it.each([[Number.NaN], [0], [-20]])('takes %s as 1 KB', async (typed) => {
      await open();
      act(() => api.current!.actions.handleLevelChange('target'));
      await builtAt(2);
      act(() => api.current!.actions.handleTargetKBChange(typed));
      expect(api.current!.targetKB).toBe(1);
      await builtAt(3);
      expect(targetKBs()).toEqual([100, 1]);
    });

    it('re-selecting the same size is not a change', async () => {
      await open();
      const before = runToken();
      const trail = recentActions();
      act(() => api.current!.actions.handleTargetKBChange(100));
      expect(runToken()).toBe(before);
      expect(recentActions()).toEqual(trail);
      expect(reportEdit).not.toHaveBeenCalled();
    });

    it('typing a KB value builds once after the pause, not per keystroke; a preset is a change like any other', async () => {
      await open();
      act(() => api.current!.actions.handleLevelChange('target'));
      await builtAt(2);
      // The quiet timer (FAST_QUIET.baseMs, 5) is the debounce under test: fake only setTimeout from here.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      act(() => api.current!.actions.handleTargetKBChange(250));
      act(() => api.current!.actions.handleTargetKBChange(600));
      await act(async () => { await vi.advanceTimersByTimeAsync(FAST_QUIET.baseMs + 1); });
      await waitUntil(() => builds() === 3 && api.current!.prepared.status === 'ready', { dueFakeTimers: true });
      // Past the pause again: a build per keystroke would have another call by now.
      await act(async () => { await vi.advanceTimersByTimeAsync(FAST_QUIET.baseMs + 1); await drainPromises(); });
      expect(targetKBs()).toEqual([100, 600]);

      act(() => api.current!.actions.handleTargetKBChange(200));
      await act(async () => { await vi.advanceTimersByTimeAsync(FAST_QUIET.baseMs + 1); });
      await waitUntil(() => builds() === 4 && api.current!.prepared.status === 'ready', { dueFakeTimers: true });
      expect(targetKBs()).toEqual([100, 600, 200]);
    });
  });

  describe('the pages-to-pictures switch', () => {
    it('unticking returns at once to the image-path result already built, with no new build', async () => {
      await open();
      const imagePath = api.current!.prepared.meta;
      act(() => api.current!.actions.handleFlattenChange(true));
      await failedAt(2);
      act(() => api.current!.actions.handleFlattenChange(false));
      expect(api.current!.flatten).toBe(false);
      expect(api.current!.prepared.status).toBe('ready');
      expect(api.current!.prepared.meta).toBe(imagePath);
      await act(async () => { await drainPromises(); });
      expect(builds()).toBe(2);
    });

    it('unticking builds the image path when it was not built before', async () => {
      await open();
      act(() => api.current!.actions.handleLevelChange('low'));
      await builtAt(2);
      act(() => api.current!.actions.handleFlattenChange(true));
      await failedAt(3);
      act(() => api.current!.actions.handleLevelChange('high'));
      await failedAt(4);
      const imageBuilds = imageLevelCalls().length;
      act(() => api.current!.actions.handleFlattenChange(false));
      expect(api.current!.prepared.status).toBe('pending');
      await builtAt(5);
      expect(imageLevelCalls()).toHaveLength(imageBuilds + 1);
      expect(imageLevelCalls().at(-1)?.[1]).toEqual(expect.objectContaining({ maxLongSidePx: 1000, quality: 0.4 }));
    });

    it('ticking the switch to the value it already has is not a change', async () => {
      await open();
      const before = runToken();
      act(() => api.current!.actions.handleFlattenChange(false));
      expect(runToken()).toBe(before);
      expect(builds()).toBe(1);
    });
  });

  describe('what the person did', () => {
    it('reports an edit when the person changes an option, not on arrival', async () => {
      await open();
      expect(reportEdit).not.toHaveBeenCalled();
      act(() => api.current!.actions.handleLevelChange('low'));
      expect(reportEdit).toHaveBeenCalledTimes(1);
      expect(reportEdit).toHaveBeenLastCalledWith('compress');
      act(() => api.current!.actions.handleFlattenChange(true));
      act(() => api.current!.actions.handleTargetKBChange(300));
      expect(reportEdit).toHaveBeenCalledTimes(3);
    });

    it('records change_setting by name only', async () => {
      await open();
      const before = recentActions();
      act(() => api.current!.actions.handleLevelChange('low'));
      expect(recentActions()).toEqual([...before, 'change_setting']);
    });
  });

  it('re-clicking the selected target preset while its build is in flight still lands the result', async () => {
    const scan = new HeldFile(await pdfBytes(300_000), 'big_scan.pdf', { held: false });
    await open(scan);
    act(() => api.current!.actions.handleLevelChange('target'));
    await builtAt(2);
    scan.hold();
    act(() => api.current!.actions.handleTargetKBChange(200));
    await act(async () => { await scan.started; });
    const before = runToken();
    act(() => api.current!.actions.handleTargetKBChange(200));
    expect(runToken()).toBe(before);
    await act(async () => { scan.release(); await drainPromises(); });
    await builtAt(3);
    expect(targetCalls().map(([, options]) => options.targetKB)).toEqual([100, 200]);
  });
});
