---
id: "DEBT-72"
title: "Deleting an element clears a selection that pointed at one of its comments"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
depends_on: []
---

# DEBT-72 · Deleting an element clears a selection that pointed at one of its comments

*Filed 2026-11-08, from the implicit state machine inventory.* `DELETE_ELEMENT` in
`src/editor/model/elementsReducer.ts` removes the element and every comment anchored to it
(`deletedWith`, `:6`, used at `:150`), but only clears the selection when it pointed at the element
itself:

```ts
activeElementId: state.activeElementId === action.payload ? null : state.activeElementId,
editingElementId: state.editingElementId === action.payload ? null : state.editingElementId,
```

If a comment anchored to the deleted element was selected or being edited, `activeElementId` (and
possibly `editingElementId`) keeps pointing at an id that no longer exists. The toolbar, Backspace
and Escape handling then act on a missing element. This applies to Sign and Redact, which share the
reducer.

## Acceptance

- `DELETE_ELEMENT` clears `activeElementId` and `editingElementId` whenever they name any element that
  `deletedWith(action.payload)` removed.
- A reducer unit test selects (and separately edits) an anchored comment, deletes its element, and
  asserts both ids are `null`.
- Undo of that delete restores the element and its comments with nothing selected.

## Outcome
