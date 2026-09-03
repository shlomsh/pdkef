import { getPdfjs } from '../adapters/pdf/pdfjsLoader.js';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';

type LoadStatus = 'loading' | 'editing' | 'error';

export interface PdfLoadOptions {
  file: File;
  bytes: ArrayBuffer;
  restored?: boolean;
  loadIdRef: { current: number };
  /** The active loader owns both pdf.js handles until it is replaced or unmounted. */
  loadControllerRef: { current: PdfLoadController | null };
  initialize: () => void;
  onDocument: (document: PDFDocumentProxy, isCurrent: () => boolean) => Promise<void> | void;
  clearDraft: () => Promise<void> | void;
  setStatus: (status: LoadStatus) => void;
  setAnnouncement: (message: string) => void;
}

export interface PdfLoadController {
  cancel: () => void;
}

function disposePdfHandle(handle: unknown) {
  if (!handle || typeof handle !== 'object') return;
  const destroy = Reflect.get(handle, 'destroy');
  if (typeof destroy !== 'function') return;
  // pdf.js rejects the loading/render promise when cancelled. That rejection is
  // expected here, and must not become an unhandled rejection while a newer
  // document is loading.
  void Promise.resolve(destroy.call(handle)).catch(() => {});
}

/**
 * Loads a source PDF for either editor with one race guard and timeout policy.
 * Tool-specific state is deliberately supplied as callbacks: Sign owns page-size
 * loading and its reducer, while Redact owns its simpler page state.
 */
export async function loadPdf({
  file,
  bytes,
  restored = false,
  loadIdRef,
  loadControllerRef,
  initialize,
  onDocument,
  clearDraft,
  setStatus,
  setAnnouncement,
}: PdfLoadOptions) {
  // A replacement is an ownership transfer: make the old load unable to write
  // state before beginning the new one, and release its worker/document work.
  loadControllerRef.current?.cancel();
  const loadId = ++loadIdRef.current;
  let cancelled = false;
  let loadingTask: PDFDocumentLoadingTask | null = null;
  let document: PDFDocumentProxy | null = null;
  let completed = false;
  const controller: PdfLoadController = {
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      disposePdfHandle(loadingTask);
      disposePdfHandle(document);
      if (loadControllerRef.current === controller) {
        loadControllerRef.current = null;
      }
    },
  };
  loadControllerRef.current = controller;
  initialize();
  setStatus('loading');

  const isCurrent = () => !cancelled && loadIdRef.current === loadId && loadControllerRef.current === controller;
  const fail = (message: string) => {
    if (!isCurrent()) return;
    if (restored) void clearDraft();
    setStatus('error');
    setAnnouncement(message);
  };

  const timeoutId = window.setTimeout(() => {
    if (!isCurrent()) return;
    loadIdRef.current++;
    if (restored) void clearDraft();
    setStatus('error');
    setAnnouncement('This PDF is taking too long to load - it may be corrupted. Please try a different file.');
  }, 20_000);

  try {
    const lib = await getPdfjs();
    if (!isCurrent()) return;
    loadingTask = lib.getDocument({ data: bytes.slice(0) });
    document = await loadingTask.promise;
    if (!isCurrent()) {
      // A loading task can resolve at the exact moment it is replaced. Its
      // controller was already cancelled, so dispose the newly surfaced
      // document here rather than retaining a worker/document orphan.
      disposePdfHandle(document);
      return;
    }
    await onDocument(document, isCurrent);
    if (!isCurrent()) return;
    completed = true;
    setStatus('editing');
    setAnnouncement(
      restored
        ? `Restored your last draft of "${file.name}".`
        : `Loaded PDF "${file.name}" with ${document.numPages} pages.`,
    );
  } catch (error) {
    if (!isCurrent()) return;
    console.error(error);
    fail('Failed to load PDF file.');
  } finally {
    window.clearTimeout(timeoutId);
    // The completed, current controller retains its document for the canvas.
    // Every other path (error, timeout, replacement, unmount) releases it.
    if (!completed) controller.cancel();
  }
}
