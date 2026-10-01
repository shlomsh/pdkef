---
id: "SNG-08"
title: "Consolidate Redact's state before it grows further"
status: "open"
priority: "P2"
epic: "redact"
horizon: "next"
order: 3
depends_on: ["SNG-06"]
---

# SNG-08 · Consolidate Redact's state before it grows further

`PdfRedactTool.tsx` holds about 33 `useState` calls and no reducer. Consolidate them behind one owner (a reducer or a small state module) before more is added. The interaction-machine half of the old ticket is dropped with SNG-05.

## Acceptance

- [ ] Redact's state lives behind one owner; `PdfRedactTool.tsx` no longer carries its own scatter of `useState`s.
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
