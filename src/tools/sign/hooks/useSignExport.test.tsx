import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { PDFDocument } from '@cantoo/pdf-lib';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '../messages';
import { useLatestRun } from '#lib/hooks/useLatestRun.ts';
import { reportHandedOn, reportToolLifecycleEvent, resetUsageEventsForTests } from '#lib/telemetry/productAnalytics.ts';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
import { saveHandoff, takeHandoff } from '#lib/drafts/draftStore.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import type { SignedExport } from '../lib/exportHandoff.ts';
import { useSignExport } from './useSignExport.ts';
import { useSpeculativeExport } from './useSpeculativeExport.ts';

vi.mock('#lib/telemetry/productAnalytics.ts', { spy: true });
// The real signer and the real hand-off (into fake-indexeddb) run; the spy lets a test see the hand-off call.
vi.mock('#lib/handoff/sendHandoff.ts', { spy: true });
vi.mock('#lib/drafts/draftStore.ts', { spy: true });

type SignExportApi = ReturnType<typeof useSignExport>;
type ShareFake = Parameters<typeof useSignExport>[0]['share'];

// A real one-page PDF, so the real signer has something to sign.
let file: File;
let fileBytes: ArrayBuffer;
beforeAll(async () => {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const saved = await doc.save();
  fileBytes = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;
  file = new File([fileBytes], 'form.pdf', { type: 'application/pdf' });
});
// handleDownloadPdf does not await the export it starts; the download it serves once the file is signed says it finished.
let onDownload: () => void = () => {};
function nextDownloadServed(): Promise<void> {
  const served = Promise.withResolvers<void>();
  onDownload = () => served.resolve();
  return served.promise;
}
const events = () => vi.mocked(reportToolLifecycleEvent).mock.calls.map(([name]) => name);
const untimedFlags = () => vi.mocked(reportToolLifecycleEvent).mock.calls.map(([, , options]) => options);

function Harness({ apiRef, share, preparedExportRef }: {
  apiRef: { current: SignExportApi };
  share: ShareFake;
  preparedExportRef: { current: SignedExport | null };
}) {
  const exportRun = useLatestRun(() => [file]);
  apiRef.current = useSignExport({
    file,
    fileBytesRef: { current: fileBytes },
    elements: [],
    exportRun,
    activeExportSpeculativeRef: { current: false },
    documentRevisionRef: { current: 0 },
    preparedExportRef,
    signedExport: null,
    share,
    lifecycleDispatch: vi.fn(),
    setAnnouncement: vi.fn(),
    messages: englishSignMessages,
  });
  return null;
}

