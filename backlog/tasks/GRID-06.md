---
id: "GRID-06"
title: "PDF to Image shows its pages through the shared page grid"
status: "open"
priority: "P2"
epic: "polish"
horizon: "next"
order: 6
depends_on: ["GRID-04"]
---

# GRID-06 · PDF to Image on the shared page grid

Design: [docs/shared-page-grid.md](../../docs/shared-page-grid.md), decision 4. Its `PageToggleTile`
grid moves onto `PageGrid` with drag off; `PageToggleTile` is deleted once GRID-05 and this have
landed. Extend the parity guard with `/pdf-to-image/`.
