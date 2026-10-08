import { useEffect, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { checkSavedFile } from './check/checkSavedFile.ts';
import type { CheckOutcome } from './check/runCheck.ts';
import type { CheckBox, CheckTerm, TermResult } from './check/types.ts';
import { termFinder } from './find/finders.ts';
import type { MeasureText } from './find/matchBoxes.ts';
import { reportError } from '../../lib/errorReport.ts';
import { describeTraces, survivedRows } from './check/describeTraces.ts';
import { TRACES_ANNOUNCEMENT, TRACES_SURVIVED_ANNOUNCEMENT } from './check/checkCopy.ts';
import { hasNoTraces } from '../../editor/adapters/pdf/documentTraces.js';

/** en-GB reads "7 Oct 09:14", the approved form for a plain English page. */
export function traceLocale(): string {
  const lang = document.documentElement.lang;
  return !lang || lang === 'en' ? 'en-GB' : lang;
}

export type SavedFileCheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'failed' }
  | { status: 'done'; outcome: CheckOutcome; typed: TermResult[] };

/**
 * RED-17: checks each saved export on its own, once it exists, and drops the
 * result the moment the export goes stale (`saved` becomes null). A term the
 * person types is checked against the same reading, without reading again.
 */
export default function useSavedFileCheck({
  pdfDocument,
  originalFile,
  saved,
  boxes,
  findTerms,
  picturePages,
  measure,
  announce,
  keptAttachments = [],
}: {
  pdfDocument: PDFDocumentProxy | null;
  /** RED-59: the file as opened, read once per run to compare its traces. */
  originalFile: File | null;
  saved: Blob | null;
  boxes: CheckBox[];
  findTerms: CheckTerm[];
  picturePages: number[];
  measure?: MeasureText;
  /** Says the traces verdict once a check finishes. */
  announce?: (message: string) => void;
  /** RED-60: attachments the person kept; their survival is expected. */
  keptAttachments?: readonly string[];
}) {
  const [state, setState] = useState<SavedFileCheckState>({ status: 'idle' });

  // Only a new export starts a check; the boxes and terms it reads are the
  // ones that export was made from, since any edit clears `saved` first.
  useEffect(() => {
    if (!saved || !pdfDocument || !originalFile) {
      setState({ status: 'idle' });
      return;
    }
    let current = true;
    setState({ status: 'checking' });
    (async () => {
      try {
        const savedBytes = new Uint8Array(await saved.arrayBuffer());
        const originalBytes = new Uint8Array(await originalFile.arrayBuffer());
        const { runSavedFileCheck } = await import('./check/runCheck.ts');
        const outcome = await runSavedFileCheck({ originalDoc: pdfDocument, savedBytes, originalBytes, boxes, extraTerms: findTerms, picturePages, measure });
        if (!current) return;
        setState({ status: 'done', outcome, typed: [] });
        const { original, saved: after } = outcome.traces;
        const rows = describeTraces(original, { locale: traceLocale(), now: new Date() });
        if (survivedRows(rows, after, keptAttachments).size > 0) {
          announce?.(TRACES_SURVIVED_ANNOUNCEMENT);
          reportError('redact', new Error('trace survived export'), 'export_trace_survived');
        } else if (!hasNoTraces(original)) {
          announce?.(TRACES_ANNOUNCEMENT);
        }
      } catch (error) {
        reportError('redact', error, 'check_saved_file');
        console.error('Redact could not check the saved file', error);
        if (current) setState({ status: 'failed' });
      }
    })();
    return () => {
      current = false;
    };
  }, [saved, pdfDocument, originalFile]);

  const search = (text: string) => {
    const label = text.trim();
    if (!label || state.status !== 'done') return;
    const term: CheckTerm = { label, source: 'typed', finder: termFinder(label) };
    const [result] = checkSavedFile({ ...state.outcome.context, terms: [term] });
    setState({ ...state, typed: [...state.typed.filter((entry) => entry.term.label !== label), result] });
  };

  return { state, search };
}
