---
id: "ARCH-05"
title: "Move draft persistence into workspace/"
status: "done"
priority: "P3"
epic: "editor-architecture"
phase: "unspecified"
depends_on: []
legacy_state: "Done 2026-08-30"
---

# ARCH-05 · Move draft persistence into workspace/

## Scope and acceptance

**Move draft persistence into `workspace/`.** `src/lib/draftStore.js` and `src/lib/draftPolicy.js` implement the editor's document-session persistence (IndexedDB, 14-day expiry, schema) but live in `lib/`, while `src/editor/workspace/useEditorDraftPersistence.ts` already exists as the workspace-side hook. Move `draftStore.js`/`draftPolicy.js` into `src/editor/workspace/`; keep `useDraftPersistence.js` (the Preact hook `PdfSignTool`/`PdfRedactTool` call) colocated in `components/SignTool` or as a thin re-export — it's event-adapter code, not session coordination, even though today's layout groups them together. This is groundwork for SIGN-11 (versioned/validated persistence), which is about `draftStore`'s behavior, not its location — sequence this first so SIGN-11 reviews against a settled file layout.

**Completed 2026-08-30.** Draft policy/store and their tests now live under `src/editor/workspace/`; the Preact adapter hook and test are colocated under `src/components/SignTool/`.
