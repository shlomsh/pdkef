import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const reportError = vi.hoisted(() => vi.fn());
const reportToolLifecycleEvent = vi.hoisted(() => vi.fn());
vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError }));
vi.mock('#lib/telemetry/productAnalytics.ts', () => ({ reportToolLifecycleEvent }));
// Spy-through: the real PrintSheets runs; the one forced line below stands in for pdf.js painting a page, which jsdom cannot do.
vi.mock('#lib/pdf/renderPage.js', { spy: true });

import type { EditorElement } from '#editor/model/editorModel.ts';
import { renderPageToCanvas } from '#lib/pdf/renderPage.js';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import { PRINT_TIMEOUT_MS, usePrint } from './usePrint.ts';

let container: HTMLElement | null = null;
let api: ReturnType<typeof usePrint>;
// One real-looking page: the sheets read its size, ask the renderer for its picture, and wait for that picture to load.
const pdfDocument = {
  numPages: 1,
  getPage: async () => ({ rotate: 0, getViewport: () => ({ width: 600, height: 800 }) }),
} as unknown as PDFDocumentProxy;
const band = { left: 0, top: 0, width: 100, height: 100 };
const noted = [
  { id: 'h', type: 'highlight', pageIndex: 0, color: '#fde047', left: 10, top: 20, width: 50, height: 5, bands: [band] },
  { id: 'c', type: 'comment', pageIndex: 0, left: 0, top: 0, width: 0, height: 0, comment: 'a note', anchor: { kind: 'element', elementId: 'h' } },
] as EditorElement[];

function Probe() {
  api = usePrint({ pdfDocument, elements: noted });
  return <>{api.sheets}</>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(renderPageToCanvas).mockImplementation(async () => ({ width: 800, height: 1000, getContext: () => null, toDataURL: () => 'data:image/png;base64,AAAA' }) as never);
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

const root = () => document.body.querySelector('[data-print-root]');
const mounted = () => root() !== null;
// The sheets have rendered their page pictures; the browser has not yet told them each one loaded.
const picturesIn = () => waitUntil(() => { if (!root()?.querySelector('img')) throw new Error('no page picture yet'); });
// The page pictures have loaded: the sheets are ready, and the hook opens the print dialog.
const finishLoading = async () => {
  await picturesIn();
  act(() => { root()!.querySelectorAll('img').forEach((img) => img.dispatchEvent(new Event('load'))); });
};

describe('usePrint', () => {
  it('mounts nothing until a print is asked for', () => {
    expect(mounted()).toBe(false);
    expect(window.print).not.toHaveBeenCalled();
  });

  it('passes the notes choice through, end included', async () => {
    act(() => api.print('end'));
    await picturesIn();
    await waitUntil(() => { if (!root()!.querySelector('[data-print-notes-sheet]')) throw new Error('no notes sheet yet'); });
    expect(root()!.querySelectorAll('[data-print-card]')).toHaveLength(0);
  });

  it('mounts the sheets with the notes choice, and prints once they are ready', async () => {
    act(() => api.print('beside'));
    expect(mounted()).toBe(true);
    await picturesIn();
    await waitUntil(() => { if (!root()!.querySelector('[data-print-card]')) throw new Error('no card yet'); });
    expect(root()!.querySelector('[data-print-notes-sheet]')).toBeNull();
    expect(window.print).not.toHaveBeenCalled();
    await finishLoading();
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('takes the sheets away after the print dialog closes', async () => {
    act(() => api.print('none'));
    await finishLoading();
    act(() => { window.dispatchEvent(new Event('afterprint')); });
    expect(mounted()).toBe(false);
  });

  it('does not report anything when the sheets were ready in time', async () => {
    act(() => api.print('none'));
    await finishLoading();
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

  it('keeps the sheets after print returns with no afterprint (iOS may still be reading them), and the next print starts a new job', async () => {
    act(() => api.print('none'));
    await finishLoading();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(mounted()).toBe(true);
    act(() => api.print('beside'));
    expect(mounted()).toBe(true);
    await waitUntil(() => { if (!root()!.querySelector('[data-print-card]')) throw new Error('no card yet'); });
    await finishLoading();
    expect(window.print).toHaveBeenCalledTimes(2);
  });

  it('prints the same notes choice again after a print that never got afterprint: the sheets are a fresh run', async () => {
    act(() => api.print('beside'));
    await finishLoading();
    expect(window.print).toHaveBeenCalledTimes(1);
    const firstRun = root();
    act(() => api.print('beside'));
    // A remount gives usePageImages new state, so its onReady fires again instead of staying "already fired".
    expect(root()).not.toBe(firstRun);
    await finishLoading();
    expect(window.print).toHaveBeenCalledTimes(2);
  });

  it('a second request while one is open is ignored', async () => {
    act(() => api.print('none'));
    act(() => api.print('beside'));
    await picturesIn();
    await act(async () => { await drainPromises(); });
    expect(root()!.querySelectorAll('[data-print-card]')).toHaveLength(0);
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
      expect(document.body.querySelectorAll('[data-print-root]')).toHaveLength(1);
    });
  });

  describe('funnel events', () => {
    const events = () => reportToolLifecycleEvent.mock.calls.map((c) => c[0]);

    it('reports started on a request, and the result just before window.print()', async () => {
      act(() => api.print('none'));
      expect(events()).toEqual(['tool_operation_started']);
      expect(reportToolLifecycleEvent.mock.calls[0][1]).toBe('highlight-pdf');
      vi.mocked(window.print).mockImplementation(() => { expect(events()).toEqual(['tool_operation_started', 'tool_result_ready']); });
      await finishLoading();
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

    it('a request that replaces a printed job starts again, with one result per job', async () => {
      act(() => api.print('none'));
      await finishLoading();
      act(() => api.print('beside'));
      expect(events()).toEqual(['tool_operation_started', 'tool_result_ready', 'tool_operation_started']);
      await finishLoading();
      expect(events()).toEqual(['tool_operation_started', 'tool_result_ready', 'tool_operation_started', 'tool_result_ready']);
    });
  });
});
