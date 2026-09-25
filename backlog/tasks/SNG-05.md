---
id: "SNG-05"
title: "The next-generation phone surface behind a flag: contextual bar, app-owned zoom, field walking and review"
status: "open"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: ["SNG-04", "UNDO-04"]
---

# SNG-05 · The next-generation phone surface behind a flag: contextual bar, app-owned zoom, field walking and review

Build the chosen SNG-02 sketch on the SNG-04 machine.

It deletes these from the phone path:
- Floating UI;
- `visualViewportClamp` and `useVisualViewportScale`;
- the counter-scales and z-index lifts;
- `tapOutsideDeselect`;
- field navigation's zoom branch.

## Acceptance

- [ ] The parity checklist passes on the Simulator and on Shlomi's iPhone.
- [ ] Field arrows are ∧ ∨ with a count.
- [ ] The review step highlights empty fields.
- [ ] Undo covers moves, resizes, typing and styling.
- [ ] The three regressions recorded in `docs/sign-next-gen.md` §1 cannot happen, and each has a test.
