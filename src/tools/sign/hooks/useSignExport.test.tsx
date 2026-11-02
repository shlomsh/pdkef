// @ts-nocheck - test-only, mirrors usePreparedOutput.test.tsx's untyped style
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '../messages';
import { useLatestRun } from '#lib/hooks/useLatestRun.ts';
import { reportToolLifecycleEvent } from '#lib/telemetry/productAnalytics.ts';
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

const file = new File(['x'], 'form.pdf');
// handleDownloadPdf does not await the export it starts, so let it finish before asserting.
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));
const events = () => reportToolLifecycleEvent.mock.calls.map(([name]) => name);

function Harness({ apiRef, share, preparedExportRef }) {
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
  let root;
  let api;
  let share;
  let preparedExportRef;
  beforeEach(() => {
    reportToolLifecycleEvent.mockClear();
    root = document.createElement('div');
    api = { current: null };
    preparedExportRef = { current: null };
    share = {
      prepare: vi.fn(() => true),
      download: vi.fn(),
      downloadPrepared: vi.fn(() => true),
      sharePrepared: vi.fn(async () => ({ status: 'shared' })),
      clearPrepared: vi.fn(),
    };
    act(() => render(<Harness apiRef={api} share={share} preparedExportRef={preparedExportRef} />, root));
  });
  afterEach(() => render(null, root));

  const prepared = (extra = {}) => ({ blob: new Blob(['pdf']), name: 'signed_form.pdf', revision: 0, ...extra });

  it('counts a download served from the file the background run prepared', async () => {
    preparedExportRef.current = prepared({ speculative: true });
    await act(() => api.current.handleDownloadPdf());
    expect(share.downloadPrepared).toHaveBeenCalled();
    expect(events()).toEqual(['tool_operation_started', 'tool_result_ready']);
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
    const preparedExportRef = { current: null };
    const runExport = vi.fn(async (onSigned) => onSigned(new Blob(['pdf']), 'signed_form.pdf'));
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
