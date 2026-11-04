import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const readScan = vi.fn();
vi.mock('../lib/enhance/readScan.ts', () => ({ readScan: (...a: unknown[]) => readScan(...a) }));
const reportError = vi.fn();
vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
const reportMaintenanceEvent = vi.fn();
vi.mock('#lib/telemetry/maintenanceTelemetry.ts', async (original) => ({
  ...(await original<object>()),
  reportMaintenanceEvent: (...a: unknown[]) => reportMaintenanceEvent(...a),
}));

import { useScanCheck } from './useScanCheck.ts';

let idle: Array<() => void> = [];
let shown: unknown = 'unset';
let container: HTMLElement;

function Probe({ doc }: { doc: PDFDocumentProxy | null }) {
  shown = useScanCheck(doc);
  return null;
}
const mount = (doc: PDFDocumentProxy | null) => act(() => { render(<Probe doc={doc} />, container); });
/** Lets the page paint: runs what the hook queued for idle time, then the promises it started. */
const runIdle = async () => { await act(async () => { idle.splice(0).forEach((run) => run()); await new Promise((r) => setTimeout(r, 0)); }); };
const DOC = { numPages: 3 } as unknown as PDFDocumentProxy;

beforeEach(() => {
  idle = []; shown = 'unset';
  readScan.mockReset().mockResolvedValue('spread');
  reportError.mockReset(); reportMaintenanceEvent.mockReset();
  vi.stubGlobal('requestIdleCallback', (run: () => void) => { idle.push(run); return run; });
  vi.stubGlobal('cancelIdleCallback', (run: () => void) => { idle = idle.filter((queued) => queued !== run); });
  container = document.createElement('div');
});
afterEach(() => { render(null, container); vi.unstubAllGlobals(); });

describe('useScanCheck', () => {
  it('does not start reading until the page has had its idle time', async () => {
    mount(DOC);
    expect(readScan).not.toHaveBeenCalled();
    expect(shown).toBeNull();
    await runIdle();
    expect(readScan).toHaveBeenCalledTimes(1);
  });

  it('gives the verdict and reports it once for the document', async () => {
    mount(DOC);
    await runIdle();
    expect(shown).toBe('spread');
    expect(reportMaintenanceEvent).toHaveBeenCalledTimes(1);
    expect(reportMaintenanceEvent.mock.calls[0][0]).toEqual({ name: 'highlight_scan_check', properties: { outcome: 'spread' } });
    mount(DOC);
    await runIdle();
    expect(reportMaintenanceEvent).toHaveBeenCalledTimes(1);
  });

  it('leaves the verdict null and reports the error when the read fails', async () => {
    const boom = new Error('boom');
    readScan.mockRejectedValue(boom);
    mount(DOC);
    await runIdle();
    expect(shown).toBeNull();
    expect(reportError).toHaveBeenCalledWith('pdf_tool_run', boom, 'scan_check');
    expect(reportMaintenanceEvent).not.toHaveBeenCalled();
  });

  it('reports nothing for a file that was replaced before the read ended', async () => {
    let finish: (v: string | null) => void = () => {};
    readScan.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    mount(DOC);
    await runIdle();
    mount(null);
    await act(async () => { finish('spread'); await new Promise((r) => setTimeout(r, 0)); });
    expect(shown).toBeNull();
    expect(reportMaintenanceEvent).not.toHaveBeenCalled();
    expect(readScan.mock.calls[0][1]()).toBe(false);
  });

  it('never starts for a file closed before the idle time came', async () => {
    mount(DOC);
    mount(null);
    await runIdle();
    expect(readScan).not.toHaveBeenCalled();
  });

  it('falls back to a timer where there is no idle callback', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    mount(DOC);
    expect(readScan).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    vi.useRealTimers();
    expect(readScan).toHaveBeenCalledTimes(1);
  });
});