describe('Sign export funnel events', () => {
  let root: HTMLElement;
  let api: { current: SignExportApi };
  let share: ShareFake & { downloadPrepared: ReturnType<typeof vi.fn> };
  let preparedExportRef: { current: SignedExport | null };
  beforeEach(() => {
    localStorage.clear();
    indexedDB = new IDBFactory();
    vi.mocked(sendHandoff).mockClear();
    vi.mocked(saveHandoff).mockClear();
    vi.mocked(reportToolLifecycleEvent).mockClear();
    resetUsageEventsForTests();
    onDownload = () => {};
    root = document.createElement('div');
    api = { current: null as unknown as SignExportApi };
    preparedExportRef = { current: null };
    share = {
      prepare: vi.fn(() => true),
      download: () => onDownload(),
      downloadPrepared: vi.fn(() => true),
      sharePrepared: vi.fn(async () => ({ status: 'shared' })),
      clearPrepared: vi.fn(),
    } as unknown as typeof share;
    act(() => render(<Harness apiRef={api} share={share} preparedExportRef={preparedExportRef} />, root));
  });
  afterEach(() => render(null, root));

  const prepared = (extra: Partial<SignedExport> = {}): SignedExport => ({ blob: new Blob(['pdf']), name: 'signed_form.pdf', revision: 0, ...extra });

  it('counts a download served from the file the background run prepared', async () => {
    preparedExportRef.current = prepared({ speculative: true });
    await act(() => api.current.handleDownloadPdf());
    expect(share.downloadPrepared).toHaveBeenCalled();
    expect(events()).toEqual(['tool_operation_started', 'tool_result_ready']);
    // MEM-45: the pair is reported back to back, so it carries no time.
    expect(untimedFlags()).toEqual([{ untimed: true }, { untimed: true }]);
  });

  it('counts a share of the file the background run prepared', async () => {
    preparedExportRef.current = prepared({ speculative: true });
    await act(() => api.current.handleSharePdf());
    expect(events()).toEqual(['tool_operation_started', 'tool_result_ready']);
  });

  it('does not count a prepared file twice when its own run already reported', async () => {
    preparedExportRef.current = prepared();
    await act(() => api.current.handleDownloadPdf());
    await act(() => api.current.handleSharePdf());
    expect(events()).toEqual([]);
  });

  it('counts a download made on the spot once, and each repeat download again', async () => {
    share.downloadPrepared.mockReturnValue(false);
    const first = nextDownloadServed();
    await act(() => api.current.handleDownloadPdf());
    await act(async () => { await first; });
    const second = nextDownloadServed();
    await act(() => api.current.handleDownloadPdf());
    await act(async () => { await second; });
    expect(events()).toEqual(['tool_operation_started', 'tool_result_ready', 'tool_operation_started', 'tool_result_ready']);
  });

  it('a hand-off reports nothing when the file could not be parked, since it never reaches its proceed step', async () => {
    preparedExportRef.current = prepared();
    const error = vi.spyOn(console, 'error');
    vi.mocked(reportHandedOn).mockClear();
    vi.mocked(saveHandoff).mockResolvedValueOnce(false); // the one forced line: the store refuses the file
    await act(() => api.current.requestHandoff('compress'));
    await act(async () => {
      await Promise.allSettled(vi.mocked(sendHandoff).mock.results.map((r) => r.value));
      await drainPromises();
    });
    expect(vi.mocked(sendHandoff)).toHaveBeenCalledTimes(1);
    expect(reportHandedOn).not.toHaveBeenCalled();
    expect(error.mock.calls).toEqual([[expect.objectContaining({ message: 'handoff' })]]);
  });

  it('a hand-off reports the file handed on only when sendHandoff reaches its proceed step', async () => {
    preparedExportRef.current = prepared();
    vi.mocked(reportHandedOn).mockClear();
    await act(() => api.current.requestHandoff('compress'));
    await vi.mocked(sendHandoff).mock.results[0].value; // resolves once sendHandoff has parked the bytes and run proceed
    expect(reportHandedOn).toHaveBeenCalledWith('sign');
    // proceed ran after the bytes were parked: the file is really waiting for the next tool
    const parked = await takeHandoff('compress');
    expect(parked && 'fileName' in parked ? parked.fileName : null).toBe('signed_form.pdf');
    expect(vi.mocked(sendHandoff).mock.calls.at(-1)?.[0]).toBe('compress');
    await drainPromises();
    expect(reportHandedOn).toHaveBeenCalledTimes(1);
  });
});

describe('useSpeculativeExport', () => {
  it('marks what it prepares as not yet counted', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    const preparedExportRef: { current: SignedExport | null } = { current: null };
    const runExport = vi.fn(async (onSigned: (signedBlob: Blob, filename: string) => void) => onSigned(new Blob(['pdf']), 'signed_form.pdf'));
    function Probe() {
      useSpeculativeExport({
        file, outputName: 'signed_form.pdf', status: 'editing', elementCount: 1, hasTurnedPage: false, documentRevision: 0, blocked: false,
        runExport, prepare: () => true, preparedExportRef, documentRevisionRef: { current: 0 },
      });
      return null;
    }
    act(() => render(<Probe />, root));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(preparedExportRef.current).toMatchObject({ name: 'signed_form.pdf', speculative: true });
    render(null, root);
    vi.useRealTimers();
  });
});
