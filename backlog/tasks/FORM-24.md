---
id: "FORM-24"
title: "One home for the ink edge builders"
status: "in_progress"
priority: "P3"
epic: "form-understanding"
phase: "near-term"
depends_on: ["ARCH-24"]
---

# FORM-24 · One home for the ink edge builders

## Why

`formGrid.js` (`verticalEdges`, `horizontalRules`, `ruledCoverage`) and `formCells.js`
(`verticalEdgesAll`, `horizontalRulesAll`, `ruledCoverage`) build the same edges from the same ink,
a deliberate duplicate noted in `formCells.js`, each with its own tolerance constants. They can
drift apart without any test noticing, and a strategy that wants edges has two to choose from.

## Acceptance

- [ ] One module exports parameterized edge and rule builders; both detectors use it. The
      differences that exist today (background-panel exclusion, rects folded in as edges) become
      parameters, not copies.
- [ ] Same tolerance values, now in one place.
- [ ] No behaviour change: `score-form.mjs --all` identical, both corpora green.
