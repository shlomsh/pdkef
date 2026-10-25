---
id: "GRID-05"
title: "Split shows its pages through the shared page grid"
status: "in_progress"
priority: "P2"
epic: "polish"
horizon: "next"
order: 5
depends_on: ["GRID-04"]
---

# GRID-05 · Split on the shared page grid

Design: [docs/shared-page-grid.md](../../docs/shared-page-grid.md), decision 4. Split's
`PageToggleTile` grid moves onto `PageGrid` with drag off; its own thumbnail renderer goes. Its undo
moves to the stack and `useUndoChip` is deleted if nothing else uses it. Extend the parity guard
with `/split/`.
