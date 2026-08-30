# Canonical backlog

Each file in [`tasks/`](tasks/) is one editable task record. This directory is the single source of truth for task metadata, scope, and acceptance criteria.

```yaml
---
id: "SIGN-05"
title: "One page-coordinate transform"
status: "open" # open | in_progress | blocked | done | retired
priority: "P1" # P1 | P2 | P3
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---
```

Edit a task file directly, then regenerate all read-only views:

```sh
node scripts/generate-backlog.mjs
node scripts/export-todo-kanban.mjs /path/to/todo-kanban.html
```

[`BACKLOG.md`](../BACKLOG.md) and [`TODO.md`](../TODO.md) are generated summaries. [`reference/migrated-todo-context.md`](reference/migrated-todo-context.md) preserves the prior design narrative and history, but it is not an actionable tracker.
