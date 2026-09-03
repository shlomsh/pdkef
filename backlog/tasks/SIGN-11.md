---
id: "SIGN-11"
title: "Versioned, validated shared persistence"
status: "in_progress"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: ["SIGN-24"]
legacy_state: "In progress — persistence/user-scope slice assigned 2026-09-03"
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

**Done (2026-09-03, preferences slice):** `preferenceStore.ts` now writes a validated
schema-v1 record per opaque local user scope. The default is the browser profile and origin's
deterministic local scope, while `EditorPreferenceOptions.userScope` is the seam for a future authenticated shell
to provide a non-sensitive stable scope. It migrates the established unscoped keys and the v0
envelope, validates every read (including saved-signature IDs/data URLs/ratios), handles unavailable
storage, never imports anonymous legacy values into an explicit user scope, and keeps legacy
default-profile keys mirrored only while an older deployed tab may still be open. Same-scope
`storage` events update Sign, Redact, and the signature dialog; revision,
timestamp, and tab-writer ID give explicit deterministic last-writer-wins behavior. Pen
color/thickness now use this same boundary rather than direct `localStorage` access.

**Still open:** draft-record multi-tab coordination and storing source PDF bytes once per document
rather than on every edit. SIGN-24 must also separate saved-signature image assets from the scalar
preference envelope before this storage design closes. The preference slice's opaque scope needs a
real account shell to pass its own scope only if authenticated profiles are later introduced.

**Current recommendation (2026-09-03):** preserve the offline-only architecture while
introducing an explicit local-user storage scope shared by tabs for that user. Land
saved-signature/preference validation and migration as a bounded slice, then add revisioned
cross-tab coordination with deterministic conflict behavior. Keep source-PDF deduplication as a
separate follow-up so storage-format and concurrency changes remain independently reversible.
