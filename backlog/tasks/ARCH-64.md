---
id: "ARCH-64"
title: "Tool-keyed types derive from ToolId"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-64 · Tool-keyed types derive from ToolId

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Readability and naming. Structure only: no behaviour change.

## Why

- `HandoffTool = 'compress' | 'sign' | 'merge' | 'redact' | 'edit-pdf'` is hand-written at `src/shell/pageWorkspace/useDownloadFlow.ts:11`, beside `ToolId` (`src/lib/toolIds.ts`) and a third type `ToolSlug` (`src/site-lib/routeFiles.ts:12`). A new tool needs three edits that can disagree.

## Outcome

- `HandoffTool` and `ToolSlug` are derived from `ToolId` and `TOOL_PAGES`.

## Acceptance

- [x] No hand-written tool union remains; typecheck green.

## Done (2026-10-27)

HandoffTool derives from a handoffTarget flag on TOOL_PAGES and ToolSlug from the rows with accepts; type pins in src/test/cross-tool/toolIds.test.ts.
