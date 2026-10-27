---
id: "ARCH-64"
title: "Tool-keyed types derive from ToolId"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
order: 7
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

- [ ] No hand-written tool union remains; typecheck green.
