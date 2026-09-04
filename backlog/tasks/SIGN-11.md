---
id: "SIGN-11"
title: "Versioned, validated shared persistence"
status: "done"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: ["SIGN-24"]
legacy_state: "Done — 2026-09-04; revisioned source-deduplicated draft persistence"
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

**Done (2026-09-04, draft coordination/source slice):** IndexedDB schema-v2 keeps draft snapshots
separate from a SHA-256-addressed source-PDF store, so later edits hold only the source address and
never write another copy of the PDF bytes. One read/write transaction assigns a monotonic revision,
timestamp, and per-tab writer ID immediately before every write. Same-user tabs receive metadata-only
storage notifications and show an explicit conflict state rather than replacing an editor in use;
the documented resolution is deterministic last-writer-wins on the next local save. Source references
are reclaimed when drafts are replaced or deleted. Schema-v1 byte-bearing records remain readable,
and unavailable binary storage remains a non-breaking unsaved state. Focused tests cover content
addressing, unavailable storage, and the metadata-only cross-tab contract.
