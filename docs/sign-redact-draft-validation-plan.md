# Validate and version drafts at restore

> Execution plan for backlog item **SIGN-11** ("Versioned, validated shared persistence") on
> [TODO.md](../TODO.md). Design standard: [CLAUDE.md](../CLAUDE.md) "Draft persistence feature"
> (Architecture section) and the privacy invariants (no PDF content in diagnostics). This plan covers
> the validate-on-restore + schema-version + migrate slice of SIGN-11 only — see "Out of scope" below
> for what of SIGN-11 stays open after this lands. Not started as of 2026-08-29; written for whichever
> agent picks up SIGN-11 next.

---

## Context

A review of the Sign/Redact draft-persistence path found that persisted data bypasses validation:
`src/editor/workspace/useEditorDraftPersistence.ts:76-77` casts an IndexedDB record straight to
`DraftRecord` and passes `draft.elements` directly into editor state with no check. Per-type schema
guards already exist (`src/editor/registry/*.ts` each export a `schema: (value) => value is T` type
guard, built from helpers in `src/editor/registry/schema.ts`), but a repo-wide grep confirms `.schema(`
is invoked **only** from `*.test.ts` files — never on a real restore. `src/lib/draftStore.js`'s
IndexedDB `DB_VERSION` versions the object store, not the element schema inside a record, so there is
no mechanism today to detect or migrate an old/foreign record shape.

Confirmed while scoping: Redact already carries one ad hoc, unversioned migration inline in
`PdfRedactTool.tsx`'s `loadPdf` (`element.type || style || 'blackout'`, for drafts written before the
E4.4 flat-type-discriminant migration) — this is the concrete precedent for "migrate schema versions"
SIGN-11 asks for, just not named or versioned as one. Redact also has a `'delete'` mark element type
(text-run redaction preview) that is **not** part of the shared `ElementType` union or registry at
all — a strict "must match a registry type" validator would wrongly quarantine every real Redact
delete-mark draft, so the validator must special-case it.

**Quarantine depth (decided 2026-08-29):** when a restored draft contains invalid/corrupt elements,
drop them before they reach state and `console.error` a summary — no separate quarantine storage, no
user-facing UI notice. This is the "Log only" option, matching `draftStore.js`'s existing
`console.error('draftStore.xxx failed:', e)` style and this repo's general preference not to add
handling for edge cases beyond what's needed. If a future session revisits this, the two heavier
options considered and declined were: (b) copy the raw unvalidated record to a `quarantine:<tool>`
IndexedDB key (mirroring the existing `handoff:<tool>` pattern) before overwriting it, or (c) that plus
a status-line notice reusing the existing `draftSaveState` UI ("Draft not saved").

**Out of scope for this change**, deliberately, matching existing backlog boundaries:
- Typing `SignToolContext`'s reducer `action: any` / `actionHistory: any[]` — tracked separately as part
  of SIGN-14 ("type commands and serializer contracts at runtime boundaries").
- Splitting `SerializeContext`'s `redaction?: boolean` (`src/editor/registry/types.ts:16-27`) into
  separate Sign/Redact contexts — also SIGN-14 territory (isolating the editor core from tool-specific
  concerns).
- The rest of SIGN-11 (multi-tab coordination with revisions/conflict handling, saved-signature/
  preference versioning, storing source PDF bytes once per document instead of per edit) stays open;
  this change addresses the validate-on-restore + version + migrate slice only.

## Design

### 1. New file: `src/editor/registry/draftValidation.ts`

Colocated with the registry because it needs `getElementDefinition` from `./index.ts`.

- `export const DRAFT_SCHEMA_VERSION = 1`
- `migrateDraftRecord(record: unknown): unknown` — a version→version step function. For now there is
  one real migration to fold in: rename `style` → `type` on any element missing `type` (moved here,
  verbatim in behavior, from `PdfRedactTool.tsx:214-217`), applied whenever a record's `schemaVersion`
  is absent (i.e. every record written before this change) or is below `DRAFT_SCHEMA_VERSION`. Returns
  a record shape with `schemaVersion: DRAFT_SCHEMA_VERSION` stamped. Structured so a future bump has an
  obvious place to add the next step, not as a one-off `if`.
- `function isDeleteMarkElement(value: unknown): boolean` — local shape guard for Redact's `'delete'`
  mark (`id` string, `pageIndex` number, `type === 'delete'`, `sourceObjectId` string, `kind`,
  `left/top/width/height` finite numbers). Not added to the shared registry — that unification is
  SIGN-14 scope; this just stops the validator from wrongly rejecting real Redact drafts.
- `validateDraftElements(elements: unknown[]): { valid: unknown[]; droppedCount: number }` — for each
  item: must be a plain record; `pageIndex` must be `Number.isInteger` and `>= 0`; `id` must be a
  non-empty string not already seen in this array (first occurrence wins, later duplicates dropped);
  and it must either pass `getElementDefinition(type).schema(item)` for a recognized `ElementType`, or
  `isDeleteMarkElement(item)`. Anything failing is excluded, never thrown. If `droppedCount > 0`,
  `console.error` one summary line (dropped count + the offending types/ids — no PDF content, so this
  stays inside the existing privacy invariants).
