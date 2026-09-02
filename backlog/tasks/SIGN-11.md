---
id: "SIGN-11"
title: "Versioned, validated shared persistence"
status: "open"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Open — validate/version/migrate slice landed 2026-09-02; rest unscoped"
---

# SIGN-11 · Versioned, validated shared persistence

## Scope and acceptance

**Versioned, validated shared persistence.** `draftStore`, saved signatures/preferences: choose the local user boundary, validate records on read, migrate schema versions, and coordinate same-user tabs with revisions and explicit conflict handling. Store source PDF bytes once per document, not on every edit. Test corrupt/older records, concurrent tabs, deletion, and unavailable storage. No account/backend requirement is implied.

**Done (2026-09-02):** the validate-on-restore + schema-version + migrate slice, per
[docs/sign-redact-draft-validation-plan.md](./docs/sign-redact-draft-validation-plan.md). New
`src/editor/registry/draftValidation.ts` exports `DRAFT_SCHEMA_VERSION`, `migrateDraftRecord`
(folds in the `style`→`type` rename Redact carried inline, and special-cases Redact's `'delete'`
mark, which is not in the shared registry) and `validateDraftRecord`/`validateDraftElements`
(drop-and-log invalid/corrupt/duplicate-id elements rather than throwing or quarantining).
`useDraftPersistence.js` stamps `schemaVersion` on every write;
`useEditorDraftPersistence.ts`'s `onRestore` migrates-then-validates before calling `loadPdf`,
falling back to the existing "no usable draft" behavior (shared via the new exported
`clearDraftHintAttribute()`) on failure. `PdfRedactTool.tsx`'s inline migration was removed since
restored drafts now arrive already migrated.

**Still open:** multi-tab coordination (revisions + explicit conflict handling), saved-signature/
preference versioning, and storing source PDF bytes once per document rather than on every edit —
none of these were scoped by the plan doc above.
