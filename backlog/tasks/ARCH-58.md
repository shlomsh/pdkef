---
id: "ARCH-58"
title: "The three page tools share one usePageToolSession hook and one messages base"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-58 · The three page tools share one usePageToolSession hook and one messages base

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Duplication. Structure only: no behaviour change.

## Why

- Split (`PdfSplitTool.tsx:89`), Edit Pages (`PdfEditPagesTool.tsx:69`) and PDF to Image (`PdfToImageTool.tsx:93`) repeat the same history, open, hand-off intake and bulk include/skip/invert block (identical at Split:171 and ToImage:160).
- Their `messages.ts` files redeclare about 24 lines of the same page-grid fields (`includeAll`, `skipAll`, `invertPages`, `protected*`, ...), so a shared string touches three interfaces and every locale.

## Outcome

- `usePageToolSession` in `src/shell/pageWorkspace/` returns history, open and bulk handlers; a `PageGridMessages` base interface the three tools extend.

## Acceptance

- [x] The three islands call the hook; the clone groups are gone.
- [x] The hook has its own unit test.

## Done (2026-10-27)

usePageToolSession (src/shell/pageWorkspace/) owns history, the open path, the PDF filter, hand-off intake and the bulk actions for Split, Edit Pages and PDF to Image; PageToolMessages in pageToolMessages.ts (PageGridMessages already named the grid slice). Per-island differences kept as options.
