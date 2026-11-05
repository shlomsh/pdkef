---
id: "SCAN-64"
title: "Two choices for Scan: the shared Undo stack, and Compress on phones"
status: "open"
priority: "P3"
epic: "scan-next"
horizon: "later"
depends_on: []
needs: "A decision on each"
---

# SCAN-64 · Two product choices

*Opened 2026-11-05* from the read-only review of Scan at `b7fd7e91`.

## Outcome

- **Undo.** Scan's Remove and Undo are its own (`work.removal`, `ScanUndoChip`), and rotate, reorder, look and corners
  cannot be undone. Guideline 20 in `docs/ux-design-guidelines.md` asks for the shared stack. Decided before Scan gains more actions.
- **Compress.** `ScanWorkspace` offers it as a next step and `ScanPhoneTable` does not. Decided, then the two match or the
  difference is written down.
