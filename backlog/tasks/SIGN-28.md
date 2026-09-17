---
id: "SIGN-28"
title: "Export moves to a sticky bottom sheet on phones, leaving one row of tools on top"
status: "open"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: ["SIGN-27"]
legacy_state: "Opened 2026-09-17 as step 2 of the SIGN-27 design"
---

# SIGN-28 · Export moves to a sticky bottom sheet on phones, leaving one row of tools on top

## Scope and acceptance

**After SIGN-27 the sticky editor card on a phone is ~155px: one context row and a two-line button
grid.** The second line exists because the grid mixes two kinds of thing - the tools you work with
(Delete, Blackout, Whiteout, Blur, Undo, Full screen on Redact; Text, Date, Symbols, Sign, Whiteout,
Shapes, Undo, Full screen on Sign) and the commands that end the session (Download, Share, Replace,
Compress it). Nine to eleven 44px controls cannot fit one 390px line; six can (6 × 44 + 5 gaps =
289px).

The UX guideline (docs/ux-design-guidelines.md §8 and §15) already says where the second kind
belongs: "the primary control is a sticky bottom sheet, in flow, with the safe-area inset; secondary
commands live in a '…' popover anchored at the inline end, so the Hebrew edition flips it". Merge is
the built example. Do that here:

- **Top card, phones only:** the tool row and Undo/Full screen. One line. The context row from
  SIGN-27 stays above it unchanged.
- **Bottom sheet, phones only:** Download as the primary control, Share beside it where the browser
  can share files (the guideline notes Share may matter more than Download on a phone), and a "…"
  popover at the inline end holding Replace and the Compress-it hand-off. `EditorExportActions`
  already has a `toolbar` and a below-the-document variant; the sheet is a third home for the same
  handlers, not a third copy of them.
- **Desktop (≥920px) does not change.** The labelled single-line toolbar and its `data-label-priority`
  rules are untouched; the sheet is a phone arrangement of the same controls.
- **Sign's optional controls.** Date and Feedback carry `[data-optional-control]` and drop at the
  extreme-narrow band. Decide whether Date is a tool (top row, 7 controls, needs the 3-per-row
  fallback or a narrower floor) or a "…" item, and where Feedback goes; the ticket that changes the
  count also redoes the two hand-computed container thresholds in `SignToolbar.module.css` (editor.md,
  "Main toolbar layout").
- **Nothing moves when a tool is armed** (editor.md, "Repeat placement"; SIGN-27's reservation stack
  is what guarantees the top card; the sheet is in flow and fixed-height so it needs no equivalent).
- **Full screen:** the sheet has to live inside the element that goes full screen, the same reason
  the toolbar does (ToolShell.tsx's `editor` comment).

**Acceptance.** `e2e/tool-toolbars/toolbar-phone-row.spec.js` extended: at 390px both tools' top
cards are one row of controls (budget ~110px including the context row), a Download control is
visible at the bottom of the viewport without scrolling with the page scrolled to its middle, and
`toolbar-touch-targets.spec.js` still passes at every width it lists. Redact's mobile export spec
(`redact-mobile-export.spec.js`, webkit) drives Download from wherever it lands. Screenshots before
and after at 390px in this ticket.

## Why it is its own ticket

It changes where Download lives, which is a product decision, and it touches Sign's control count,
which is the one thing in the toolbar module with hand-computed numbers. SIGN-27 was CSS and a slot;
this is layout.
