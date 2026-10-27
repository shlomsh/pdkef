---
id: "ARCH-129"
title: "docs/module-boundaries.md describes the current layout"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-129 · docs/module-boundaries.md describes the current layout

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding M5.
Area: Supporting. Criterion: Docs and guidance accuracy. Structure only: no behaviour change.

## Why

- `docs/module-boundaries.md:1` has a title and intro that describe a plan that moves no files.
- The Target layout block (lines 18-45) lists moved files, then admits two rows are stale.

## Outcome

- The block rewritten to the current layout, or archived.

## Acceptance

- [x] Every path in the layout block exists, and the title matches what the doc holds.

## Closed 2026-10-27

The doc's title and intro describe the layers and the import rules `test:module-boundaries` enforces, and its Layout block lists the current folders; every path in it was checked with `ls`. Rule texts were checked against `check-module-boundaries.mjs`; two stale counts were corrected.
