---
id: "SIGN-01"
title: "Recover after export failure"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "quick-win"
depends_on: []
legacy_state: "Done 2026-08-28"
---

# SIGN-01 · Recover after export failure

## Scope and acceptance

**Recover after export failure.** `PdfSignTool.tsx`, `SignTool/PdfWorkspace.tsx`: pages and edits remain mounted, export errors include recovery guidance, and correction/retry works through both share preparation and download. Errors clear on retry or replacement; load failures retain their separate status. Component regressions exercise failed export, edit, and successful retry without reloading.
