import { describe, expect, it, vi } from 'vitest';
import { loadPdf } from './loadPdf.ts';
import { getPdfjs } from '../adapters/pdf/pdfjsLoader.js';

vi.mock('../adapters/pdf/pdfjsLoader.js', () => ({ getPdfjs: vi.fn() }));

function options(overrides: Record<string, unknown> = {}) {
  return {
    file: new File(['%PDF-1.4'], 'document.pdf', { type: 'application/pdf' }),
    bytes: new ArrayBuffer(8),
    loadIdRef: { current: 0 },
    loadControllerRef: { current: null as { cancel: () => void } | null },
    initialize: vi.fn(),
    onDocument: vi.fn(),
    clearDraft: vi.fn(),
    setStatus: vi.fn(),
    setAnnouncement: vi.fn(),
    ...overrides,
  };
}

describe('loadPdf lifecycle', () => {
  it('cancels a superseded loading task and only lets the replacement write state', async () => {
    let resolveFirst: (value: any) => void;
    const firstTask = {
      promise: new Promise((resolve) => { resolveFirst = resolve; }),
      destroy: vi.fn(),
    };
    const secondDocument = { numPages: 1, destroy: vi.fn() };
    const secondTask = { promise: Promise.resolve(secondDocument), destroy: vi.fn() };
    const getDocument = vi.fn()
      .mockReturnValueOnce(firstTask)
      .mockReturnValueOnce(secondTask);
    vi.mocked(getPdfjs).mockResolvedValue({
      getDocument,
    } as any);

    const shared = options();
    const first = loadPdf(shared);
    await vi.waitFor(() => expect(getDocument).toHaveBeenCalledOnce());
    const second = loadPdf({ ...shared, file: new File(['%PDF-1.4'], 'replacement.pdf', { type: 'application/pdf' }) });
    await second;

    expect(firstTask.destroy).toHaveBeenCalledOnce();
    expect(shared.onDocument).toHaveBeenCalledTimes(1);
    expect(shared.onDocument).toHaveBeenCalledWith(secondDocument, expect.any(Function));
    expect(shared.setStatus).toHaveBeenLastCalledWith('editing');

    // Finish the now-stale promise to prove it cannot write after replacement.
    resolveFirst!({ numPages: 99, destroy: vi.fn() });
    await first;
    expect(shared.onDocument).toHaveBeenCalledTimes(1);
  });

  it('destroys the active document when its owner unmounts', async () => {
    const document = { numPages: 1, destroy: vi.fn() };
    const task = { promise: Promise.resolve(document), destroy: vi.fn() };
    vi.mocked(getPdfjs).mockResolvedValue({ getDocument: vi.fn(() => task) } as any);
    const config = options();

    await loadPdf(config);
    config.loadControllerRef.current?.cancel();

    expect(task.destroy).toHaveBeenCalledOnce();
    expect(document.destroy).toHaveBeenCalledOnce();
  });
});
