---
id: "RED-73"
title: "Redact and Highlight toolbars wear the finish Sign's has, so the tools read as one app"
status: "done"
priority: "P2"
epic: "polish"
depends_on: ["SIGN-49"]
---

# RED-73 · Redact and Highlight toolbars wear the finish Sign's has, so the tools read as one app

*Filed 2026-11-12.* SIGN-49 gave Sign's toolbar design E's finish: ghost controls on one white strip,
thin dividers between groups, the one outlined Download (never filled, QUAL-27), labels that follow
the toolbar's own width. It is scoped by `data-finish="strip"`, so Redact and Highlight still wear the
bordered tiles, and Shlomi noticed the tools now look different from each other. He wants the same
polish on Redact and the other editor toolbars for alignment.

## Acceptance

- Redact wears the strip finish from Shlomi's pick on the canvas
  (https://claude.ai/artifact/7Uz5w2QLpjcThjREyfYbk8, "Redact" page): Blur, Blackout, Whiteout, Delete |
  Find, Peek | Undo, Redo ... Full screen, Replace | Share, Download (outlined), words kept (RED-34).
- Highlight keeps its tiles (Shlomi, 2026-11-12: a reading tool, its own look).
- Sign renders byte-identical; the arm-no-shift, touch-target, one-line, labels-fit and export-quiet
  guards hold for Redact with re-measured numbers.

## Outcome

Done 2026-11-12. Redact's root carries `data-finish="strip"` and `data-labels="stack"`: every tool keeps
its word, beside the icon from Sign's 1160px container tier and under it below (54px controls); Undo and
Redo are arrows above the phone. Dividers now come from one hook, `data-group-start` (More's root and
Undo in Sign, Find and Undo in Redact); Sign's 22 toolbar captures (en and he, 1440 to 390, with and
without Share, armed) are byte-identical before and after. Find open and Peek held take the tinted ground,
never the armed teal. With Drive connected, Download and its arrow share one outline and Full screen
gives up its word in the labelled row (all 1172px used otherwise). Measured on macOS Chromium: 1115px
with Share against 1172px; stacked 761px against 796px at 920px; no stranded control from 1000px to
236px with or without Share. Guards: `e2e/tool-toolbars/toolbar-finish-groups.spec.js` (new), Redact
under export-quiet's Sign assertions, units for the hooks. CI's Linux fonts are the check on the 57px
headroom.
