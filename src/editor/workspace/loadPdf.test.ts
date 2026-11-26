import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPdf } from './loadPdf.ts';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { buildPdf } from '../../test/support/redactCheckPdfs.test-helper.ts';
import { getDocument, type PDFDocumentLoadingTask } from 'pdfjs-dist';
import '../../test/support/realPdfjs.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';

// The shipped pdf.js runs for real; the spies only read which loading tasks it opened.
vi.mock('#lib/pdf/loadPdfjs.js', { spy: true });
vi.mock('#lib/telemetry/errorReport.ts', { spy: true });
vi.mock('pdfjs-dist', { spy: true });

/** The loading task of every getDocument call so far, in order. */
const openedTasks = (): PDFDocumentLoadingTask[] => vi.mocked(getDocument).mock.results.map((r) => r.value as PDFDocumentLoadingTask);

// Real PDFs: built with pdf-lib, and the repo's encrypted fixtures.
const fixture = (name: string) => new Uint8Array(readFileSync(`${process.cwd()}/src/lib/__fixtures__/encrypted/${name}.pdf`));
const toBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const page = (lines: string[]) => ({ lines });

beforeEach(() => {
  vi.mocked(getPdfjs).mockClear();
  vi.mocked(getDocument).mockClear();
});

afterEach(() => {
  // Whatever a test left open is released, so no loading task outlives it.
  for (const task of openedTasks()) void task.destroy();
});

let plainBytes: Uint8Array;
beforeAll(async () => { plainBytes = await buildPdf([page(['one'])]); });

