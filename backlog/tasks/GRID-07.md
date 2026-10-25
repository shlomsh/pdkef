---
id: "GRID-07"
title: "Page grid rows without gaps, and one rail rhythm across the grid tools"
status: "open"
priority: "P2"
epic: "polish"
horizon: "next"
order: 7
depends_on: ["GRID-05"]
---

# GRID-07 · Rows without gaps, one rail rhythm

*Filed 2026-10-25, from the unified grid sketch Shlomi approved the same day
([docs/shared-page-grid.md](../../docs/shared-page-grid.md), "GRID-05 and GRID-06").*

## Problem

- **Landscape gaps.** A landscape page (or one rotated 90/270) spans two columns. When only one column is
  left in a row it wraps and leaves a hole: on a phone, pages 1 to 3, a gap, then the landscape page on
  the next row. Every grid tool shows it, since they share `PageGrid`.
- **Rail rhythm.** The rails of Merge, Edit PDF, Split and PDF to Image are assembled from the same
  pieces but their button heights and gaps are not one rhythm when seen side by side at two widths.

## Done when

- The grid packs pages so no row has an empty cell before the row's last page, in every grid tool,
  without changing the output order the numbers under the pages report. `stageFit.ts`'s row count and
  the rendered grid agree (unit test on `rowsFor` plus the parity guard).
- One gap and one control height run through every rail, checked side by side at 1280 and 1440 in all
  four tools, and recorded in docs/ux-design-guidelines.md section 20.
