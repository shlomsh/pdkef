---
id: "SNG-08"
title: "Consolidate Redact's state before it grows further"
status: "done"
priority: "P2"
epic: "redact"
depends_on: []
---

# SNG-08 · Consolidate Redact's state before it grows further

`PdfRedactTool.tsx` holds about 33 `useState` calls and no reducer. Consolidate them behind one owner (a reducer or a small state module) before more is added. The interaction-machine half of the old ticket is dropped with SNG-05.

## Acceptance

- [x] Redact's state lives behind one owner; `PdfRedactTool.tsx` no longer carries its own scatter of `useState`s.
- [ ] Redact's specs are green on both engines.

## Original scope (dropped 2026-10-01)

Redact has about 13 independent `useState`s and no reducer (`PdfRedactTool.tsx`). It also re-implements Sign's Floating UI wiring (`RedactBox.tsx:72-109`). Before it can share the interaction machine, its state has to be consolidated. That is its own migration, sized here and not folded into SNG-06.

## Acceptance

- [ ] Redact's state is consolidated behind one owner.
- [ ] Redact runs on the machine, router and viewport.
- [ ] `RedactBox`'s Floating UI wiring is deleted.
- [ ] Redact's specs are green on both engines.

## 2026-10-01 board cleanup

- Retitled and rescoped (see above): consolidate Redact's roughly 33 `useState` calls. The machine, router and viewport half is dropped with SNG-05. Stays open.

- 2026-10-01: dropped SNG-06 from depends_on. The rescope removed the shared-machine half, and consolidating Redact's own state does not need Sign's fill mode.

## Result

`PdfRedactTool.tsx` went from 33 `useState` calls to one `useReducer` (1365 to about 1190 lines). `state/redactState.ts` is a pure reducer in six groups (document, edits, tool, selection, finish, view) with 47 actions named for what happened; an edit is one `EDIT_COMMITTED` (elements, history and revision together), and `useRedactCommands` takes one `commit` instead of four setters. Gesture geometry still goes to the DOM; only press and release dispatch. One deliberate change: opening a new file disarms even a locked tool (RED-39's intent; `disarmTool` used to keep it). A fresh-context review found no regression; its test gaps were filled (new-file disarm and Find terms at island level, a deep-freeze purity test, history coalescing). Found and filed: RED-50. (5e8beb69 .. 8a5233ea)
