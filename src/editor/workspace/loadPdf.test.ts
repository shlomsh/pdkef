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

  describe('onNeedsUnlock', () => {
    const passwordError = Object.assign(new Error('No password given'), { name: 'PasswordException' });

    it('a password-protected file reaches the callback and nothing else', async () => {
      const task = { promise: Promise.reject(passwordError), destroy: vi.fn() };
      vi.mocked(getPdfjs).mockResolvedValue({ getDocument: vi.fn(() => task) } as any);
      const onNeedsUnlock = vi.fn();
      const config = options({ restored: true, onNeedsUnlock });

      await loadPdf(config);

      expect(onNeedsUnlock).toHaveBeenCalledExactlyOnceWith('needs-password');
      expect(config.onDocument).not.toHaveBeenCalled();
      expect(config.clearDraft).not.toHaveBeenCalled();
      expect(config.setStatus).not.toHaveBeenCalledWith('error');
      expect(config.setStatus).not.toHaveBeenCalledWith('editing');
      expect(task.destroy).toHaveBeenCalledOnce();
    });

    it('a file that opens but carries permissions is owner-restricted, and its document is released', async () => {
      const document = { numPages: 1, getPermissions: vi.fn(async () => []), destroy: vi.fn() };
      const task = { promise: Promise.resolve(document), destroy: vi.fn() };
      vi.mocked(getPdfjs).mockResolvedValue({ getDocument: vi.fn(() => task) } as any);
      const onNeedsUnlock = vi.fn();
      const config = options({ onNeedsUnlock });

      await loadPdf(config);

      expect(onNeedsUnlock).toHaveBeenCalledExactlyOnceWith('owner-restricted');
      expect(config.onDocument).not.toHaveBeenCalled();
      expect(config.setStatus).not.toHaveBeenCalledWith('editing');
      expect(document.destroy).toHaveBeenCalledOnce();
    });

    it('an unprotected file loads as always, callback or not', async () => {
      const document = { numPages: 1, getPermissions: vi.fn(async () => null), destroy: vi.fn() };
      vi.mocked(getPdfjs).mockResolvedValue({ getDocument: vi.fn(() => ({ promise: Promise.resolve(document), destroy: vi.fn() })) } as any);
      const onNeedsUnlock = vi.fn();
      const config = options({ onNeedsUnlock });

      await loadPdf(config);

      expect(onNeedsUnlock).not.toHaveBeenCalled();
      expect(config.onDocument).toHaveBeenCalledOnce();
      expect(config.setStatus).toHaveBeenLastCalledWith('editing');
    });

    it('without a callback a password file still fails exactly as before', async () => {
      vi.mocked(getPdfjs).mockResolvedValue({ getDocument: vi.fn(() => ({ promise: Promise.reject(passwordError), destroy: vi.fn() })) } as any);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const config = options({ restored: true });

      await loadPdf(config);

      expect(config.clearDraft).toHaveBeenCalledOnce();
      expect(config.setStatus).toHaveBeenLastCalledWith('error');
    });

    it('an error that is not a password stays a failure even with a callback', async () => {
      vi.mocked(getPdfjs).mockResolvedValue({ getDocument: vi.fn(() => ({ promise: Promise.reject(new Error('boom')), destroy: vi.fn() })) } as any);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const onNeedsUnlock = vi.fn();
      const config = options({ onNeedsUnlock });

      await loadPdf(config);

      expect(onNeedsUnlock).not.toHaveBeenCalled();
      expect(config.setStatus).toHaveBeenLastCalledWith('error');
    });
  });
});
