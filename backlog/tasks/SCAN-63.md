---
id: "SCAN-63"
title: "Scan's pages say where they came from, and its callbacks read live inputs"
status: "open"
priority: "P3"
epic: "scan-next"
horizon: "later"
depends_on: []
---

# SCAN-63 · Structure from the Scan review

*Opened 2026-11-05* from the read-only review of Scan at `b7fd7e91`. Structure only, behaviour stays the same.

## Outcome

- A page has a source field, and "inspected" is separate from "corners settled". PDF sheets are photos with `guessed`,
  `edited` and `sheet` flags today. That overload caused one of SCAN-56's bugs.
- `useScanPages.ts` and `useScanPdfPages.ts` read their inputs from a ref. `useCallback(..., [])` freezes the first render's
  `input`, which works only because `forgetTurned` happens to use a functional `setState`.
- `ScanWork`'s long-running work sits behind one job registry that Clear all cancels, if a second kind of job needs
  cancelling. SCAN-56 added `pdfImport` on its own.
- `cornersDone` in `messages.ts` and the unused `view` in `PageActionsInput` are gone.
