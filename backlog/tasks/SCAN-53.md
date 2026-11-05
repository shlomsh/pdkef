---
id: "SCAN-53"
title: "Rows that fan apart down a page keep their bend"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
depends_on: []
---

# SCAN-53 · The wave on a book page

*Opened 2026-11-05* from Shlomi's Adobe Scan PDF of a book run through Scan: "there is a wave effect of the books pages
that was not been fixed", and page 1 looked worse than the source. Measurements only here, the book stays private.

## What is wrong

On page 1 the rows lean -0.91 degrees at the top and +1.70 at the bottom. Scan read that, dropped the fit, and only
levelled: one turn of 0.32 degrees took the rows to -1.23 and +1.39, so the top rule leaned more than in the source.
The fit was dropped on 8 of the book's 25 pages.

## Why

`fitBend` called a fit explained by comparing what it leaves against the lines' wobble, and wobble was measured from each
line's own straight line. Rows that are each straight but fan apart have almost none, so the fan could never pass.

## What changes

A fit also counts when it explains how far the lines stray from one shared direction, on a page with at least 12 lines
that cross a good part of it (`LEAN_SPAN`) and no vertical rules. `explained` itself is untouched, so everything that
passed before still passes and rule fits do not change. Each condition was seen failing without it:

- **12 lines:** the poster and IMG_4759 have 2 and 4 such lines and would warp up to 70 px, the failure SCAN-46 recorded.
- **Across the page:** short cells inflate the shared stray (review).
- **No rules:** two scans of a filled form with tables came out with the table's halves at different heights, one with 8
  such lines and one with 17. A table's cells sit at their own heights, and a ruled page has its rules to go by.

## Done when

- Straight rows fanning down a page keep their bend; the same fan on fewer than 12 lines, on short cells, or on a page with rules does not.
- The book's worst pages come out with their rows parallel, the photos and the poster unchanged.
- Shlomi rescans the book and the wave is gone.
