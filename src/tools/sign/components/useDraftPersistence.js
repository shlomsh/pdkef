// Moved to src/editor/workspace/useDraftPersistence.js (ARCH-19): the hook had
// no Sign-specific logic, only draftStore.js and draftValidation.ts, both
// already part of the editor core - it was misplaced under SignTool/, which
// made it an editor -> tool edge for `useEditorDraftPersistence.ts` to import.
// Re-exported here so nothing that already imports it from this path (Merge's
// useMergeDraft.ts, comments in PdfMergeTool.tsx/BasePdfTool.tsx) has to change.
export { useDraftPersistence, clearDraftHintAttribute, RESTORE_TIMEOUT_MS } from '../../../editor/workspace/useDraftPersistence.js';
