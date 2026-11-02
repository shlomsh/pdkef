import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const reportError = vi.hoisted(() => vi.fn());
const reportToolLifecycleEvent = vi.hoisted(() => vi.fn());
vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError }));
vi.mock('#lib/telemetry/productAnalytics.ts', () => ({ reportToolLifecycleEvent }));

let sheetProps: { notes: string; onReady(): void } | null = null;
let sheetMounts = 0;
vi.mock('../components/PrintSheets.tsx', () => ({
  default: (props: { notes: string; onReady(): void }) => {
    useEffect(() => { sheetMounts += 1; }, []);
    sheetProps = props;
    return <div data-print-stub />;
  },
}));

import type { EditorElement } from '#editor/model/editorModel.ts';
import { PRINT_TIMEOUT_MS, usePrint } from './usePrint.ts';

let container: HTMLElement | null = null;
let api: ReturnType<typeof usePrint>;
const pdfDocument = {} as PDFDocumentProxy;

function Probe() {
  api = usePrint({ pdfDocument, elements: [] });
  return <>{api.sheets}</>;
}

beforeEach(() => {
  vi.useFakeTimers();
  sheetProps = null;
  sheetMounts = 0;
  reportError.mockClear();
  reportToolLifecycleEvent.mockClear();
  window.print = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<Probe />, container!));
});

afterEach(() => {
  act(() => render(null, container!));
  container!.remove();
  container = null;
  vi.useRealTimers();
});

const mounted = () => container!.querySelector('[data-print-stub]') !== null;

describe('usePrint', () => {
  it('mounts nothing until a print is asked for', () => {
    expect(mounted()).toBe(false);
    expect(window.print).not.toHaveBeenCalled();
  });

  it('passes the notes choice through, end included', () => {
    act(() => api.print('end'));
    expect(sheetProps?.notes).toBe('end');
  });

  it('mounts the sheets with the notes choice, and prints once they are ready', () => {
    act(() => api.print('beside'));
    expect(mounted()).toBe(true);
    expect(sheetProps?.notes).toBe('beside');
    expect(window.print).not.toHaveBeenCalled();
    act(() => sheetProps!.onReady());
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('takes the sheets away after the print dialog closes', () => {
    act(() => api.print('none'));
    act(() => sheetProps!.onReady());
    act(() => { window.dispatchEvent(new Event('afterprint')); });
    expect(mounted()).toBe(false);
  });

  it('does not report anything when the sheets were ready in time', () => {
    act(() => api.print('none'));
    act(() => sheetProps!.onReady());
    act(() => { vi.advanceTimersByTime(PRINT_TIMEOUT_MS + 1000); });
    expect(reportError).not.toHaveBeenCalled();
  });

  it('gives up after 15 seconds without sheets, unmounts and reports it', () => {
    expect(PRINT_TIMEOUT_MS).toBe(15_000);
    act(() => api.print('none'));
    act(() => { vi.advanceTimersByTime(PRINT_TIMEOUT_MS); });
    expect(mounted()).toBe(false);
    expect(window.print).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0]).toBe('pdf_render');
    expect(reportError.mock.calls[0][2]).toBe('print_timeout');
  });

  it('keeps the sheets after print returns with no afterprint (iOS may still be reading them), and the next print starts a new job', () => {
    act(() => api.print('none'));
    act(() => sheetProps!.onReady());
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(mounted()).toBe(true);
    act(() => api.print('beside'));
    expect(mounted()).toBe(true);
    expect(sheetProps?.notes).toBe('beside');
    act(() => sheetProps!.onReady());
    expect(window.print).toHaveBeenCalledTimes(2);
  });

  it('prints the same notes choice again after a print that never got afterprint: the sheets are a fresh run', () => {
    act(() => api.print('beside'));
    act(() => sheetProps!.onReady());
    expect(window.print).toHaveBeenCalledTimes(1);
    act(() => api.print('beside'));
    // A remount gives usePageImages new state, so its onReady fires again instead of staying "already fired".
    expect(sheetMounts).toBe(2);
    act(() => sheetProps!.onReady());
    expect(window.print).toHaveBeenCalledTimes(2);
  });

  it('a second request while one is open is ignored', () => {
    act(() => api.print('none'));
    act(() => api.print('beside'));
    expect(sheetProps?.notes).toBe('none');
  });

  describe('READ-14: a pencil mark waits for rough.js', () => {
    it('mounts the sheets only after the hatch has loaded, and ignores a second request meanwhile', async () => {
      const { _resetForTest, hatchIfLoaded } = await import('../lib/outline/hatchLoader.ts');
      _resetForTest();
      const pencil = { id: 'p', type: 'highlight', pageIndex: 0, left: 0, top: 0, width: 10, height: 10, color: '#FFF34D', style: 'pencil', bands: [{ left: 0, top: 0, width: 100, height: 100 }] } as EditorElement;
      function PencilProbe() {
        api = usePrint({ pdfDocument, elements: [pencil] });
        return <>{api.sheets}</>;
      }
      act(() => render(<PencilProbe />, container!));
      vi.useRealTimers();
      act(() => { api.print('none'); api.print('none'); });
      expect(mounted()).toBe(false);
      await vi.waitFor(() => expect(mounted()).toBe(true), { timeout: 3000 });
      expect(hatchIfLoaded()).not.toBeNull();
      await vi.waitFor(() => expect(sheetMounts).toBe(1));
    });
  });

  describe('funnel events', () => {
    const events = () => reportToolLifecycleEvent.mock.calls.map((c) => c[0]);

    it('reports started on a request, and the result just before window.print()', () => {
      act(() => api.print('none'));
      expect(events()).toEqual(['tool_operation_started']);
      expect(reportToolLifecycleEvent.mock.calls[0][1]).toBe('highlight-pdf');
      vi.mocked(window.print).mockImplementation(() => { expect(events()).toEqual(['tool_operation_started', 'tool_result_ready']); });
      act(() => sheetProps!.onReady());
      expect(window.print).toHaveBeenCalledTimes(1);
      expect(events()).toEqual(['tool_operation_started', 'tool_result_ready']);
    });

    it('reports failed with the print_timeout error and no result', () => {
      act(() => api.print('none'));
      act(() => { vi.advanceTimersByTime(PRINT_TIMEOUT_MS); });
      expect(events()).toEqual(['tool_operation_started', 'tool_operation_failed']);
      expect(reportToolLifecycleEvent.mock.calls[1][1]).toBe('highlight-pdf');
    });

    it('a request ignored while one is open reports nothing', () => {
      act(() => api.print('none'));
      act(() => api.print('beside'));
      expect(events()).toEqual(['tool_operation_started']);
    });

    it('a request that replaces a printed job starts again, with one result per job', () => {
      act(() => api.print('none'));
      act(() => sheetProps!.onReady());
      act(() => api.print('beside'));
      expect(events()).toEqual(['tool_operation_started', 'tool_result_ready', 'tool_operation_started']);
      act(() => sheetProps!.onReady());
      expect(events()).toEqual(['tool_operation_started', 'tool_result_ready', 'tool_operation_started', 'tool_result_ready']);
    });
  });
});
