---
id: "DEBT-78"
title: "The app's media queries read through one module"
status: "open"
priority: "P3"
horizon: "later"
epic: "honest-tests"
depends_on: []
---

# DEBT-78 · The app's media queries read through one module

*Filed 2026-11-26, from LAND-04 wave 18.* About thirty product reads of `matchMedia` repeat the same few
queries, each with its own guard: `typeof window.matchMedia === 'function'`, `matchMedia?.(...)`, a
try/catch, or none at all. Three of them (`src/shell/verb/VerbStage.tsx`, `src/shell/pageWorkspace/useDownloadFlow.ts`'s
`opensStrip`, the module-level read in `src/site-lib/homeWorkspace.ts`) throw where there is no `matchMedia`,
while the rest answer false.

- `(pointer: coarse)` has two helpers with two names: `coarsePointer` in `src/tools/highlight/hooks/useMarkerArming.ts`
  and `isCoarsePointer` in `src/editor-ui/hooks/toolArming.js`, beside the `useCoarsePointer` hook.
- `(hover: hover) and (pointer: fine)` is spelled out in `src/editor-ui/ArmHint.tsx`, `toolArming.js` and
  `src/shell/pageWorkspace/useSaveToDrive.ts`.
- `(prefers-reduced-motion: reduce)` is read in nine places (Redact's delete tool, Merge's handlers, Highlight's
  click marks, note pane and lamp, Scan's view and flatten animation, the verb stage, the dropzone).
- `src/shell/pageGrid/useStageFit.ts` and `src/tools/compress/hooks/useFittedColumns.ts` each subscribe to the
  desktop query by hand, which `src/tools/scan/hooks/useMediaQuery.ts` already does.

## Outcome

- One `src/lib/` module names the queries the app uses and answers them through one safe read (no window, no
  `matchMedia`, or a throw: false) and one subscribe with the `addListener` fallback; `useMediaQuery` lives
  beside it, and `useCoarsePointer` is that hook on the coarse query.
- Every product read above goes through it; no product file spells a query string or a guard of its own.
- In a browser with `matchMedia`, nothing a person sees changes; the three reads that threw without one now
  answer false, like the rest.
- Tests keep setting the screen with `setScreen` (`src/test/support/screen.ts`); none mocks the module.
