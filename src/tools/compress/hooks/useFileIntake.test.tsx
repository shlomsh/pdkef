import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuietPolicy } from '#lib/output/quietPrepare.ts';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import { recentActions, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
import { useCompressTool } from './useCompressTool.ts';
import { HeldFile } from '../../../test/support/heldFile.ts';
import * as imagesLib from '../lib/compressImages.js';
import * as imageLib from '../lib/compressImage.js';
import { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import { openPdfDoc } from '#lib/pdf/openPdfDoc.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';

vi.mock('../lib/compressImages.js', { spy: true });
vi.mock('../lib/compressImage.js', { spy: true });
vi.mock('#lib/pdf/pdfEncryption.ts', { spy: true });
vi.mock('#lib/pdf/openPdfDoc.ts', { spy: true });
vi.mock('#lib/telemetry/errorReport.ts', { spy: true });

const FAST_QUIET: QuietPolicy = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };

type Api = ReturnType<typeof useCompressTool>;

function Harness({ apiRef, quietPolicy = FAST_QUIET }: { apiRef: { current: Api | null }; quietPolicy?: QuietPolicy }) {
  apiRef.current = useCompressTool({ quietPolicy });
  return null;
}

type Bytes = Uint8Array<ArrayBuffer>;

async function pdfBytes(pages = 1): Promise<Bytes> {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([200, 200]);
  return new Uint8Array(await doc.save({ useObjectStreams: false }));
}

const fixture = (name: string): Bytes => new Uint8Array(readFileSync(resolve(process.cwd(), `src/lib/__fixtures__/encrypted/${name}.pdf`)));

describe('useFileIntake', () => {
  let root: HTMLElement;
  let api: { current: Api | null };
  let bytes: Bytes;
  const pdf = (name: string, content: Bytes = bytes) => new File([content], name, { type: 'application/pdf' });
  const photo = (name: string) => new File(['not really a photo'], name, { type: 'image/jpeg' });
  const mount = (quietPolicy: QuietPolicy = FAST_QUIET) => act(() => render(<Harness apiRef={api} quietPolicy={quietPolicy} />, root));
  const add = (...files: File[]) => act(async () => { api.current!.handleFilesAdded(files); });
  const ready = () => waitUntil(() => api.current!.prepared.status === 'ready');
  const engineCalls = () => vi.mocked(imagesLib.compressPdfImages).mock.calls.length;

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

  it('a new file closes the gate and invalidates the run and the analysis in flight', async () => {
    await add(pdf('a.pdf'));
    await ready();
    const before = api.current!.machine.read();
    expect(before.runnable).toBe(true);
    const b = new HeldFile(bytes, 'b.pdf');
    await add(b);
    const after = api.current!.machine.read();
    expect(after.runnable).toBe(false);
    expect(after.runToken).toBeGreaterThan(before.runToken);
    expect(after.analysisToken).toBeGreaterThan(before.analysisToken);
    b.release();
    await ready();
  });

  it('a new file never shows the result of the one it replaced', async () => {
    await add(pdf('a.pdf'));
    await ready();
    expect(api.current!.last).not.toBeNull();
    const b = new HeldFile(bytes, 'b.pdf');
    await add(b);
    expect(api.current!.last).toBeNull();
    expect(api.current!.analysis).toBeNull();
    b.release();
    await ready();
  });

  it('a photo picked after a PDF also closes the gate and invalidates its run', async () => {
    await add(pdf('a.pdf'));
    await ready();
    const before = api.current!.machine.read();
    await add(photo('p.jpg'));
    const after = api.current!.machine.read();
    expect(after.runToken).toBeGreaterThan(before.runToken);
    expect(api.current!.file?.name).toBe('p.jpg');
    expect(api.current!.last).toBeNull();
  });

  it('does not land a stale compress result when the file is replaced mid-run', async () => {
    const a = new HeldFile(bytes, 'run_a.pdf', { held: false });
    await add(a);
    await ready();
    a.hold();
    act(() => api.current!.actions.handleLevelChange('low'));
    await act(async () => { await a.started; });
    const running = engineCalls();
    const b = pdf('run_b.pdf');
    await add(b);
    await waitUntil(() => api.current!.prepared.blob === b && api.current!.last?.blob === b);
    expect(engineCalls()).toBe(running + 1);
    await act(async () => {
      a.release();
      await vi.mocked(imagesLib.compressPdfImages).mock.results[running - 1].value;
      await drainPromises();
    });
    expect(engineCalls()).toBe(running + 1);
    expect(api.current!.prepared.blob).toBe(b);
    expect(api.current!.last?.blob).toBe(b);
  });

  it('does not land a stale PDF compare preview when the file is replaced while it is loading', async () => {
    // A long quiet wait: the first build starts at once, and nothing else builds and clears the previews meanwhile.
    act(() => render(null, root));
    mount({ baseMs: 60_000, stepMs: 0, maxMs: 60_000, burstWindowMs: 1 });
    await add(pdf('preview_a.pdf'));
    await ready();
    await act(async () => { await drainPromises(); });
    const renderFailures = () => vi.mocked(reportError).mock.calls.filter(([, , where]) => where === 'render_compare_preview').length;
    const failedBefore = renderFailures();
    const compressed = new HeldFile(bytes, 'preview_a-compressed.pdf');
    let opening!: Promise<void>;
    act(() => { opening = api.current!.compare.open(api.current!.file, compressed); });
    await act(async () => { await compressed.started; });
    const b = new HeldFile(bytes, 'preview_b.pdf');
    await add(b);
    await act(async () => { compressed.release(); await opening; });
    expect(renderFailures()).toBe(failedBefore);
    await act(async () => { await drainPromises(); });
    expect(api.current!.compare.status).toBe('idle');
    expect(api.current!.compare.previews).toBeNull();
    b.release();
    await ready();
  });

  it('a new file drops a pending KB change', async () => {
    await add(pdf('first.pdf'));
    await ready();
    act(() => api.current!.actions.handleLevelChange('target'));
    await ready();
    const calls = () => vi.mocked(imagesLib.compressPdfImagesToTarget).mock.calls.length;
    const before = calls();
    // The quiet timer (FAST_QUIET.baseMs, 5) is the debounce under test: fake only setTimeout from here.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // The new file waits on its password check, so only the old change could start a build.
    const second = new HeldFile(bytes, 'second.pdf');
    act(() => {
      api.current!.actions.handleTargetKBChange(300);
      api.current!.handleFilesAdded([second]);
    });
    await act(async () => { await second.started; });
    await act(async () => { await vi.advanceTimersByTimeAsync(FAST_QUIET.baseMs + 1); await drainPromises(); });
    expect(calls()).toBe(before);
    second.release();
    await waitUntil(() => api.current!.prepared.status === 'ready', { dueFakeTimers: true });
    expect(calls()).toBe(before + 1);
    expect(vi.mocked(imagesLib.compressPdfImagesToTarget).mock.calls[before][0]).toBe(second);
  });

  it('starts the first run at once once the encryption probe lets the file run, not after the quiet wait', async () => {
    act(() => render(null, root));
    mount({ baseMs: 60_000, stepMs: 0, maxMs: 60_000, burstWindowMs: 1 });
    const probing = new HeldFile(bytes, 'doc.pdf');
    await add(probing);
    await act(async () => { await probing.started; await drainPromises(); });
    expect(engineCalls()).toBe(0);
    probing.release();
    await waitUntil(() => expect(engineCalls()).toBe(1), { timeout: 2000 });
    await ready();
  });

  describe('the PDF analysis', () => {
    it('re-reads an encrypted PDF with an empty password so text detection sees plaintext', async () => {
      await add(pdf('restricted.pdf', fixture('owner-only')));
      await waitUntil(() => api.current!.analysis !== null);
      expect(api.current!.analysis).toEqual(expect.objectContaining({ hasText: true, images: [] }));
    });

    it('keeps the first read when the empty-password re-read throws', async () => {
      await add(pdf('locked.pdf', fixture('needs-password')));
      await waitUntil(() => api.current!.analysis !== null);
      expect(api.current!.analysis).toEqual(expect.objectContaining({ hasText: false, images: [] }));
    });

    it('drops an analysis that lands after a newer file was added', async () => {
      const a = new HeldFile(await pdfBytes(1), 'a.pdf');
      await add(a);
      await act(async () => { await a.started; });
      await add(pdf('b.pdf', await pdfBytes(3)));
      await waitUntil(() => api.current!.analysis?.pageCount === 3);
      const aOpened = vi.mocked(openPdfDoc).mock.calls.findIndex(([opened]) => opened === a);
      await act(async () => {
        a.release();
        await vi.mocked(openPdfDoc).mock.results[aOpened].value;
        await drainPromises();
      });
      expect(api.current!.analysis?.pageCount).toBe(3);
    });
  });

  describe('what a pick does by kind', () => {
    it('never probes an image, and compresses it on its own', async () => {
      await add(photo('photo.jpg'));
      await waitUntil(() => vi.mocked(imageLib.compressImageToTarget).mock.calls.length === 1);
      expect(probeEncryption).not.toHaveBeenCalled();
      expect(api.current!.needsUnlockBytes).toBeNull();
      expect(api.current!.machine.read().runCount).toBe(1);
    });

    it('probes a PDF', async () => {
      await add(pdf('doc.pdf'));
      await ready();
      expect(probeEncryption).toHaveBeenCalledTimes(1);
    });

    it('a PDF picked among photos is named as left out and never compressed as a photo', async () => {
      const notes = pdf('notes.pdf');
      await add(photo('a.jpg'), notes, photo('b.jpg'));
      expect(api.current!.batch.leftOutPdfs).toEqual(['notes.pdf']);
      expect(api.current!.batch.state.rows.map((row) => row.file.name)).toEqual(['a.jpg', 'b.jpg']);
      await waitUntil(() => vi.mocked(imageLib.compressImageToTarget).mock.calls.length === 1);
      expect(vi.mocked(imageLib.compressImageToTarget).mock.calls.map(([file]) => (file instanceof File ? file.name : ''))).toEqual(['a.jpg']);
      expect(probeEncryption).not.toHaveBeenCalled();
    });

    it('a PDF picked with one photo is named as left out too', async () => {
      await add(photo('a.jpg'), pdf('notes.pdf'));
      expect(api.current!.batch.summary.total).toBe(0);
      expect(api.current!.file?.name).toBe('a.jpg');
      expect(api.current!.batch.leftOutPdfs).toEqual(['notes.pdf']);
      expect(probeEncryption).not.toHaveBeenCalled();
    });

    it('loads a real PDF picked next and drops the skip line', async () => {
      await add(new File(['plain text'], 'notes.txt', { type: 'text/plain' }));
      expect(api.current!.rejectedFiles).toEqual(['notes.txt']);
      expect(api.current!.file).toBeNull();
      await add(pdf('real.pdf'));
      expect(api.current!.rejectedFiles).toEqual([]);
      expect(api.current!.file?.name).toBe('real.pdf');
      await ready();
    });
  });

  it('records what the person did, by name only: a pick is add_files', async () => {
    await add(pdf('secret_name.pdf'));
    expect(recentActions()).toEqual(['add_files']);
    await ready();
    expect(recentActions()).toEqual(['add_files', 'export']);
  });
});
