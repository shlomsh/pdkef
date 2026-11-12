---
id: "RED-73"
title: "Redact and Highlight toolbars wear the finish Sign's has, so the tools read as one app"
status: "in_progress"
priority: "P2"
epic: "polish"
horizon: "now"
depends_on: ["SIGN-49"]
---

# RED-73 · Redact and Highlight toolbars wear the finish Sign's has, so the tools read as one app

*Filed 2026-11-12.* SIGN-49 gave Sign's toolbar design E's finish: ghost controls on one white strip,
thin dividers between groups, the one outlined Download (never filled, QUAL-27), labels that follow
the toolbar's own width. It is scoped by `data-finish="strip"`, so Redact and Highlight still wear the
bordered tiles, and Shlomi noticed the tools now look different from each other. He wants the same
polish on Redact and the other editor toolbars for alignment.

## Acceptance

To be written when it is picked up: which toolbars take the finish (Redact, Highlight, any other
`SignToolbar.module.css` consumer), their groups and dividers, a measured label step per toolbar, and
the arm-no-shift, touch-target, one-line, labels-fit and export-quiet guards re-measured for each.
If every editor toolbar takes it, the finish stops being a Sign-scoped attribute and becomes the
module's default.
