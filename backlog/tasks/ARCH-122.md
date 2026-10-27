---
id: "ARCH-122"
title: "PdfRedactTool.test.tsx is split by behaviour area"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
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

- [ ] No resulting test file is over 800 lines, and all tests still run.
