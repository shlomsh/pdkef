---
id: "ARCH-122"
title: "PdfRedactTool.test.tsx is split by behaviour area"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-122 · PdfRedactTool.test.tsx is split by behaviour area

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding Q6.
Area: Tests and CI. Criterion: Test architecture. Structure only: no behaviour change.

## Why

- `src/tools/redact/PdfRedactTool.test.tsx` is one test file of 3,717 lines.

## Outcome

- Split by behaviour area.

## Acceptance

- [x] No resulting test file is over 800 lines, and all tests still run.

## Done (2026-10-28)

- `PdfRedactTool.test.tsx` (3,711 lines) is seven files by behaviour area, `PdfRedactTool.<area>.test.tsx`
  (arming, delete, details, export, repeat, undo, whiteout), the largest 727 lines. The shared fixtures and setup
  are `src/test/support/redactTool.tsx`; `vi.mock` is repeated per file, as hoisting requires.
- The sorted list of 127 test names is identical before and after.
- unit-scope's fixture rule names the four split files that read `src/lib/__fixtures__/`.
