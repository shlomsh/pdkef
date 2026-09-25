---
id: "SNG-08"
title: "Redact on the next-generation machine, after consolidating its state"
status: "open"
priority: "P2"
epic: "sign-next-gen"
phase: "longer-term"
depends_on: ["SNG-06"]
---

# SNG-08 · Redact on the next-generation machine, after consolidating its state

Redact has about 13 independent `useState`s and no reducer (`PdfRedactTool.tsx`). It also re-implements Sign's Floating UI wiring (`RedactBox.tsx:72-109`). Before it can share the interaction machine, its state has to be consolidated. That is its own migration, sized here and not folded into SNG-06.

## Acceptance

- [ ] Redact's state is consolidated behind one owner.
- [ ] Redact runs on the machine, router and viewport.
- [ ] `RedactBox`'s Floating UI wiring is deleted.
- [ ] Redact's specs are green on both engines.
