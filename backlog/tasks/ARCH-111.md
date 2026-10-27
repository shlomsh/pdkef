---
id: "ARCH-111"
title: "Split, Edit Pages and PDF to Image share one bulk-row component and message set"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-111 · Split, Edit Pages and PDF to Image share one bulk-row component and message set

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding D5.
Area: Code. Criterion: Duplication. Structure only: no behaviour change.

## Why

- Bulk include/skip/invert and replace rows are copied across Split (`src/tools/split/PdfSplitTool.tsx:181`), Edit Pages and PDF to Image as 23-line clones.
- 23 message lines are shared between the split and to-image `messages.ts`.

## Outcome

- A `PageBulkRow` component and the shared strings in `shell/pageWorkspace/pageToolMessages.ts`.

## Acceptance

- [ ] The three tools render the row from one component.
- [ ] The shared strings live in `pageToolMessages.ts` only.
