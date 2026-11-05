import { useCallback, useEffect, useRef } from 'preact/hooks';
import { isAbortError } from '#lib/output/abort.js';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { newPage } from '../lib/scanPages.ts';
import type { ScanPage } from '../state/scanWork.ts';
import type { ScanDispatch, SetPages } from './scanHost.ts';
import type { ScanWork } from '../state/scanWork.ts';

interface PdfPagesInput {
  work: ScanWork;
  unmountedRef: { current: boolean };
  setPages: SetPages;
  dispatch: ScanDispatch;
  /** A PDF that could not be read (protected, damaged): its name goes where a skipped file's does. */
  skipped: (names: string[]) => void;
  /** The new page through the queue, for its preview and size; the corners it arrives with are kept. */
  inspect: (page: ScanPage) => void;
}

/** PDFs coming in: each sheet becomes one page per book page, appearing as the sheet finishes. pdf.js and
 * the sheet reader load only here, when a PDF arrives, so a photo scan ships neither. */
export function useScanPdfPages({ work, unmountedRef, setPages, dispatch, skipped, inspect }: PdfPagesInput) {
  const abort = useRef(new AbortController());
  useEffect(() => () => abort.current.abort(), []);

  return useCallback(async (pdfs: File[]) => {
    const { signal } = abort.current;
    const { pdfSheets } = await import('../lib/pdfSheets.ts');
    let first = true;
    for (const pdf of pdfs) {
      try {
        for await (const { file, quads } of pdfSheets(pdf, signal)) {
          if (unmountedRef.current) return;
          const added = quads.map((quad) => ({ ...newPage(file, work.defaultFilter), quad, guessed: true, found: true, edited: true, sheet: true, opened: quad }));
          setPages((current) => [...current, ...added]);
          if (first) dispatch({ type: 'photosAdded', firstId: added[0].id });
          first = false;
          for (const page of added) inspect(page);
        }
      } catch (err) {
        if (isAbortError(err) || unmountedRef.current) return;
        reportError('pdf_tool_run', err, 'scan_open_pdf');
        skipped([pdf.name]);
      }
    }
  }, []);
}
