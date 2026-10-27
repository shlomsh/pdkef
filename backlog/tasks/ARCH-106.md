---
id: "ARCH-106"
title: "The Scan island is shorter than before ARCH-54 grew it"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-106 · The Scan island is shorter than before ARCH-54 grew it

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding S6.
Area: Code. Criterion: Size and complexity. Structure only: no behaviour change.

## Why

- The Scan island function at `src/tools/scan/PdfScanTool.tsx:99` grew from 728 to 871 lines after ARCH-54.

## Outcome

- Render sections and handlers extracted into hooks.
- The ratchet record lowered.

## Acceptance

- [x] The Scan island is below 728 lines and the size record reflects it.

## Closed 2026-10-27

`PdfScanTool` 864 -> 646 lines (file 932 -> 697, record dropped), hooks 28 -> 24, effects 12 -> 6. Render sections moved to `components/Scan*.tsx`, the full-screen effects to `hooks/useScanFullScreen.ts`, the scroll effect to `hooks/useKeepSelectedInView.ts`, option builders to `lib/scanOptions.ts` with a test. Effect order kept; no existing test edited.
