import { useDraftPersistence } from '../lib/useDraftPersistence.js';

export function useSignDraftPersistence({
  file,
  fileBytes,
  elements,
  actionHistory,
  status,
  loadStartedRef,
  loadPdf
}) {
  return useDraftPersistence({
    tool: 'sign',
    file,
    fileBytes,
    elements,
    extra: { actionHistory },
    status,
    onRestore: (record) => {
      // A manual pick already claimed the load slot (even if it hasn't finished loading
      // yet) — never let a silent background restore override explicit user intent.
      if (loadStartedRef.current) return;
      loadStartedRef.current = true;
      const restoredFile = new File([record.fileBytes], record.fileName, {
        type: record.fileType || 'application/pdf'
      });
      loadPdf(
        restoredFile,
        record.fileBytes,
        { elements: record.elements || [], actionHistory: record.extra?.actionHistory || [] },
        true
      );
    }
  });
}
