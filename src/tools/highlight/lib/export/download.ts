import type { EditorElement } from '#editor/model/editorModel.ts';
import type { PageTurns } from '#editor/geometry/pageTurn.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { exportHighlighted, highlightedFileName } from './highlightedPdf.ts';

/**
 * Download: the bytes the session holds (the file with its old highlights already read out of it), turned as the
 * person turned the pages, with the marks written on top.
 */
export function downloadHandler({ fileName, bytes, elements, pageTurns, save }: {
  fileName: string | undefined;
  bytes: () => ArrayBuffer | null | undefined;
  elements: EditorElement[];
  pageTurns: PageTurns;
  save(blob: Blob, name: string): void;
}) {
  /** The saved file name, or null when nothing was saved. */
  return async (): Promise<string | null> => {
    const source = bytes();
    if (!fileName || !source) return null;
    try {
      const out = await exportHighlighted(source, elements, pageTurns);
      recordAction('download');
      const name = highlightedFileName(fileName);
      save(new Blob([out as BlobPart], { type: 'application/pdf' }), name);
      return name;
    } catch (err) {
      reportError('pdf_tool_run', err, 'export_highlighted');
      return null;
    }
  };
}
