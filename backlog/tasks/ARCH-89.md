---
id: "ARCH-89"
title: "Repeated CSS blocks and static inline styles move to shared rules"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-89 · Repeated CSS blocks and static inline styles move to shared rules

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Supporting. Criterion: Styling architecture. Structure only: no behaviour change.

## Why

- The same 7-declaration `::before` hit-target block repeats in 6 modules (`MergeDocument .start-fresh`, `ReplaceFileLine`, `PageWorkspace .quiet-button`, `HistoryButtons`, ...); identical `.loaded-layout` blocks sit in the Compress and Image to PDF modules; 5 `@keyframes` names are defined twice.
- About 9 inline styles are static (`PdfRedactTool.tsx:1143`, `:1249`; `ShapeNode.tsx:10`; `LineNode.tsx:15`).

## Outcome

- A shared module or `composes:` base for the hit target and layout; unique keyframe names; static inline styles become classes.

## Acceptance

- [x] The CSS duplication factor drops and is recorded; no static inline style remains in those files.

## Status 2026-10-27

- **Done:** the hit target composes from src/shell/hitTarget.module.css in five modules. The Compress and Image to PDF loaded layout composes from loadedLayout.module.css. Keyframe names are unique, and static inline styles are classes in ShapeNode, LineNode and PdfRedactTool.
- **Left alone as drift:**
  - ToolShell.module.css:399 has the same block, but under `.shell:not(.editor) .action::before`, which `composes` cannot take.
  - PageGrid.module.css:458 differs.
  - PdfSecurityTool's `.loaded-layout` has other areas.
- **Measured** (astro build of the wave start against the wave end):
  - Distinct CSS: 331,347 -> 330,846 bytes.
  - Shipped CSS: 3,605,981 -> 3,605,678 bytes.
  - Heaviest-family factor: 45.30% -> 45.40% (Redact). The new .drawing-preview class adds about 94 bytes to Redact's page, and the distinct total shrank.
- **Recorded:** the CI limit is now 0.46 (was 0.65).

## Closed 2026-10-27

Closed on Shlomi's call. The duplicated blocks, keyframes and static inline styles are gone and the CI limit is recorded at 0.46 (was 0.65). The heaviest-family figure moved 45.30% to 45.40% only because Redact's page gained one small class while the distinct CSS total shrank; the drift above stays as it is.
