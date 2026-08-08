import { useDraftPersistence } from '../../lib/useDraftPersistence.js';
import { takeHandoff } from '../../lib/draftStore.js';

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
  // Rebuild a File from a stored record - handoffs and drafts carry the same
  // fileName/fileType/fileBytes triple, because a File handle does not survive a
  // navigation and both have to cross one.
  const fileFrom = (record) =>
    new File([record.fileBytes], record.fileName, { type: record.fileType || 'application/pdf' });

  return useDraftPersistence({
    tool,
    file,
    fileBytes,
    elements,
    extra: { actionHistory },
    status,
    // A pending handoff is a file the user dropped on the home page one
    // navigation ago, so it opens ahead of any draft. Resolving it *before*
    // loadDraft rather than racing it is what makes that deterministic: both are
    // async, and whichever claimed loadStartedRef first would otherwise win by
    // timing. The home page has already asked about the draft by this point (see
    // FileDropzone), so arriving here means the user chose this file.
    beforeRestore: async () => {
      const handoff = await takeHandoff(tool);
      if (!handoff || loadStartedRef.current) return false;
      loadStartedRef.current = true;
      loadPdf(fileFrom(handoff), handoff.fileBytes, { elements: [], actionHistory: [] }, true);
      return true;
    },
    onRestore: (record) => {
      // A manual pick wins even when its ArrayBuffer or PDF load is still in flight.
      if (loadStartedRef.current) return;
      loadStartedRef.current = true;
      loadPdf(
        fileFrom(record),
        record.fileBytes,
        { elements: record.elements || [], actionHistory: record.extra?.actionHistory || [] },
        true,
      );
    },
  });
}
