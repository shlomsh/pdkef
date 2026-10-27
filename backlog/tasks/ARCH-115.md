---
id: "ARCH-115"
title: "Test-only modules sit on test-support paths"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-115 · Test-only modules sit on test-support paths

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding X5.
Area: Code. Criterion: Dead code and unused surface. Structure only: no behaviour change.

## Why

- `src/editor/text/fontCoverageReport.js` and `hebrewCombiningCorpus.js` sit on production paths but are imported only by tests.

## Outcome

- Both files moved to test-support paths.

## Acceptance

- [ ] No production-path module is imported only by tests among these two, and the tests pass from the new paths.
