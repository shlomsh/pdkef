---
id: "ARCH-73"
title: "Floating promises are checked in CI"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 13
depends_on: ["ARCH-76"]
---

# ARCH-73 · Floating promises are checked in CI

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Safety nets. Criterion: Error handling and async. Structure only: no behaviour change.

## Why

- There are 41 expression-statement promise calls; most carry a handler, but nothing enforces it. `src/tools/sign/components/nodes/SignatureNode.tsx:19` calls `tintImageDataUrl(...).then(...)` with no catch; `editor-ui/workspaceFullscreen.ts:21` and `PdfRedactTool.tsx:904` are unawaited.

## Outcome

- An AST check in the style of `check-swallowed-errors.mjs` flags an unhandled promise expression unless it is `void`ed with a reason or carries a rejection handler.

## Acceptance

- [ ] The three sites above are handled; a planted floating promise fails the check.
