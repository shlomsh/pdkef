import { describe, expect, it, vi } from 'vitest';

const exportHighlighted = vi.fn(async () => new Uint8Array([1]));
vi.mock('./highlightedPdf.ts', () => ({ exportHighlighted: (...a: unknown[]) => (exportHighlighted as (...x: unknown[]) => unknown)(...a), highlightedFileName: (n: string) => `h_${n}` }));
vi.mock('#lib/telemetry/actionTrail.ts', () => ({ recordAction: vi.fn() }));
vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));

const { downloadHandler } = await import('./download.ts');

describe('downloadHandler', () => {
  it('writes the marks with the pages as the person turned them', async () => {
    const bytes = new ArrayBuffer(4);
    const save = vi.fn();
    await downloadHandler({ fileName: 'a.pdf', bytes: () => bytes, elements: [], pageTurns: { 0: 1 }, save })();
    expect(exportHighlighted).toHaveBeenCalledWith(bytes, [], { 0: 1 });
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'h_a.pdf');
  });

  it('does nothing without a file or its bytes', async () => {
    const save = vi.fn();
    await downloadHandler({ fileName: undefined, bytes: () => null, elements: [], pageTurns: {}, save })();
    expect(save).not.toHaveBeenCalled();
  });
});
