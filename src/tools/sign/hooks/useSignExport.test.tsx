import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '../messages';
import { useLatestRun } from '#lib/hooks/useLatestRun.ts';
import { reportToolLifecycleEvent } from '#lib/telemetry/productAnalytics.ts';
import type { SignedExport } from '../lib/exportHandoff.ts';
import { useSignExport } from './useSignExport.ts';
import { useSpeculativeExport } from './useSpeculativeExport.ts';

vi.mock('#lib/telemetry/productAnalytics.ts', () => ({ reportToolLifecycleEvent: vi.fn() }));
vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));
vi.mock('#lib/telemetry/actionTrail.ts', () => ({ recordAction: vi.fn() }));
vi.mock('#lib/telemetry/maintenanceTelemetry.ts', () => ({
  beaconMaintenanceTransport: vi.fn(),
  reportMaintenanceEvent: vi.fn(),
  signExportSucceeded: vi.fn(),
  signExportFailed: vi.fn(),
}));
vi.mock('../lib/sign.js', () => ({ signPdf: vi.fn(async () => new Blob(['pdf'])) }));
vi.mock('#lib/handoff/sendHandoff.ts', () => ({ sendHandoff: vi.fn() }));

type SignExportApi = ReturnType<typeof useSignExport>;
type ShareFake = Parameters<typeof useSignExport>[0]['share'];

const file = new File(['x'], 'form.pdf');
// handleDownloadPdf does not await the export it starts, so let it finish before asserting.
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
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
    fileBytesRef: { current: null },
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
    vi.mocked(reportToolLifecycleEvent).mockClear();
    root = document.createElement('div');
    api = { current: null as unknown as SignExportApi };
    preparedExportRef = { current: null };
    share = {
      prepare: vi.fn(() => true),
      download: vi.fn(),
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
    await act(() => api.current.handleDownloadPdf());
    await settle();
    await act(() => api.current.handleDownloadPdf());
    await settle();
    expect(events()).toEqual(['tool_operation_started', 'tool_result_ready', 'tool_operation_started', 'tool_result_ready']);
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
