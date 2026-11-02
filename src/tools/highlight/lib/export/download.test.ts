import { beforeEach, describe, expect, it, vi } from 'vitest';

const exportHighlighted = vi.fn(async () => new Uint8Array([1]));
vi.mock('./highlightedPdf.ts', () => ({ exportHighlighted: (...a: unknown[]) => (exportHighlighted as (...x: unknown[]) => unknown)(...a) }));
vi.mock('#lib/telemetry/actionTrail.ts', () => ({ recordAction: vi.fn() }));
const reportToolLifecycleEvent = vi.hoisted(() => vi.fn());
vi.mock('#lib/telemetry/productAnalytics.ts', () => ({ reportToolLifecycleEvent }));
vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));

const { downloadHandler } = await import('./download.ts');

describe('downloadHandler', () => {
  beforeEach(() => reportToolLifecycleEvent.mockClear());

  it('writes the marks with the pages as the person turned them', async () => {
    const bytes = new ArrayBuffer(4);
    const save = vi.fn();
    const saved = await downloadHandler({ outputName: 'highlighted_a.pdf', bytes: () => bytes, elements: [], pageTurns: { 0: 1 }, save })();
    expect(saved).toBe('highlighted_a.pdf');
    expect(exportHighlighted).toHaveBeenCalledWith(bytes, [], { 0: 1 });
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'highlighted_a.pdf');
    expect(reportToolLifecycleEvent.mock.calls).toEqual([['tool_operation_started', 'highlight-pdf'], ['tool_result_ready', 'highlight-pdf']]);
  });

  it('saves under the name the person typed, not a derived one', async () => {
    const save = vi.fn();
    const saved = await downloadHandler({ outputName: 'Lecture notes.pdf', bytes: () => new ArrayBuffer(1), elements: [], pageTurns: {}, save })();
    expect(saved).toBe('Lecture notes.pdf');
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'Lecture notes.pdf');
  });

  it('does nothing without a file or its bytes', async () => {
    const save = vi.fn();
    expect(await downloadHandler({ outputName: undefined, bytes: () => null, elements: [], pageTurns: {}, save })()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(reportToolLifecycleEvent).not.toHaveBeenCalled();
  });

  it('returns null when the export throws', async () => {
    exportHighlighted.mockRejectedValueOnce(new Error('boom'));
    const save = vi.fn();
    expect(await downloadHandler({ outputName: 'highlighted_a.pdf', bytes: () => new ArrayBuffer(1), elements: [], pageTurns: {}, save })()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(reportToolLifecycleEvent.mock.calls).toEqual([['tool_operation_started', 'highlight-pdf'], ['tool_operation_failed', 'highlight-pdf']]);
  });
});
