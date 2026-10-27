---
id: "ARCH-52"
title: "Sign keeps its document and finish lifecycle in one typed reducer"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-52 · Sign keeps its document and finish lifecycle in one typed reducer

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Thin components over pure logic. Structure only: no behaviour change.

## Why

- `src/tools/sign/PdfSignTool.tsx:139` holds the lifecycle as `useState('idle')` with its six states written only in a comment, next to 22 more useState calls (`errorDetail`, `needsUnlock`, `handoffBusy`, `handoffFailed`, `signedExport`, `dialogOpen`, ...). 14 status checks read the string.
- Redact solves the same job with a typed reducer (`PdfRedactTool.tsx:119`, `redact/state/redactState.ts`); the two editors have drifted into different state models.

## Outcome

- A typed status union and reducer in a pure module, on the same shape as Redact's, with unit tests.

## Acceptance

- [x] No string-typed status remains in Sign.
- [x] The island test passes; the reducer has its own tests.

## Done (2026-10-27)

Sign's document and finish lifecycle is signLifecycleReducer in src/tools/sign/state/signState.ts with a typed SignStatus; no string-typed status remains (PdfWorkspace and signExportReady take SignStatus). The reducer has its own tests; Sign island and cross-tool tests pass unchanged.
