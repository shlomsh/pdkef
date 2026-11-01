import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const reportError = vi.hoisted(() => vi.fn());
vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError }));

let sheetProps: { withNotes: boolean; onReady(): void } | null = null;
vi.mock('../components/PrintSheets.tsx', () => ({
  default: (props: { withNotes: boolean; onReady(): void }) => {
    sheetProps = props;
    return <div data-print-stub />;
  },
}));

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
  reportError.mockClear();
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

  it('mounts the sheets with the notes choice, and prints once they are ready', () => {
    act(() => api.print(true));
    expect(mounted()).toBe(true);
    expect(sheetProps?.withNotes).toBe(true);
    expect(window.print).not.toHaveBeenCalled();
    act(() => sheetProps!.onReady());
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('takes the sheets away after the print dialog closes', () => {
    act(() => api.print(false));
    act(() => sheetProps!.onReady());
    act(() => { window.dispatchEvent(new Event('afterprint')); });
    expect(mounted()).toBe(false);
  });

  it('does not report anything when the sheets were ready in time', () => {
    act(() => api.print(false));
    act(() => sheetProps!.onReady());
    act(() => { vi.advanceTimersByTime(PRINT_TIMEOUT_MS + 1000); });
    expect(reportError).not.toHaveBeenCalled();
  });

  it('gives up after 15 seconds without sheets, unmounts and reports it', () => {
    expect(PRINT_TIMEOUT_MS).toBe(15_000);
    act(() => api.print(false));
    act(() => { vi.advanceTimersByTime(PRINT_TIMEOUT_MS); });
    expect(mounted()).toBe(false);
    expect(window.print).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0]).toBe('pdf_render');
    expect(reportError.mock.calls[0][2]).toBe('print_timeout');
  });

  it('clears the job 1 s after print returns when afterprint never fires, and a second print starts a new job', () => {
    act(() => api.print(false));
    act(() => sheetProps!.onReady());
    expect(mounted()).toBe(true);
    act(() => { vi.advanceTimersByTime(999); });
    expect(mounted()).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(mounted()).toBe(false);
    act(() => api.print(true));
    expect(mounted()).toBe(true);
    expect(sheetProps?.withNotes).toBe(true);
    act(() => sheetProps!.onReady());
    expect(window.print).toHaveBeenCalledTimes(2);
  });

  it('a second request while one is open is ignored', () => {
    act(() => api.print(false));
    act(() => api.print(true));
    expect(sheetProps?.withNotes).toBe(false);
  });
});
