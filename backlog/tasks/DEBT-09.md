---
id: "DEBT-09"
title: "The renderer registry becomes a factory the tool calls, and Redact's restore admits only Redact's element types"
status: "open"
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
