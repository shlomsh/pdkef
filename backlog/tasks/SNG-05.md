---
id: "SNG-05"
title: "The next-generation phone surface behind a flag: contextual bar, app-owned zoom, the chosen way through the page, and the finish"
status: "open"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: ["SNG-04", "UNDO-04", "SNG-09"]
---

# SNG-05 · The next-generation phone surface behind a flag: contextual bar, app-owned zoom, the chosen way through the page, and the finish

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
- [ ] ∧ ∨ hop between elements, detected and added alike, zoomed in so each is readable; there is no count and no progress over elements.
- [ ] A false positive passes with a single ∨, and "Remove" at an empty detected element takes it out of the hops for that file.
- [ ] A tap on a spot nothing marks adds an element there (Text by default), lined up by the local help (SNG-09), and it joins the hops.
- [ ] Handles for move and resize appear only after a direct tap on an element; a hop never shows them.
- [ ] A pinch never moves or resizes anything, and never switches to the grid of pages by accident: the switch needs a pinch past a stop, committed on release, or the bar's "Pages" control.
- [ ] The bar is one row, and changes with the moment (nothing selected, at a hop, an element selected, the grid of pages).
- [ ] Every mark (text, tick, cross, circle, strike, initials, signature, date) can be placed, lands neatly (SNG-09), and is one undo away.
- [ ] The finish shows what the person added and never flags a blank.
- [ ] Undo covers moves, resizes, typing and styling.
- [ ] The three regressions recorded in `docs/sign-next-gen.md` §1 cannot happen, and each has a test.
- [ ] All three document classes of §5.6 work: a fillable PDF, a vector flat form, and a scan with 0 fields.
  - On the scan, tap to write snaps to the line (SNG-09), and the finish shows every page to check.
  - No copy anywhere claims the form is complete.
