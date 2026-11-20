import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PDFDocument } from '@cantoo/pdf-lib';
import { buildPdf } from '../../../../test/support/redactCheckPdfs.test-helper.ts';
import { exportHighlighted } from './highlightedPdf.ts';

// Spy-through: the real export runs on real PDF bytes.
vi.mock('./highlightedPdf.ts', { spy: true });
import { reportToolLifecycleEvent, resetUsageEventsForTests } from '#lib/telemetry/productAnalytics.ts';
import { resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
vi.mock('#lib/telemetry/productAnalytics.ts', { spy: true });

const { downloadHandler, buildHandler, shareHandler } = await import('./download.ts');

const real = await (async () => { const u = await buildPdf([{ lines: ['one'] }]); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer; })();
const corrupt = () => new ArrayBuffer(1);
const reopened = async (blob: Blob) => PDFDocument.load(await new Response(blob).arrayBuffer());

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
  beforeEach(() => { vi.mocked(reportToolLifecycleEvent).mockClear(); resetUsageEventsForTests(); resetActionTrailForTests(); });
  const input = { outputName: 'highlighted_a.pdf', bytes: () => real, elements: [], pageTurns: {} };

  it('builds the file, hands it to prepare, and reports it ready', async () => {
    const prepare = vi.fn(() => true);
    expect(await shareHandler({ ...input, prepare })()).toBe(true);
    expect(prepare).toHaveBeenCalledWith(expect.any(Blob), 'highlighted_a.pdf');
    expect(vi.mocked(reportToolLifecycleEvent).mock.calls).toEqual([['tool_operation_started', 'highlight-pdf'], ['tool_result_ready', 'highlight-pdf']]);
  });

  it('returns false when the browser cannot share the file', async () => {
    expect(await shareHandler({ ...input, prepare: () => false })()).toBe(false);
    expect(vi.mocked(reportToolLifecycleEvent).mock.calls).toEqual([['tool_operation_started', 'highlight-pdf']]);
  });

  it('returns false without prepare when nothing was built', async () => {
    const prepare = vi.fn(() => true);
    expect(await shareHandler({ ...input, outputName: undefined, prepare })()).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });
});
