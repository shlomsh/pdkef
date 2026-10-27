---
id: "ARCH-67"
title: "The draft store is TypeScript with one record type parsed where it is read"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 9
depends_on: []
---

# ARCH-67 · The draft store is TypeScript with one record type parsed where it is read

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Safety nets. Criterion: Type safety. Structure only: no behaviour change.

## Why

- `src/lib/drafts/draftStore.js` (1,156 lines) owns every IndexedDB read and write and is untyped; the record shape lives in JSDoc (`@param {object}`, `(record: object) => boolean` at `:240`).
- Callers cast its results (`useEditorDraftPersistence.ts:120`: `as DraftRecord | null`), and `loadDraft` (`:900-958`) returns a merged object with no schema.

## Outcome

- `draftStore.ts` with `DraftEntry` and `DraftRecord` types and one parse function at the read edge. No storage-format change.

## Acceptance

- [ ] No `as DraftRecord` cast remains outside the store.
- [ ] Draft unit and restore e2e tests pass unchanged.
