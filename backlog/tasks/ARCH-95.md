---
id: "ARCH-95"
title: "The routing rule names toolIds.ts as the one place a new tool starts"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "now"
order: 14
depends_on: []
---

# ARCH-95 · The routing rule names toolIds.ts as the one place a new tool starts

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Supporting. Criterion: Docs and guidance accuracy. Structure only: no behaviour change.

## Why

- `src/lib/toolIds.ts:1-9` says it is "the one list a new tool is added to", yet `toolIds`, `ToolId` and `TOOL_PAGES` appear in no doc or rule, and the registry exists twice (`src/data/tools.js` and `toolIds.ts`) with only a unit test between them.

## Outcome

- An add-a-tool paragraph in `.claude/rules/routing-and-pages.md`: the `toolIds.ts` row, then what derives from it and what still needs a hand edit.

## Acceptance

- [ ] The paragraph exists and every file it names exists (checked by the cited-path check).
