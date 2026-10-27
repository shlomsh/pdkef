---
id: "ARCH-87"
title: "CSS Modules with no importer and classes never referenced fail the class check"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
order: 10
depends_on: []
---

# ARCH-87 · CSS Modules with no importer and classes never referenced fail the class check

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Supporting. Criterion: Styling architecture. Structure only: no behaviour change.

## Why

- `src/shell/FileList.module.css` (277 lines) has no importer; only a comment in `MergeRail.module.css:66` mentions it.
- 40 of 942 module classes are never referenced (for example 6 in `src/shell/PdfTool.module.css`, `.tracesLead` and `.traceRow` in `redact/SavedFileCheck.module.css:65`). `check-class-resolution.js` looks only from TSX to CSS.

## Outcome

- The class check also fails on a module with no importer and on an unreferenced class, with an allowlist for dynamic keys; the orphans are deleted.

## Acceptance

- [ ] `FileList.module.css` is gone; the reverse check runs in `test:css`.
