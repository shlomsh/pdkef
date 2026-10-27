---
id: "ARCH-63"
title: "Each tool has one id used by code, with folder and label fields in TOOL_PAGES"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "now"
order: 9
depends_on: []
---

# ARCH-63 · Each tool has one id used by code, with folder and label fields in TOOL_PAGES

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Readability and naming. Structure only: no behaviour change.

## Why

- Edit Pages is `edit-pdf` (id, 17), `edit-pages` (folder), `organize-pdf` (slug, 18) and `EditPages` (component, 29). Unlock/Protect is `security` (folder, island), `unlock` and `protect`. Scan is folder `scan` and id `scan-to-pdf` (`src/lib/toolIds.ts:48-62`).

## Outcome

- `TOOL_PAGES` carries `folder` and `label` beside `id` and `slug`; code and docs refer to a tool by its `id`.

## Acceptance

- [ ] A unit test asserts every tool folder and slug is reachable from its `TOOL_PAGES` row.
