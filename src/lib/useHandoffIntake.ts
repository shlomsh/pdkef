import { useEffect, useRef } from 'preact/hooks';
import { takeHandoff } from '../editor/workspace/draftStore.js';

/**
 * MERGE-14: collect a pending hand-off for `tool` on mount and hand the
 * rebuilt File to `onFile`.
 *
 * Sign and Redact already resolve a hand-off through
 * `useEditorDraftPersistence.ts`'s `beforeRestore`, ahead of their own draft
 * restore (a hand-off is a file dropped one navigation ago, so it outranks a
 * saved draft - see that file's comment). Compress and Split have no draft to
 * race against, so mount is enough: nothing else is competing to load a file
 * first.
 *
 * `takeHandoff` is read-and-delete (a hand-off is a one-shot baton - see
 * draftStore.js), and already returns null when IndexedDB is unavailable, so
 * there is nothing to special-case here for that.
 *
 * Runs once per mount (`[tool]` deps only, via the `onFile` ref below) - a
 * result that resolves after unmount is dropped rather than calling a
 * callback whose owner is already gone.
 */
export function useHandoffIntake(tool: string, onFile: (file: File) => void): void {
  // Keeping only the latest `onFile` in a ref, rather than in the effect's
  // dependency array, is what lets the effect depend on `[tool]` alone -
  // otherwise a tool that recreates its callback every render (as both
  // PdfCompressTool and PdfSplitTool do, since handleFilesAdded closes over
  // render-scoped state) would re-run this effect, and re-collect from a
  // store that already deleted the record, every render.
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;

  useEffect(() => {
    let cancelled = false;

    takeHandoff(tool).then((value) => {
      if (cancelled || !value) return;
      const record = value as { fileName: string; fileType?: string; fileBytes: ArrayBuffer };
      const file = new File([record.fileBytes], record.fileName, {
        type: record.fileType || 'application/pdf',
      });
      onFileRef.current(file);
    });

    return () => {
      cancelled = true;
    };
  }, [tool]);
}
