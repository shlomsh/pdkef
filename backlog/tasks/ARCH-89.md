---
id: "ARCH-89"
title: "Repeated CSS blocks and static inline styles move to shared rules"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
order: 18
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

- [ ] The CSS duplication factor drops and is recorded; no static inline style remains in those files.
