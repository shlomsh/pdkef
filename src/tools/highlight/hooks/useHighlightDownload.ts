import type { EditorElement } from '#editor/model/editorModel.ts';
import type { PageTurns } from '#editor/geometry/pageTurn.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { exportHighlighted, highlightedFileName } from '../lib/export/highlightedPdf.ts';

/**
 * Download: the bytes the session holds (the file with its old highlights already read out of it), turned as the
 * person turned the pages, with the marks written on top.
 */
export function useHighlightDownload({ fileName, bytes, elements, pageTurns, save }: {
  fileName: string | undefined;
  bytes: () => ArrayBuffer | null | undefined;
  elements: EditorElement[];
  pageTurns: PageTurns;
  save(blob: Blob, name: string): void;
}) {
  return async () => {
    const source = bytes();
    if (!fileName || !source) return;
    try {
      const out = await exportHighlighted(source, elements, pageTurns);
      recordAction('download');
      save(new Blob([out as BlobPart], { type: 'application/pdf' }), highlightedFileName(fileName));
    } catch (err) {
      reportError('pdf_tool_run', err, 'export_highlighted');
    }
  };
}
