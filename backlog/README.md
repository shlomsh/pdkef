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

Edit a task file directly, then regenerate the Markdown summaries if you want committed snapshots:

```sh
node scripts/generate-backlog.mjs
```

For a browser view that stays synchronized without generating HTML, run the localhost-only viewer:

```sh
npm run backlog:serve
```

Then open [http://127.0.0.1:4321/](http://127.0.0.1:4321/). It reads `backlog/tasks/` on every refresh, polls every two seconds, accepts only `GET`, and has no task-editing endpoint. Stop it with `Ctrl-C`.

[`BACKLOG.md`](../BACKLOG.md) and [`TODO.md`](../TODO.md) are generated summaries. [`reference/migrated-todo-context.md`](reference/migrated-todo-context.md) preserves the prior design narrative and history, but it is not an actionable tracker.
