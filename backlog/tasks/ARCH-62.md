---
id: "ARCH-62"
title: "liveFontCoverage.js is wired in or deleted, and comments stop calling it live"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "now"
order: 6
depends_on: []
---

# ARCH-62 · liveFontCoverage.js is wired in or deleted, and comments stop calling it live

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Dead code and unused surface. Structure only: no behaviour change.

## Why

- `src/editor/text/liveFontCoverage.js` (142 lines) is imported only by its own test, while comments in `textCoverage.js:10`, `SignatureDialog.tsx:314` and `shapingGuardHarness.js:28` describe it as running client-side.
- It is also wired into `unit-scope.mjs`, `import-graph.mjs` and `check-editor-dependency-directions.mjs`.

## Outcome

- Either it ships where the comments say, or the module, its test and the script references are deleted and the comments corrected.

## Acceptance

- [ ] `git grep liveFontCoverage` matches only live code, or nothing.
