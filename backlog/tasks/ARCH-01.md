---
id: "ARCH-01"
title: "Move editor/model out of lib/"
status: "done"
priority: "P2"
epic: "editor-architecture"
phase: "unspecified"
depends_on: []
legacy_state: "Done 2026-08-30"
---

# ARCH-01 · Move editor/model out of lib/

## Scope and acceptance

**Move `editor/model` out of `lib/`.** The `uniqueId`/`seedUniqueId` half is done (2026-08-29): both moved verbatim into `editor/model/ids.ts` beside `createElementId`, `sign.js` no longer defines or exports them, and every call site (`PdfSignTool.tsx`, `PdfRedactTool.tsx`, `actionHistory.js`, tests) imports from the new location — `actionHistory.js` no longer touches `sign.js` at all. Remaining: `src/lib/editorModel.ts` (element schema/union, zero imports today) and `src/lib/actionHistory.js` itself still physically live in `src/lib/`, not `src/editor/model/`, where they belong per the boundary table. No behavior change either way.

**Completed 2026-08-30.** `editorModel.ts` and `actionHistory.js` now live under `src/editor/model/`; all imports and architecture references were updated with no behavior change.
