import type { EditorElement } from '#editor/model/editorModel.ts';
import type { PageTurns } from '#editor/geometry/pageTurn.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { reportToolLifecycleEvent } from '#lib/telemetry/productAnalytics.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { exportHighlighted } from './highlightedPdf.ts';

/**
 * Download: the bytes the session holds (the file with its old highlights already read out of it), turned as the
 * person turned the pages, with the marks written on top.
 */
export function downloadHandler({ outputName, bytes, elements, pageTurns, save }: {
  /** The final saved name (prefix, the person's own or the source's name, extension). */
  outputName: string | undefined;
  bytes: () => ArrayBuffer | null | undefined;
  elements: EditorElement[];
  pageTurns: PageTurns;
  save(blob: Blob, name: string): void;
}) {
  /** The saved file name, or null when nothing was saved. */
  return async (): Promise<string | null> => {
    const source = bytes();
    if (!outputName || !source) return null;
    reportToolLifecycleEvent('tool_operation_started', 'highlight-pdf');
    try {
      const out = await exportHighlighted(source, elements, pageTurns);
      recordAction('download');
      const name = outputName;
      save(new Blob([out as BlobPart], { type: 'application/pdf' }), name);
      reportToolLifecycleEvent('tool_result_ready', 'highlight-pdf');
      return name;
    } catch (err) {
      reportError('pdf_tool_run', err, 'export_highlighted');
      reportToolLifecycleEvent('tool_operation_failed', 'highlight-pdf');
      return null;
    }
  };
}
