---
id: ARCH-12
title: Validate canonical backlog and generated indexes in CI
status: open
priority: P2
epic: editor-architecture
phase: near-term
depends_on: []
---

## Problem

The Markdown files in `backlog/tasks/` are the canonical work-board records, while `BACKLOG.md` and `TODO.md` are generated views. The current generator accepts any truthy metadata values and always rewrites the views. CI does not verify that task IDs are unique, filenames match IDs, enum values are valid, dependencies resolve, or generated views are current. This makes board drift and malformed task relationships easy to merge, especially while several agents update tasks concurrently.

## Scope

- Add a deterministic check mode for the backlog generator that exits non-zero when generated views are stale.
- Validate task filename/ID agreement, unique IDs, supported status/priority/epic/phase values, and dependency targets.
- Reject self-dependencies and dependency cycles with actionable error messages.
- Treat the `epics` array in `scripts/generate-backlog.mjs` as the source of truth for epic keys, and fail when a task names a key it does not contain or when `scripts/serve-backlog-board.mjs` does not carry a matching lane. The `site-quality` epic shipped registered in neither, so QUAL-01..03 were absent from both generated views and unlabelled on the board; nothing failed, because an unregistered key is silently dropped from the generator and falls back to the raw key on the board.
- Use `fileURLToPath` when resolving script locations so encoded paths and workspace paths containing spaces are handled safely.
- Add focused tests with malformed task fixtures rather than coupling tests to the current task count.
- Run the backlog validation/check command in CI before build and test jobs consume the generated board.

## Acceptance criteria

- `npm run check:backlog` validates canonical task metadata and confirms `BACKLOG.md` and `TODO.md` are current without modifying files.
- Invalid IDs, duplicate IDs, unsupported enum values, missing dependency targets, self-dependencies, and cycles fail with a message naming the affected task.
- A stale generated board fails CI and points contributors to the regeneration command.
- Valid task relationships across epics remain supported.
- Backlog generator path resolution works when the repository path contains spaces or URL-encoded characters.

## Notes

Keep the validation rules structural. Product workflow rules, such as which statuses may depend on one another, should not be encoded until the team explicitly agrees on them.
