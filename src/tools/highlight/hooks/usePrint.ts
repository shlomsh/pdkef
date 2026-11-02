import { h } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { PageTurns } from '#editor/geometry/pageTurn.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { reportToolLifecycleEvent } from '#lib/telemetry/productAnalytics.ts';
import { hatchIfLoaded, loadHatch } from '../lib/outline/hatchLoader.ts';
import type { PrintNotes } from '../lib/print/printMenu.ts';
import PrintSheets from '../components/PrintSheets.tsx';

/** The sheets get this long to render their pages before the print is given up. @testSeam */
export const PRINT_TIMEOUT_MS = 15_000;

/**
 * READ-06: a print is the sheets mounted on the body for as long as the print dialog needs them. `print(notes)`
 * mounts them, `window.print()` runs once their pages are ready, and they come away on `afterprint`. If they are
 * not ready in 15 s the job is dropped and reported. Render `sheets` anywhere in the tree (it portals to the body).
 * A browser that never fires `afterprint` (iOS Safari) keeps its sheets until the next print replaces them: taking
 * them away on a timer could pull them from a print sheet that is still reading them.
 */
export function usePrint({ pdfDocument, elements, pageTurns }: { pdfDocument: PDFDocumentProxy; elements: EditorElement[]; pageTurns?: PageTurns }) {
  const [job, setJob] = useState<{ notes: PrintNotes; id: number } | null>(null);
  const [ready, setReady] = useState(false);
  // The open job has been sent to window.print(), so a new request replaces it instead of waiting for afterprint.
  const printed = useRef(false);

  // Each job has its own id, which keys the sheets: a repeat print remounts them, so they render and report ready afresh.
  const jobs = useRef(0);

  // A job is open from its request until its sheets come away, so a request made meanwhile is ignored (and unreported).
  const open = useRef(false);

  const begin = useCallback((notes: PrintNotes) => {
    if (printed.current) {
      printed.current = false;
      setReady(false);
      setJob({ notes, id: ++jobs.current });
      reportToolLifecycleEvent('tool_operation_started', 'highlight-pdf');
      return;
    }
    if (open.current) return;
    open.current = true;
    reportToolLifecycleEvent('tool_operation_started', 'highlight-pdf');
    setJob({ notes, id: ++jobs.current });
  }, []);

  // READ-14: a Pencil mark prints from rough.js's strokes, so the sheets wait for it (a few ms once cached) instead of printing the mark blank.
  const hasPencil = useRef(false);
  hasPencil.current = elements.some((el) => el.type === 'highlight' && el.style === 'pencil');
  const loadingHatch = useRef(false);
  const print = useCallback((notes: PrintNotes) => {
    if (loadingHatch.current) return;
    if (!hasPencil.current || hatchIfLoaded()) { begin(notes); return; }
    loadingHatch.current = true;
    loadHatch().catch((err) => reportError('pdf_render', err, 'draw_mark_hatch')).finally(() => { loadingHatch.current = false; begin(notes); });
  }, [begin]);

  // Not ready in time: take the sheets away and say so.
  useEffect(() => {
    if (!job || ready) return;
    const timer = window.setTimeout(() => {
      reportError('pdf_render', new Error('The print sheets were not ready in time'), 'print_timeout');
      reportToolLifecycleEvent('tool_operation_failed', 'highlight-pdf');
      open.current = false;
      setJob(null);
    }, PRINT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [job, ready]);

  // Ready: the one moment to open the print dialog. The sheets stay until it closes.
  useEffect(() => {
    if (!job || !ready) return;
    const done = () => { printed.current = false; open.current = false; setJob(null); setReady(false); };
    window.addEventListener('afterprint', done, { once: true });
    // The page cannot know whether the reader confirms the dialog, so reaching it is the result.
    reportToolLifecycleEvent('tool_result_ready', 'highlight-pdf');
    window.print();
    printed.current = true;
    return () => window.removeEventListener('afterprint', done);
  }, [job, ready]);

  const onReady = useCallback(() => setReady(true), []);
  const sheets = job ? h(PrintSheets, { key: job.id, pdfDocument, elements, pageTurns, notes: job.notes, onReady }) : null;
  return { print, sheets };
}
