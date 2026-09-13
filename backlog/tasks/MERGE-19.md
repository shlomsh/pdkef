---
id: "MERGE-19"
title: "Hand-off row border is 1.09:1 on the rail tint: use the rail's one secondary border"
status: "open"
priority: "P2"
epic: "merge-tool"
phase: "quick-win"
depends_on: ["MERGE-14"]
legacy_state: "Open"
---

# MERGE-19 · Hand-off row border is 1.09:1 on the rail tint: use the rail's one secondary border

*Filed 2026-09-13* from Shlomi's screenshot of the Direction A rail on `claude/merge-tool-epic-adaab1`.

## What is wrong

Share, Compress it and Sign it (`.handoff-button` in `src/components/MergeTool/MergeRail.module.css`)
take `border: 1px solid var(--color-border)` (#d8e8ec) and sit on the rail's `--color-primary-tint`
ground (#e6f1f3). That pair measures 1.09:1, so the three buttons have no visible edge; the only
thing separating three side-by-side, unfilled buttons is missing. The rail's other secondary
buttons (`.quiet-button`: Add files, Clear all, Reset order, Start fresh) use `--color-border-strong`
(#8dbcc7), 1.80:1 on the same ground, so the rail carries two different secondary borders and the
weaker one landed on the row that needs it most.

## Fix

One secondary border across the whole rail: `.handoff-button` takes `var(--color-border-strong)`,
the same token as `.quiet-button`. One line. The token itself is still under the 3:1 guideline for a
control's boundary (WCAG 1.4.11); that is app-wide and is QUAL-04, not this ticket.

**Acceptance.**

- Computed `border-color` on Share, Compress it and Sign it equals the computed `border-color` on
  Add files, measured on dev 4399 at 1280 and 375 with two files loaded.
- Hover and focus-visible states unchanged (`--color-primary-soft` fill, `--color-primary` border).
- Screenshot of the rail at both widths in the update line.
