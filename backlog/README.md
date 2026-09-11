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

Edit a task file directly, then regenerate the Markdown summaries:

```sh
npm run generate:backlog
```

CI runs `npm run check:backlog`, which validates every task file (filename matches id, unique ids, the
enums above, `depends_on` targets exist, no self-dependencies or cycles, epic registered in
`scripts/backlog-epics.mjs`) and fails if `BACKLOG.md` or `TODO.md` is stale, so a task edit is not
finished until the views are regenerated and committed. Adding an epic is one row in
`scripts/backlog-epics.mjs`; both the generated views and the board read it. An epic whose every task is
done or retired collapses into a "Closed epics" section at the bottom of `BACKLOG.md` and behind a
"Show closed epics" toggle on the board, so the lane view is live work only.

For a browser view that stays synchronized without generating HTML, run the localhost-only viewer:

```sh
npm run backlog:serve
```

Then open [http://127.0.0.1:4321/](http://127.0.0.1:4321/). It reads `backlog/tasks/` on every refresh, polls every two seconds, accepts only `GET`, and has no task-editing endpoint. Stop it with `Ctrl-C`.

[`BACKLOG.md`](../BACKLOG.md) and [`TODO.md`](../TODO.md) are generated summaries. [`reference/migrated-todo-context.md`](reference/migrated-todo-context.md) preserves the prior design narrative and history, but it is not an actionable tracker.
