---
id: "MEM-37"
title: "Chunks are bundled by tool: tiny chunks merged, editor core on its own, PDF engines lazy"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-37 · Chunks are bundled by tool: tiny chunks merged, editor core on its own, PDF engines lazy

*Filed 2026-11-11*, step 4 of [docs/request-budget.md](../../docs/request-budget.md) (D3, D4).

## Why

The build emits 125 `/shared/` chunks, 66 under 2 KB; `/redact/` loads 60 JS files.

## What

In order, each measured: re-key `check-lazy-modules.js` to group names; merge tiny chunks without crossing
a lazy boundary; give `editor-core` its own group; tool groups only where the count drops. pdf-lib and
pdf.js stay their own lazy files. Names stay stable (`/shared/<group>.js`).

## Done when

- [ ] `test:lazy-modules` and `test:weight` green; JS requests on `/redact/` and `/sign/` measured before
      and after.
- [ ] No more than 15 bundles in all; MEM-33's budgets lowered.
