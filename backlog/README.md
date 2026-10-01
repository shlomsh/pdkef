# Canonical backlog

Each file in [`tasks/`](tasks/) is one editable task record. This directory is the single source of truth for task metadata, scope, and acceptance criteria.

```yaml
---
id: "RED-29"
title: "Delete finds what a page draws inside a Form XObject"
status: "open"           # open | in_progress | blocked | done | retired
priority: "P1"           # P1 | P2 | P3
epic: "redact"           # live work: one of the six lanes below. Done/retired: any registered epic.
horizon: "next"          # now | next | later. Required for open and in_progress; not allowed otherwise.
order: 1                 # optional positive integer: position inside its board column
depends_on: []
waiting_on: "2026-10-08" # required for blocked, not allowed otherwise. An ISO date or short text.
needs: "A check on your iPhone" # optional: what Shlomi has to supply
---
```

Key order in the file is id, title, status, priority, epic, horizon, order, depends_on, waiting_on,
needs. Leave out an optional key that has no value. `phase` became `horizon` (now | next | later) and
`legacy_state` is gone; the validator rejects both.

## Lanes

Open, in-progress and blocked tickets live in one of six lanes (the display order below). Each is one
row in `scripts/backlog-epics.mjs`, which also registers every earlier epic as a closed epic so done
and retired tickets keep validating. A live ticket in a closed epic fails validation.

| key | lane |
| --- | --- |
| `redact` | Redact: finish removal |
| `sign-fill-mode` | Sign: finish fill mode |
| `form-detection` | Form detector accuracy |
| `robustness` | Robustness and debt |
| `search-and-languages` | Search and languages |
| `polish` | Polish |

## Columns

Inside a lane, every live ticket is in exactly one column:

- **Up next**: `in_progress`, or `open` with horizon `now`. An in-progress card carries an "In progress" mark.
- **Then, in order**: `open` with horizon `next`.
- **Waiting**: `blocked`; shows `waiting_on`.
- **Parked**: `open` with horizon `later`.

Within a column, tickets sort by `order` (a missing one last), then priority, then id. `needs` shows as a
"Needs Shlomi" mark with its text.

## Editing and checks

Edit a task file directly, then regenerate the views:

```sh
npm run generate:backlog
```

CI runs `npm run check:backlog`, which validates every task file (filename matches id, unique ids, the
enums above, the horizon / waiting_on / order / needs rules, `depends_on` targets exist, no
self-dependencies or cycles, epic registered, no live ticket in a closed epic) and fails if
`BACKLOG.md` or `TODO.md` is stale, so a task edit is not finished until the views are regenerated and
committed.

## Views

- [`BACKLOG.md`](../BACKLOG.md): one section per lane with its four columns, then a "Closed work" section
  with per-epic done and retired counts. Done and retired tickets are never listed; their files stay in
  `tasks/` as the record.
- [`TODO.md`](../TODO.md): what is next across the board. Up next by lane, waiting by date, and what needs Shlomi.
- The local board: a localhost-only viewer that stays synchronized without generating HTML.

```sh
npm run backlog:serve
```

Then open [http://127.0.0.1:4321/](http://127.0.0.1:4321/). It reads `backlog/tasks/` on every refresh,
polls every two seconds, accepts only `GET`, and has no task-editing endpoint. Stop it with `Ctrl-C`.
