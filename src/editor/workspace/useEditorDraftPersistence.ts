import { useMemo } from 'preact/hooks';
import { clearDraftHintAttribute, useDraftPersistence } from '../../lib/drafts/useDraftPersistence.js';
import { migrateDraftRecord, validateDraftRecord } from '../registry/draftValidation.ts';
import type { ActionHistoryEntry, HistoryElement } from '../model/actionHistory.ts';
import { deleteDraft, takeHandoff } from '../../lib/drafts/draftStore.js';

interface DraftRecord {
  fileName: string;
  fileType?: string;
  fileBytes: ArrayBuffer;
  elements?: unknown[];
  extra?: { actionHistory?: unknown[]; carriedFont?: string; carriedFontSize?: number };
}

export interface UseEditorDraftPersistenceOptions<TElement extends HistoryElement> {
  tool: string;
  file: File | null;
  fileBytes: ArrayBuffer | null;
  elements: TElement[];
  actionHistory: ActionHistoryEntry<TElement>[];
  /** Sign's document-carried font family/size (SIGN-32); Redact never
   * supplies either, and both stay entirely out of its own draft record. */
  carriedFont?: string | null;
  carriedFontSize?: number | null;
  status: string;
  /** Explicitly supplied by the editor's document baseline/revision contract. */
  isDirty: boolean;
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
  /** Sign only (SIGN-32); absent for Redact and for a fresh pick. */
  carriedFont?: string;
  carriedFontSize?: number;
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
  carriedFont,
  carriedFontSize,
  status,
  isDirty,
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
  // actual history/carried-value changes, otherwise a save-state rerender
  // would look like a new edit and schedule another write forever. Redact
  // never passes carriedFont/carriedFontSize, so both stay undefined and out
  // of its own draft record.
  const extra = useMemo(
    () => ({ actionHistory, carriedFont: carriedFont ?? undefined, carriedFontSize: carriedFontSize ?? undefined }),
    [actionHistory, carriedFont, carriedFontSize],
  );

  return useDraftPersistence({
    tool,
    enabled: true,
    file,
    fileBytes,
    elements,
    extra,
    status,
    isDirty,
    // A pending handoff is a file the user dropped on the home page one
    // navigation ago, so it opens ahead of any draft. Resolving it *before*
    // loadDraft rather than racing it is what makes that deterministic: both are
    // async, and whichever claimed loadStartedRef first would otherwise win by
    // timing. A handoff is strictly newer than anything the pointer names (the
    // home page never asks any more, MEM-03: opening a file overwrites nothing,
    // the previous file keeps its work on its own recents entry).
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
        // `loadDraft` found an entry, but this editor cannot safely render its
        // work. Merely removing the live first-paint marker would make this
        // visit recover, then let the same current-entry pointer re-arm the
        // marker on every later navigation. Remove only this tool's malformed
        // work (the source PDF and any other tool's work remain in recents),
        // exactly as a failed restored PDF load does through clearDraft.
        clearDraftHintAttribute();
        void deleteDraft(tool).catch(() => {});
        return;
      }
      loadStartedRef.current = true;
      loadPdf(
        fileFrom(validated),
        validated.fileBytes,
        {
          elements: validated.elements,
          actionHistory: validated.extra?.actionHistory || [],
          carriedFont: validated.extra?.carriedFont,
          carriedFontSize: validated.extra?.carriedFontSize,
        },
        true,
      );
    },
  });
}
