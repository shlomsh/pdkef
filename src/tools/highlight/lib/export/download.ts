import type { EditorElement } from '#editor/model/editorModel.ts';
import type { PageTurns } from '#editor/geometry/pageTurn.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { reportToolLifecycleEvent } from '#lib/telemetry/productAnalytics.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';

export interface BuildInput {
  /** The final saved name (prefix, the person's own or the source's name, extension). */
  outputName: string | undefined;
  bytes: () => ArrayBuffer | null | undefined;
  elements: EditorElement[];
  pageTurns: PageTurns;
}

/**
 * The export step Download and Save to Drive share: the bytes the session holds (the file with its old
 * highlights already read out of it), turned as the person turned the pages, with the marks written on top.
 */
export function buildHandler({ outputName, bytes, elements, pageTurns }: BuildInput) {
  return async (): Promise<{ blob: Blob; fileName: string } | null> => {
    const source = bytes();
    if (!outputName || !source) return null;
    reportToolLifecycleEvent('tool_operation_started', 'highlight-pdf');
    try {
      // pdf-lib is 628 KiB and nothing needs it until a download (test:lazy-modules).
      const { exportHighlighted } = await import('./highlightedPdf.ts');
      const out = await exportHighlighted(source, elements, pageTurns);
      return { blob: new Blob([out as BlobPart], { type: 'application/pdf' }), fileName: outputName };
    } catch (err) {
      reportError('pdf_tool_run', err, 'export_highlighted');
      reportToolLifecycleEvent('tool_operation_failed', 'highlight-pdf');
      return null;
    }
  };
}

/** Download: the built file, saved to the device. */
export function downloadHandler({ save, ...input }: BuildInput & { save(blob: Blob, name: string): void }) {
  const build = buildHandler(input);
  /** The saved file name, or null when nothing was saved. */
  return async (): Promise<string | null> => {
    const built = await build();
    if (!built) return null;
    recordAction('download');
    save(built.blob, built.fileName);
    reportToolLifecycleEvent('tool_result_ready', 'highlight-pdf');
    return built.fileName;
  };
}

/** Share: the built file, kept ready for the share sheet (`prepare` says whether the browser can share it). */
export function shareHandler({ prepare, ...input }: BuildInput & { prepare(blob: Blob, name: string): boolean }) {
  const build = buildHandler(input);
  return async (): Promise<boolean> => {
    const built = await build();
    if (!built || !prepare(built.blob, built.fileName)) return false;
    reportToolLifecycleEvent('tool_result_ready', 'highlight-pdf');
    return true;
  };
}
