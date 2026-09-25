---
id: "SNG-05"
title: "The next-generation phone surface behind a flag: contextual bar, app-owned zoom, field walking and review"
status: "open"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: ["SNG-04", "UNDO-04", "SNG-09", "SNG-11"]
---

# SNG-05 · The next-generation phone surface behind a flag: contextual bar, app-owned zoom, field walking and review

Build the chosen SNG-02 sketch on the SNG-04 machine.

It deletes these from the phone path:
- Floating UI;
- `visualViewportClamp` and `useVisualViewportScale`;
- the counter-scales and z-index lifts;
- `tapOutsideDeselect`;
- field navigation's zoom branch.

The normative rules are `docs/sign-next-gen-guidelines.md`:
- SNG-04 implements §2 (states, input tables, the one set of constants) and §3's boundary table.
- SNG-05 implements §1 and §3-§6.
- Both answer §11's checklist.

## Acceptance

- [ ] The parity checklist passes on the Simulator and on Shlomi's iPhone.
- [ ] Field arrows are ∧ ∨. A count and field names appear only on a fillable PDF, from the file.
- [ ] The review step highlights the found spots still empty, with no label tag on a flat form.
- [ ] Every row of the guidelines' §1 error budget holds: a tap writes anywhere, "Not a field" dismisses a mark for good, and a guessed kind is only offered.
- [ ] Undo covers moves, resizes, typing and styling.
- [ ] The three regressions recorded in `docs/sign-next-gen.md` §1 cannot happen, and each has a test.
- [ ] All three document classes of §5.6 work: a fillable PDF, a vector flat form, and a scan with 0 fields.
  - On the scan, tap to write snaps to the line (SNG-09), and the review shows every page to check.
  - No copy anywhere claims the form is complete.
