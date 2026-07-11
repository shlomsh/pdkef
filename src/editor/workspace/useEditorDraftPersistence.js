import { useDraftPersistence } from '../../lib/useDraftPersistence.js';

/**
 * Shared crash-recovery wiring for editor tools. It deliberately leaves each
 * tool's store and loader callback intact while centralizing first-wins draft
 * restore behavior.
 */
export function useEditorDraftPersistence({
  tool,
  file,
  fileBytes,
  elements,
  actionHistory,
  status,
  loadStartedRef,
  loadPdf,
}) {
  return useDraftPersistence({
    tool,
    file,
    fileBytes,
    elements,
    extra: { actionHistory },
    status,
    onRestore: (record) => {
      // A manual pick wins even when its ArrayBuffer or PDF load is still in flight.
      if (loadStartedRef.current) return;
      loadStartedRef.current = true;
      const restoredFile = new File([record.fileBytes], record.fileName, {
        type: record.fileType || 'application/pdf',
      });
      loadPdf(
        restoredFile,
        record.fileBytes,
        { elements: record.elements || [], actionHistory: record.extra?.actionHistory || [] },
        true,
      );
    },
  });
}
