// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

import { PDFDocument } from '@cantoo/pdf-lib';
import { buildPdf } from '../../../../test/support/redactCheckPdfs.test-helper.ts';
import { exportHighlighted } from './highlightedPdf.ts';

// Spy-through: the real export runs on real PDF bytes.
vi.mock('./highlightedPdf.ts', { spy: true });
import { reportToolLifecycleEvent, resetUsageEventsForTests } from '#lib/telemetry/productAnalytics.ts';
import { resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
vi.mock('#lib/telemetry/productAnalytics.ts', { spy: true });

const { downloadHandler, buildHandler, shareHandler } = await import('./download.ts');
const { usePdfShare } = await import('#lib/output/usePdfShare.js');

const real = await (async () => { const u = await buildPdf([{ lines: ['one'] }]); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer; })();
const corrupt = () => new ArrayBuffer(1);
const reopened = async (blob: Blob) => PDFDocument.load(await blob.arrayBuffer());

describe('downloadHandler', () => {
  beforeEach(() => { vi.mocked(reportToolLifecycleEvent).mockClear(); resetUsageEventsForTests(); resetActionTrailForTests(); });

  it('writes the marks with the pages as the person turned them', async () => {
    const bytes = real;
    const save = vi.fn();
    const saved = await downloadHandler({ outputName: 'highlighted_a.pdf', bytes: () => bytes, elements: [], pageTurns: { 0: 1 }, save })();
    expect(saved).toBe('highlighted_a.pdf');
    expect(exportHighlighted).toHaveBeenCalledWith(bytes, [], { 0: 1 });
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'highlighted_a.pdf');
    expect((await reopened(save.mock.calls[0][0])).getPage(0).getRotation().angle).toBe(90);
    expect(vi.mocked(reportToolLifecycleEvent).mock.calls).toEqual([['tool_operation_started', 'highlight-pdf'], ['tool_result_ready', 'highlight-pdf']]);
  });

  it('saves under the name the person typed, not a derived one', async () => {
    const save = vi.fn();
    const saved = await downloadHandler({ outputName: 'Lecture notes.pdf', bytes: () => real, elements: [], pageTurns: {}, save })();
    expect(saved).toBe('Lecture notes.pdf');
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'Lecture notes.pdf');
  });

  it('does nothing without a file or its bytes', async () => {
    const save = vi.fn();
    expect(await downloadHandler({ outputName: undefined, bytes: () => null, elements: [], pageTurns: {}, save })()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(vi.mocked(reportToolLifecycleEvent)).not.toHaveBeenCalled();
  });

  it('returns null when the export throws', async () => {
    const save = vi.fn();
    expect(await downloadHandler({ outputName: 'highlighted_a.pdf', bytes: corrupt, elements: [], pageTurns: {}, save })()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(vi.mocked(reportToolLifecycleEvent).mock.calls).toEqual([['tool_operation_started', 'highlight-pdf'], ['tool_operation_failed', 'highlight-pdf']]);
  });
});

describe('buildHandler', () => {
  beforeEach(() => { vi.mocked(reportToolLifecycleEvent).mockClear(); resetUsageEventsForTests(); resetActionTrailForTests(); });

  it('makes the file and its name without saving or reporting a result', async () => {
    const built = await buildHandler({ outputName: 'highlighted_a.pdf', bytes: () => real, elements: [], pageTurns: {} })();
    expect(built?.fileName).toBe('highlighted_a.pdf');
    expect(built?.blob.type).toBe('application/pdf');
    expect(vi.mocked(reportToolLifecycleEvent).mock.calls).toEqual([['tool_operation_started', 'highlight-pdf']]);
  });

  it('returns null without a file, and when the export throws', async () => {
    expect(await buildHandler({ outputName: undefined, bytes: () => null, elements: [], pageTurns: {} })()).toBeNull();
    expect(await buildHandler({ outputName: 'a.pdf', bytes: corrupt, elements: [], pageTurns: {} })()).toBeNull();
    expect(vi.mocked(reportToolLifecycleEvent)).toHaveBeenLastCalledWith('tool_operation_failed', 'highlight-pdf');
  });
});

describe('shareHandler', () => {
  // The real usePdfShare prepares the file; what the native share sheet is handed is read off the sheet.
  const sheets: File[][] = [];
  let share: ReturnType<typeof usePdfShare>;
  let host: HTMLElement;
  function Probe() { share = usePdfShare(); return null; }
  beforeEach(() => {
    vi.mocked(reportToolLifecycleEvent).mockClear(); resetUsageEventsForTests(); resetActionTrailForTests();
    sheets.length = 0;
    // Forced: jsdom has no navigator.share, so the sheet is a function that records the files it is handed.
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: { files: File[] }) => { sheets.push(data.files); } });
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(h(Probe, null), host));
  });
  afterEach(() => {
    act(() => render(null, host));
    host.remove();
    delete (navigator as { share?: unknown }).share;
  });
  const input = { outputName: 'highlighted_a.pdf', bytes: () => real, elements: [], pageTurns: {} };
  const shared = async () => { await act(async () => { await share.sharePrepared(); }); return sheets.flat().map((file) => ({ name: file.name, type: file.type })); };

  it('builds the file, hands it to prepare, and reports it ready', async () => {
    let ready: boolean | undefined;
    await act(async () => { ready = await shareHandler({ ...input, prepare: share.prepare })(); });
    expect(ready).toBe(true);
    expect(await shared()).toEqual([{ name: 'highlighted_a.pdf', type: 'application/pdf' }]);
    expect(vi.mocked(reportToolLifecycleEvent).mock.calls).toEqual([['tool_operation_started', 'highlight-pdf'], ['tool_result_ready', 'highlight-pdf']]);
  });

  it('returns false when the browser cannot share the file', async () => {
    delete (navigator as { share?: unknown }).share;
    expect(typeof navigator.share).toBe('undefined');
    let ready: boolean | undefined;
    await act(async () => { ready = await shareHandler({ ...input, prepare: share.prepare })(); });
    expect(ready).toBe(false);
    expect(vi.mocked(reportToolLifecycleEvent).mock.calls).toEqual([['tool_operation_started', 'highlight-pdf']]);
  });

  it('returns false without prepare when nothing was built', async () => {
    let ready: boolean | undefined;
    await act(async () => { ready = await shareHandler({ ...input, outputName: undefined, prepare: share.prepare })(); });
    expect(ready).toBe(false);
    expect(share.shareReady).toBe(false);
    expect(await shared()).toEqual([]);
  });
});
