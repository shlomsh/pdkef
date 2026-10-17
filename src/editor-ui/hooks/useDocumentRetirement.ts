import { useCallback, useEffect, useRef } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * RED-56: a pdf.js document that components hold as a prop must outlive the render that still
 * reads it. `loadPdf`'s replacement cancels the old load before Preact commits the new
 * `pdfDocument`, so destroying there let a canvas or glyph read call into a dead transport.
 * The tool hands the old document here instead (`retireDocument` on loadPdf), and it is destroyed
 * in an effect, after the commit in which `committed` no longer is that document, or on unmount.
 */
export function useDocumentRetirement(committed: PDFDocumentProxy | null) {
  const pending = useRef(new Map<PDFDocumentProxy, () => void>());
  const committedRef = useRef(committed);
  const unmountedRef = useRef(false);
  committedRef.current = committed;

  // Runs after every commit, so a document retired mid-load is released by the first commit that
  // no longer renders it - including one that was published and replaced before it ever rendered.
  useEffect(() => {
    for (const [document, release] of pending.current) {
      if (document === committedRef.current) continue;
      pending.current.delete(document);
      release();
    }
  });

  useEffect(() => () => {
    unmountedRef.current = true;
    for (const release of pending.current.values()) release();
    pending.current.clear();
  }, []);

  return useCallback((document: PDFDocumentProxy, release: () => void) => {
    // Unmounted already: no render can still be reading it.
    if (unmountedRef.current) release();
    else pending.current.set(document, release);
  }, []);
}
