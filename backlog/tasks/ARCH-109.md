---
id: "ARCH-109"
title: "Redact moves its effect clusters into hooks over the reducer state"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-109 · Redact moves its effect clusters into hooks over the reducer state

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding P5.
Area: Code. Criterion: Thin components over pure logic. Structure only: no behaviour change.

## Why

- Redact has a reducer, but the island at `src/tools/redact/PdfRedactTool.tsx:115` keeps 54 hooks, 13 refs and 12 effects in a 1,204-line function.

## Outcome

- Effect clusters moved into hooks that consume the reducer state.

## Acceptance

- [x] The island has fewer hook calls and effects than the recorded counts, and the records are lowered.

## Closed 2026-10-27

Redact's export, finish-strip and selection-dismiss effect clusters moved into `useRedactExport`, `useFinishStrip` and `useSelectionDismiss`. Island hooks 43 -> 26, effects 12 -> 4, function 1202 -> 902 lines. The two export announcements moved to `messages.ts` with the same text, and Sign and Redact share `src/lib/encryptedPdfError.ts` (test-first). `useRedactExport` is 220 lines and is recorded by ARCH-105's tier; ARCH-103 continues the split.
