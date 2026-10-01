import { useEffect, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { checkSavedFile } from './check/checkSavedFile.ts';
import type { CheckOutcome } from './check/runCheck.ts';
import type { CheckBox, CheckTerm, TermResult } from './check/types.ts';
import { termFinder } from './find/finders.ts';
import type { MeasureText } from './find/matchBoxes.ts';
import { reportError } from '../../lib/errorReport.ts';

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
  saved,
  boxes,
  findTerms,
  picturePages,
  measure,
}: {
  pdfDocument: PDFDocumentProxy | null;
  saved: Blob | null;
  boxes: CheckBox[];
  findTerms: CheckTerm[];
  picturePages: number[];
  measure?: MeasureText;
}) {
  const [state, setState] = useState<SavedFileCheckState>({ status: 'idle' });

  // Only a new export starts a check; the boxes and terms it reads are the
  // ones that export was made from, since any edit clears `saved` first.
  useEffect(() => {
    if (!saved || !pdfDocument) {
      setState({ status: 'idle' });
      return;
    }
    let current = true;
    setState({ status: 'checking' });
    (async () => {
      try {
        const savedBytes = new Uint8Array(await saved.arrayBuffer());
        const { runSavedFileCheck } = await import('./check/runCheck.ts');
        const outcome = await runSavedFileCheck({ originalDoc: pdfDocument, savedBytes, boxes, extraTerms: findTerms, picturePages, measure });
        if (current) setState({ status: 'done', outcome, typed: [] });
      } catch (error) {
        reportError('redact', error);
        console.error('Redact could not check the saved file', error);
        if (current) setState({ status: 'failed' });
      }
    })();
    return () => {
      current = false;
    };
  }, [saved, pdfDocument]);

  const search = (text: string) => {
    const label = text.trim();
    if (!label || state.status !== 'done') return;
    const term: CheckTerm = { label, source: 'typed', finder: termFinder(label) };
    const [result] = checkSavedFile({ ...state.outcome.context, terms: [term] });
    setState({ ...state, typed: [...state.typed.filter((entry) => entry.term.label !== label), result] });
  };

  return { state, search };
}
