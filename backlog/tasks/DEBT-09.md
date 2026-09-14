---
id: "DEBT-09"
title: "The renderer registry becomes a factory the tool calls, and Redact's restore admits only Redact's element types"
status: "done"
priority: "P2"
epic: "architecture-debt"
phase: "near-term"
depends_on: []
---

# DEBT-09 · A dependency the call site can see

*Filed 2026-09-14*, finding 5 of
[docs/architecture-debt-review-2026-09-14.md](../../docs/architecture-debt-review-2026-09-14.md).

## Problem

`registerRenderer()` runs seven times at module load in `PdfWorkspace.tsx:24-30`, between import
statements; the map it fills is a module-global that `RedactBox.tsx:89` also reads with nothing
registered. Sound by ESM evaluation order, invisible at every call site. And
`PdfRedactTool.tsx:322` restores drafts with `isDraftElement` (all nine types), so a `text` element
under the `redact` store key passes validation and `requireComponent('text')` throws inside render,
where it used to draw Sign's node.

## Scope

- `renderers.ts` exports `createElementRenderers(nodeComponents)` returning the typed map; the
  `renderTarget: 'redact'` branch and `renderRedactionSurface` unchanged. `PdfWorkspace` calls it
  once with its seven components (a module-level `const`, after the imports); `RedactBox` calls it
  with `{}`. `registerRenderer`/`getElementRenderer` go; `renderers.test.ts` tests the factory and
  keeps the "missing component throws with the type name" case.
- Redact passes an `isElement` narrowed to `whiteout | blackout | blur | delete` (there is a
  `RedactHistoryElement` type already); one case in `useEditorDraftPersistence.test.tsx` that a
  `text` element in a `redact` record is dropped, not thrown on.
- `.claude/rules/editor.md`'s registration paragraph and the `EXCEPTIONS` comment in
  `check-editor-dependency-directions.mjs` describe the factory.

## Acceptance

- `grep -rn "registerRenderer" src` is empty; `test:editor-dependency-directions` and
  `test:module-boundaries` green with no new exception.
- Sign and Redact e2e green; a hand-written `redact` draft record containing a `text` element restores
  with the element dropped (unit test).

## Landed (2026-09-14)

- `renderers.ts` now exports `createElementRenderers(nodeComponents)`, returning `ElementRenderers`
  (`Record<ElementType, ElementRenderer>`), so a call site can index it by an element's own `type`
  field without the per-type mapped shape reducing the call to `never`. `PdfWorkspace.tsx` builds a
  module-level `ELEMENT_RENDERERS` from its seven components after all its imports; `RedactBox.tsx`
  builds one from `{}`. `registerRenderer`/`getElementRenderer` are gone; `renderers.test.ts` and
  `schema.test.ts` test the factory directly, keeping the "missing component throws with the type
  name" case.
- `PdfRedactTool.tsx`'s `RedactHistoryElement.type` is now `RedactToolType`
  (`'whiteout' | 'blackout' | 'blur' | 'delete'`), and its draft `isElement` is
  `isRedactHistoryElement` (`isDraftElement(value) && REDACT_ELEMENT_TYPES.has(value.type)`) instead
  of the unnarrowed `isDraftElement`. `validateDraftElements` already drops any element failing
  `isElement` rather than rejecting the whole record, so this alone fixes the restore: a foreign
  `text` element under the `redact` key is now dropped, the rest of the record still restores. Added
  a case to `useEditorDraftPersistence.test.tsx` proving it.
- The `registerRenderer` mention in `src/editor/text/elementClassNames.ts`'s comment was left for
  DEBT-08, which deleted that file in the same push; on `main`,
  `grep -rn "registerRenderer\|getElementRenderer" src scripts .claude` is empty.
