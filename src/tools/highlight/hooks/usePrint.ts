import { h } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import PrintSheets from '../components/PrintSheets.tsx';

/** The sheets get this long to render their pages before the print is given up. @testSeam */
export const PRINT_TIMEOUT_MS = 15_000;

/**
 * READ-06: a print is the sheets mounted on the body for as long as the print dialog needs them. `print(withNotes)`
 * mounts them, `window.print()` runs once their pages are ready, and they come away on `afterprint`. If they are
 * not ready in 15 s the job is dropped and reported. Render `sheets` anywhere in the tree (it portals to the body).
 */
export function usePrint({ pdfDocument, elements }: { pdfDocument: PDFDocumentProxy; elements: EditorElement[] }) {
  const [job, setJob] = useState<{ withNotes: boolean } | null>(null);
  const [ready, setReady] = useState(false);

  const print = useCallback((withNotes: boolean) => {
    setJob((current) => current ?? { withNotes });
  }, []);

  // Not ready in time: take the sheets away and say so.
  useEffect(() => {
    if (!job || ready) return;
    const timer = window.setTimeout(() => {
      reportError('pdf_render', new Error('The print sheets were not ready in time'), 'print_timeout');
      setJob(null);
    }, PRINT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [job, ready]);

  // Ready: the one moment to open the print dialog. The sheets stay until it closes.
  useEffect(() => {
    if (!job || !ready) return;
    const done = () => { setJob(null); setReady(false); };
    window.addEventListener('afterprint', done, { once: true });
    window.print();
    return () => window.removeEventListener('afterprint', done);
  }, [job, ready]);

  const onReady = useCallback(() => setReady(true), []);
  const sheets = job ? h(PrintSheets, { pdfDocument, elements, withNotes: job.withNotes, onReady }) : null;
  return { print, sheets };
}
