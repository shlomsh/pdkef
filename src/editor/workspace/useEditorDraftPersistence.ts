import { useEffect, useMemo, useRef } from 'preact/hooks';
import { clearDraftHintAttribute, useDraftPersistence } from '../../lib/drafts/useDraftPersistence.js';
import { migrateDraftRecord, validateDraftRecord } from '../registry/draftValidation.ts';
import type { ActionHistoryEntry, HistoryElement } from '../model/actionHistory.ts';
import type { DetailEdits } from '../registry/draftValidation.ts';
import type { DocumentStyle } from '../model/documentStyle.ts';
import { deleteDraft, takeHandoff } from '../../lib/drafts/draftStore.js';
import { markHandoffArrival } from '../../lib/useHandoffIntake.ts';
import { clearHandoffPending, releaseHandoffPending, releaseHandoffPendingWhenLoaded } from '../../lib/handoffPending.ts';

interface DraftRecord {
  fileName: string;
  fileType?: string;
  fileBytes: ArrayBuffer;
  from?: string;
  elements?: unknown[];
  extra?: { actionHistory?: unknown[]; carried?: Partial<DocumentStyle>; details?: DetailEdits };
}

export interface UseEditorDraftPersistenceOptions<TElement extends HistoryElement> {
  tool: string;
  file: File | null;
  fileBytes: ArrayBuffer | null;
  elements: TElement[];
  actionHistory: ActionHistoryEntry<TElement>[];
  /** The document-carried style (SIGN-33). Sign's whole style; Redact carries
   * only its brush mode and size (RED-32), and only once the person chose. */
  carried?: Partial<DocumentStyle> | null;
  /** RED-59: Redact's edits to the file's details. Sign passes none. */
  details?: DetailEdits;
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
  /** SIGN-33 (Sign) and RED-32 (Redact's brush); absent for a fresh pick. */
  carried?: Partial<DocumentStyle>;
  /** RED-59: Redact only. */
  details?: DetailEdits;
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
  carried,
  details,
  status,
  isDirty,
  loadStartedRef,
  loadPdf,
  isElement,
}: UseEditorDraftPersistenceOptions<TElement>) {
  // Rebuild a File from a stored record - handoffs and drafts carry the same
  // fileName/fileType/fileBytes triple, because a File handle does not survive a
  // navigation and both have to cross one.
  // HERO-02: the pre-paint script held the page back for a hand-off. It is released once the editor
  // shows the document, at once when there was nothing to take, and on unmount before either.
  const cancelReleaseRef = useRef<() => void>(() => {});
  useEffect(
    () => () => {
      cancelReleaseRef.current();
      releaseHandoffPending();
    },
    [],
  );

  const fileFrom = (record: DraftRecord) =>
    new File([record.fileBytes], record.fileName, { type: record.fileType || 'application/pdf' });

  // `extra` participates in the autosave revision. Keep its identity tied to
  // actual history/carried-value changes, otherwise a save-state rerender
  // would look like a new edit and schedule another write forever. Redact
  // passes `carried` only after an explicit brush choice.
  const extra = useMemo(
    () => ({
      actionHistory,
      carried: carried ?? undefined,
      ...(details ? { details } : {}),
    }),
    [actionHistory, carried, details],
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
      clearHandoffPending(tool);
      if (!handoff || loadStartedRef.current) {
        releaseHandoffPending();
        return false;
      }
      loadStartedRef.current = true;
      cancelReleaseRef.current = releaseHandoffPendingWhenLoaded();
      markHandoffArrival(handoff.from);
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
        // expected: best-effort cleanup of malformed draft work
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
          carried: validated.extra?.carried,
          details: validated.extra?.details ?? {},
        },
        true,
      );
    },
  });
}
