---
id: "ARCH-75"
title: "Abort detection goes through one isAbortError helper"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
order: 13
depends_on: []
---

# ARCH-75 · Abort detection goes through one isAbortError helper

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Safety nets. Criterion: Error handling and async. Structure only: no behaviour change.

## Why

- Four sites compare `err.name === 'AbortError'` by string (`usePreparedOutput.ts:114`, `usePdfShare.js:84`, `PdfScanTool.tsx:298`, `maintenanceTelemetry.ts:59`).
- Two islands build stand-in signals as plain objects (`PdfScanTool.tsx:213`, `:333`; `PdfCompressTool.tsx:91` with `{ aborted: true }`).

## Outcome

- `isAbortError(err)` beside `throwIfAborted` in `src/lib/abort.js`; stand-ins use a real `AbortController`.

## Acceptance

- [ ] No string compare of AbortError and no object stand-in signal remains.
