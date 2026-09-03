import { useMemo } from 'preact/hooks';
import { clearDraftHintAttribute, useDraftPersistence } from '../../components/SignTool/useDraftPersistence.js';
import { migrateDraftRecord, validateDraftRecord } from '../registry/draftValidation.ts';
import type { ActionHistoryEntry, HistoryElement } from '../model/actionHistory.ts';
import { takeHandoff } from './draftStore.js';

interface DraftRecord {
  fileName: string;
  fileType?: string;
  fileBytes: ArrayBuffer;
  elements?: unknown[];
  extra?: { actionHistory?: unknown[] };
}

export interface UseEditorDraftPersistenceOptions<TElement extends HistoryElement> {
  tool: string;
  file: File | null;
  fileBytes: ArrayBuffer | null;
  elements: TElement[];
  actionHistory: ActionHistoryEntry<TElement>[];
  status: string;
  loadStartedRef: { current: boolean };
  loadPdf: (
    file: File,
    fileBytes: ArrayBuffer,
    initialState: EditorDraftInitialState<TElement>,
    restored: boolean,
  ) => void;
  isElement: (value: unknown) => value is TElement;
}

export interface EditorDraftInitialState<TElement extends HistoryElement> {
  elements: TElement[];
  actionHistory: ActionHistoryEntry<TElement>[];
}

/**
 * Shared crash-recovery wiring for editor tools. It deliberately leaves each
 * tool's store and loader callback intact while centralizing first-wins draft
 * restore behavior.
 */
export function useEditorDraftPersistence<TElement extends HistoryElement>({
  tool,
  file,
  fileBytes,
  elements,
  actionHistory,
  status,
  loadStartedRef,
  loadPdf,
  isElement,
}: UseEditorDraftPersistenceOptions<TElement>) {
  // Rebuild a File from a stored record - handoffs and drafts carry the same
  // fileName/fileType/fileBytes triple, because a File handle does not survive a
  // navigation and both have to cross one.
  const fileFrom = (record: DraftRecord) =>
    new File([record.fileBytes], record.fileName, { type: record.fileType || 'application/pdf' });

  // `extra` participates in the autosave revision. Keep its identity tied to
  // actual history changes, otherwise a save-state rerender would look like a
  // new edit and schedule another write forever.
  const extra = useMemo(() => ({ actionHistory }), [actionHistory]);

  return useDraftPersistence({
    tool,
    enabled: true,
    file,
    fileBytes,
    elements,
    extra,
    status,
    // A pending handoff is a file the user dropped on the home page one
    // navigation ago, so it opens ahead of any draft. Resolving it *before*
    // loadDraft rather than racing it is what makes that deterministic: both are
    // async, and whichever claimed loadStartedRef first would otherwise win by
    // timing. The home page has already asked about the draft by this point (see
    // FileDropzone), so arriving here means the user chose this file.
    beforeRestore: async () => {
      const handoff = (await takeHandoff(tool)) as DraftRecord | null;
      if (!handoff || loadStartedRef.current) return false;
      loadStartedRef.current = true;
      loadPdf(fileFrom(handoff), handoff.fileBytes, { elements: [], actionHistory: [] }, true);
      return true;
    },
    onRestore: (record: object) => {
      // A manual pick wins even when its ArrayBuffer or PDF load is still in flight.
      if (loadStartedRef.current) return;
      const validated = validateDraftRecord(migrateDraftRecord(record), isElement);
      if (!validated) {
        clearDraftHintAttribute();
        return;
      }
      loadStartedRef.current = true;
      loadPdf(
        fileFrom(validated),
        validated.fileBytes,
        { elements: validated.elements, actionHistory: validated.extra?.actionHistory || [] },
        true,
      );
    },
  });
}