- `validateDraftRecord(record: unknown): { fileName: string; fileType?: string; fileBytes: ArrayBuffer;
  elements: unknown[]; extra?: { actionHistory?: unknown[] } } | null` — top-level shape check
  (non-empty `fileName` string, non-empty `fileBytes` `ArrayBuffer`); returns `null` if either is
  missing (today's restore path already treats falsy `fileBytes` as "no draft" — this centralizes and
  slightly tightens that check). On success, runs `elements` through `validateDraftElements` and returns
  the record with `elements` replaced by the valid subset.

### 2. Stamp the version on write: `src/lib/useDraftPersistence.js`

`buildRecord()` (the single place that assembles what gets saved, per its own comment) adds
`schemaVersion: DRAFT_SCHEMA_VERSION` to the object it returns, importing the constant from the new
`draftValidation.ts`. `draftStore.js` itself stays an untyped, schema-agnostic store — versioning
knowledge lives with the code that actually knows what a valid element looks like.

### 3. Apply migration + validation at restore: `src/editor/workspace/useEditorDraftPersistence.ts`

Replace the current unchecked cast in `onRestore`:

```ts
onRestore: (record: object) => {
  const draft = record as DraftRecord;
  ...
  loadPdf(fileFrom(draft), draft.fileBytes, { elements: draft.elements || [], ... }, true);
}
```

with migrate-then-validate, falling back to the existing "no usable draft" behavior on failure:

```ts
onRestore: (record: object) => {
  if (loadStartedRef.current) return;
  const validated = validateDraftRecord(migrateDraftRecord(record));
  if (!validated) {
    clearDraftHintAttribute(); // see below
    return;
  }
  loadStartedRef.current = true;
  loadPdf(fileFrom(validated), validated.fileBytes,
    { elements: validated.elements, actionHistory: validated.extra?.actionHistory || [] }, true);
}
```

`useDraftPersistence.js`'s existing "no draft to restore after all" branch does
`document.documentElement?.removeAttribute('data-draft-hint')` inline. Extract that one line into a
tiny exported `clearDraftHintAttribute()` in `useDraftPersistence.js` so both call sites (the existing
"no record" path and the new "record present but invalid" path) share it instead of drifting.

The `beforeRestore` handoff path (`takeHandoff`) only needs the top-level `fileBytes` check — handoffs
never carry `elements` — so it's left as-is except for reusing `validateDraftRecord`'s fileBytes check
if convenient; not a hard requirement.

### 4. Remove the now-redundant inline migration from `PdfRedactTool.tsx`

Lines 214-217's `presetElements = (preset.elements || []).map(({ style, ...element }) => ({ ...element,
type: element.type || style || 'blackout' }))` goes away — `migrateDraftRecord` now does this before
`onRestore` ever calls `loadPdf`, so `preset.elements` arriving here is already migrated and validated.

### 5. TODO.md

Update SIGN-11's row once this lands to note the validate/version/migrate/quarantine slice is done, and
restate what of SIGN-11 remains open (multi-tab coordination, saved-signature/preference versioning,
PDF-byte dedup storage), matching the file's existing style of recording what shipped and why.

## Tests

- `src/editor/registry/draftValidation.test.ts` (new): valid record passes through with elements
  intact; an element with an unrecognized `type` is dropped while good elements survive; a duplicate
  `id` is dropped (second occurrence); non-integer and negative `pageIndex` are dropped; a Redact
  `'delete'` mark is accepted; a legacy `style`-keyed element is migrated to `type` and survives;
  missing/empty `fileName` or `fileBytes` yields `null`; `console.error` is called (spy) only when
  something was actually dropped.
- `src/editor/workspace/useEditorDraftPersistence.test.ts` (new — none exists today): mount the hook
  with a mocked `loadDraft`/`saveDraft` (following `useDraftPersistence.test.jsx`'s existing mocking
  pattern) returning a record with one garbage element mixed into otherwise-good ones; assert `loadPdf`
  is called once with only the valid elements, and that a record failing the top-level check (no
  `fileBytes`) results in the same "no draft" behavior as no record at all, without throwing.
- Extend whichever of `draftStore.test.js` / `useDraftPersistence.test.jsx` already covers `saveDraft`
  to assert the written record carries `schemaVersion: DRAFT_SCHEMA_VERSION`.

## Verification

- `npm test` (Vitest) — the new and extended test files above, plus the full suite to catch any
  regression in existing Sign/Redact restore-adjacent tests.
- `npm run typecheck` (`astro check`) — this change adds/touches `.ts` files in `src/editor/`.
- No `npm run build && npm run preview` pass needed — this doesn't touch scripts, styles, or
  `astro.config.mjs`/`vercel.json`, so it isn't CSP-relevant per CLAUDE.md's guidance on when that
  pass is required.
