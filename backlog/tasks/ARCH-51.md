---
id: "ARCH-51"
title: "Merge keeps its lifecycle in one reducer and its decisions in mergePlan"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-51 · Merge keeps its lifecycle in one reducer and its decisions in mergePlan

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Thin components over pure logic. Structure only: no behaviour change.

## Why

- `PdfMergeTool` (`src/tools/merge/PdfMergeTool.tsx:195`) is one 1,246-line function with 77 hook calls: 19 useState, 15 useRef, 13 useEffect, 18 useCallback.
- Plan bookkeeping (`inspectEntry`, `:557-600`, mutating a Map via `pendingPlanIndexRef`), the sort choice (`onSortChange`) and drag hit-testing (`:811+`) run inline, reachable only through the 1,947-line island test.

## Outcome

- A typed reducer holds the lifecycle; bookkeeping, sort and hit-testing are pure functions in `mergePlan.ts` (or siblings) with direct tests.
- The island function is under 500 lines.

## Acceptance

- [x] `PdfMergeTool` under 500 lines, recorded in the size ratchet.
- [x] New pure functions have their own unit tests; e2e unchanged.

## Done (2026-10-27)

PdfMergeTool's function is 452 lines (file 535, was 1,440), recorded in the size ratchet. The lifecycle is one reducer in state/mergeState.ts; plan bookkeeping, sort and drop hit-testing are pure in mergePlan.ts, mergeDrag.ts and mergeModel.ts with their own tests (mergeState, mergePlanBookkeeping, mergeDrag, earlyFiles). The island test passes unchanged apart from ARCH-67's specifier.