function options(overrides: Record<string, unknown> = {}) {
  return {
    file: new File(['%PDF-1.4'], 'document.pdf', { type: 'application/pdf' }),
    bytes: toBuffer(plainBytes),
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
    const firstBytes = await buildPdf([page(['first']), page(['second'])]);
    const shared = options({ bytes: toBuffer(firstBytes) });
    const first = loadPdf(shared);
    // loadPdf awaits this same promise before it opens its task, so by the time this resumes the first task exists
    // and no pdf.js work (a macrotask) has run: the replacement lands while the first is still loading.
    await vi.mocked(getPdfjs).mock.results[0].value;
    expect(openedTasks()).toHaveLength(1);
    const firstTask = openedTasks()[0];
    const destroyFirst = vi.spyOn(firstTask, 'destroy');
    const second = loadPdf({ ...shared, bytes: toBuffer(plainBytes), file: new File(['%PDF-1.4'], 'replacement.pdf', { type: 'application/pdf' }) });
    await second;

    expect(destroyFirst).toHaveBeenCalledOnce();
    expect(firstTask.destroyed).toBe(true);
    expect(shared.onDocument).toHaveBeenCalledTimes(1);
    const [secondDocument, isCurrent] = shared.onDocument.mock.calls[0];
    expect(secondDocument).toBe(await openedTasks()[1].promise);
    expect(secondDocument.numPages).toBe(1);
    expect(isCurrent).toEqual(expect.any(Function));
    expect(shared.setStatus).toHaveBeenLastCalledWith('editing');

    // The superseded load settles too (destroying a pending task rejects it) and cannot write after replacement.
    await first;
    await drainPromises();
    expect(shared.onDocument).toHaveBeenCalledTimes(1);
    expect(shared.setStatus).toHaveBeenLastCalledWith('editing');
  });

  it('drops and releases a superseded load whose document arrives after the replacement', async () => {
    const gate = Promise.withResolvers<void>();
    let parsed: Promise<unknown> | undefined;
    // A real loading task whose parsed document is handed over only once `gate` opens, as a load that settles late does.
    const holdOpen = (task: PDFDocumentLoadingTask) => {
      parsed = task.promise;
      Object.defineProperty(task, 'promise', { value: task.promise.then((doc) => gate.promise.then(() => doc)) });
      return task;
    };
    const { getDocument: realGetDocument } = await vi.importActual<typeof import('pdfjs-dist')>('pdfjs-dist');
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: the first load's document arrives late (a held real task); pdf.js has no way to be slow on demand
    vi.mocked(getDocument).mockImplementationOnce((params) => holdOpen(realGetDocument(params as never)));
    const shared = options({ bytes: toBuffer(await buildPdf([page(['first']), page(['second'])])) });
    const first = loadPdf(shared);
    await vi.waitUntil(() => parsed !== undefined);
    await parsed; // pdf.js has really parsed the first file; only its hand-over to loadPdf is still held
    const second = loadPdf({ ...shared, bytes: toBuffer(plainBytes), file: new File(['%PDF-1.4'], 'replacement.pdf', { type: 'application/pdf' }) });
    await second;
    expect(shared.onDocument).toHaveBeenCalledTimes(1);
    const [secondDocument] = shared.onDocument.mock.calls[0];
    expect(secondDocument.numPages).toBe(1);

    gate.resolve();
    await first;
    await drainPromises();

    expect(shared.onDocument).toHaveBeenCalledTimes(1);
    expect(shared.onDocument.mock.calls[0][0]).toBe(secondDocument);
    expect(openedTasks()[0].destroyed).toBe(true);
    expect(openedTasks()[1].destroyed).toBe(false);
    expect(shared.setStatus).toHaveBeenLastCalledWith('editing');
  });

  it('destroys the active document when its owner unmounts', async () => {
    const config = options();

    await loadPdf(config);
    const [document] = config.onDocument.mock.calls[0];
    // pdf.js's document has no destroy of its own: it is released through the loading task it belongs to.
    expect(document.loadingTask).toBe(openedTasks()[0]);
    expect(document.loadingTask.destroyed).toBe(false);
    config.loadControllerRef.current?.cancel();

    expect(document.loadingTask.destroyed).toBe(true);
  });

  it('a 20s timeout fails the load, destroys the loading task and reports nothing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); // pdf.js hangs under full fake timers
    try {
      vi.mocked(reportError).mockClear();
      const config = options();

      const loading = loadPdf(config);
      // The task exists now but pdf.js's own work (a macrotask) has not had a turn, so the real task is still
      // loading when the clock passes 20s; the synchronous advance gives it none.
      await vi.mocked(getPdfjs).mock.results[0].value;
      expect(openedTasks()).toHaveLength(1);
      vi.advanceTimersByTime(20_001);
      await loading;

      expect(config.setStatus).toHaveBeenLastCalledWith('error');
      expect(config.setAnnouncement).toHaveBeenCalledOnce();
      expect(openedTasks()).toHaveLength(1);
      expect(openedTasks()[0].destroyed).toBe(true);
      expect(reportError).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  describe('onNeedsUnlock', () => {
    it('a password-protected file reaches the callback and nothing else', async () => {
      const onNeedsUnlock = vi.fn();
      const config = options({ bytes: toBuffer(fixture('needs-password')), restored: true, onNeedsUnlock });

      await loadPdf(config);

      expect(onNeedsUnlock).toHaveBeenCalledExactlyOnceWith('needs-password');
      expect(config.onDocument).not.toHaveBeenCalled();
      expect(config.clearDraft).not.toHaveBeenCalled();
      expect(config.setStatus).not.toHaveBeenCalledWith('error');
      expect(config.setStatus).not.toHaveBeenCalledWith('editing');
      expect(openedTasks()[0].destroyed).toBe(true);
    });

    it('a file that opens but carries permissions is owner-restricted, and its document is released', async () => {
      const onNeedsUnlock = vi.fn();
      const config = options({ bytes: toBuffer(fixture('owner-only')), onNeedsUnlock });

      await loadPdf(config);

      expect(onNeedsUnlock).toHaveBeenCalledExactlyOnceWith('owner-restricted');
      expect(config.onDocument).not.toHaveBeenCalled();
      expect(config.setStatus).not.toHaveBeenCalledWith('editing');
      expect(openedTasks()[0].destroyed).toBe(true);
    });

    it('an unprotected file loads as always, callback or not', async () => {
      const onNeedsUnlock = vi.fn();
      const config = options({ bytes: toBuffer(fixture('plain')), onNeedsUnlock });

      await loadPdf(config);

      expect(onNeedsUnlock).not.toHaveBeenCalled();
      expect(config.onDocument).toHaveBeenCalledOnce();
      expect(config.setStatus).toHaveBeenLastCalledWith('editing');
      expect(openedTasks()[0].destroyed).toBe(false);
    });

    it('without a callback a password file still fails exactly as before', async () => {
      vi.spyOn(console, 'error');
      const config = options({ bytes: toBuffer(fixture('needs-password')), restored: true });

      await loadPdf(config);

      expect(config.clearDraft).toHaveBeenCalledOnce();
      expect(config.setStatus).toHaveBeenLastCalledWith('error');
    });

    it('an error that is not a password stays a failure even with a callback', async () => {
      vi.spyOn(console, 'error');
      const onNeedsUnlock = vi.fn();
      const config = options({ bytes: toBuffer(fixture('truncated')), onNeedsUnlock });

      await loadPdf(config);

      expect(onNeedsUnlock).not.toHaveBeenCalled();
      expect(config.setStatus).toHaveBeenLastCalledWith('error');
    });
  });
});
