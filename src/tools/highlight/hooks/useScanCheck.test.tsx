import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// Spy-through: readScan assesses rendered scan pixels, which jsdom cannot paint, so each test forces its verdict on the spy.
vi.mock('../lib/enhance/readScan.ts', { spy: true });
import { readScan } from '../lib/enhance/readScan.ts';
vi.mock('#lib/telemetry/errorReport.ts', { spy: true });
vi.mock('#lib/telemetry/maintenanceTelemetry.ts', { spy: true });
import { reportError } from '#lib/telemetry/errorReport.ts';
import { reportMaintenanceEvent, resetMaintenanceEventsForTests } from '#lib/telemetry/maintenanceTelemetry.ts';

import { drainPromises } from '../../../test/support/drainPromises.ts';
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
const runIdle = async () => { await act(async () => { idle.splice(0).forEach((run) => run()); await drainPromises(); }); };
const DOC = { numPages: 3 } as unknown as PDFDocumentProxy;

beforeEach(() => {
  idle = []; shown = 'unset';
  vi.mocked(readScan).mockReset().mockResolvedValue('spread');
  vi.mocked(reportError).mockClear(); vi.mocked(reportMaintenanceEvent).mockClear(); resetMaintenanceEventsForTests();
  vi.stubGlobal('requestIdleCallback', (run: () => void) => { idle.push(run); return run; });
  vi.stubGlobal('cancelIdleCallback', (run: () => void) => { idle = idle.filter((queued) => queued !== run); });
  container = document.createElement('div');
});
afterEach(() => { render(null, container); vi.unstubAllGlobals(); });

describe('useScanCheck', () => {
  it('does not start reading until the page has had its idle time', async () => {
    mount(DOC);
    expect(vi.mocked(readScan)).not.toHaveBeenCalled();
    expect(shown).toBeNull();
    await runIdle();
    expect(vi.mocked(readScan)).toHaveBeenCalledTimes(1);
  });

  it('gives the verdict and reports it once for the document', async () => {
    mount(DOC);
    await runIdle();
    expect(shown).toBe('spread');
    expect(vi.mocked(reportMaintenanceEvent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportMaintenanceEvent).mock.calls[0][0]).toEqual({ name: 'highlight_scan_check', properties: { outcome: 'spread' } });
    mount(DOC);
    await runIdle();
    expect(vi.mocked(reportMaintenanceEvent)).toHaveBeenCalledTimes(1);
  });

  it('leaves the verdict null and reports the error when the read fails', async () => {
    const boom = new Error('boom');
    vi.mocked(readScan).mockRejectedValue(boom);
    mount(DOC);
    await runIdle();
    expect(shown).toBeNull();
    expect(vi.mocked(reportError)).toHaveBeenCalledWith('pdf_tool_run', boom, 'scan_check');
    expect(vi.mocked(reportMaintenanceEvent)).not.toHaveBeenCalled();
  });

  it('reports nothing for a file that was replaced before the read ended', async () => {
    let finish: (v: 'spread' | null) => void = () => {};
    vi.mocked(readScan).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    mount(DOC);
    await runIdle();
    mount(null);
    await act(async () => { finish('spread'); await drainPromises(); });
    expect(shown).toBeNull();
    expect(vi.mocked(reportMaintenanceEvent)).not.toHaveBeenCalled();
    expect(vi.mocked(readScan).mock.calls[0][1]()).toBe(false);
  });

  it('never starts for a file closed before the idle time came', async () => {
    mount(DOC);
    mount(null);
    await runIdle();
    expect(vi.mocked(readScan)).not.toHaveBeenCalled();
  });

  it('falls back to a timer where there is no idle callback', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    mount(DOC);
    expect(vi.mocked(readScan)).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    vi.useRealTimers();
    expect(vi.mocked(readScan)).toHaveBeenCalledTimes(1);
  });
});
