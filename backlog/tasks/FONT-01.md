---
id: "FONT-01"
title: "Recalibrate the export-render guard's cross-platform tolerance"
status: "done"
priority: "P1"
epic: "fonts-and-script-support"
phase: "release-blocker-rode-sign-19"
depends_on: []
legacy_state: "Done 2026-08-29"
---

# FONT-01 · Recalibrate the export-render guard's cross-platform tolerance

## Scope and acceptance

**Recalibrate the export-render guard's cross-platform tolerance.** Resolved as a side effect of SIGN-19 landing (`706e92e`), not by a separate fix - SIGN-19's own writeup treats the export-render guard as "a genuinely different problem" from the shaping guards and closes it directly: determinism is 0.00% on both platforms, so the two Latin handwriting cases (`latin-caveat` 13.68%, `latin-great-vibes` 17.61%) are pdf.js rasterisation noise, not a defect. Tolerance stays at 12.50%, but the baseline is now pinned to the CI runner (captured via the new `update-export-render-baseline` workflow input) and **the guard skips, with a message, on a developer machine** rather than failing - the exact "make the guard skip off-CI" option this ticket named as one of its acceptable outcomes. No further action needed here; see SIGN-19's row for the full record.
