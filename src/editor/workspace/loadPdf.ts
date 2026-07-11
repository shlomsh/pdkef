import { getPdfjs } from '../../lib/sign.js';

type LoadStatus = 'loading' | 'editing' | 'error';

export interface PdfLoadOptions {
  file: File;
  bytes: ArrayBuffer;
  restored?: boolean;
  loadIdRef: { current: number };
  initialize: () => void;
  onDocument: (document: any, isCurrent: () => boolean) => Promise<void> | void;
  clearDraft: () => Promise<void> | void;
  setStatus: (status: LoadStatus) => void;
  setAnnouncement: (message: string) => void;
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
  initialize,
  onDocument,
  clearDraft,
  setStatus,
  setAnnouncement,
}: PdfLoadOptions) {
  const loadId = ++loadIdRef.current;
  initialize();
  setStatus('loading');

  const isCurrent = () => loadIdRef.current === loadId;
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
    const document = await lib.getDocument({ data: bytes.slice(0) }).promise;
    if (!isCurrent()) return;
    await onDocument(document, isCurrent);
    if (!isCurrent()) return;
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
  }
}
