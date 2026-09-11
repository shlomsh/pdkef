---
id: "ARCH-12"
title: "Validate canonical backlog and generated indexes in CI"
status: "done"
priority: "P2"
epic: "editor-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-09-11"
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

## Done 2026-09-11

- `scripts/backlog-epics.mjs` is the one epic registry; `generate-backlog.mjs` and
  `serve-backlog-board.mjs` both import it, so a lane cannot be missing for a registered epic and an
  unregistered key fails validation by name (the `site-quality` failure mode above cannot recur).
- `validateTasks` in `scripts/backlog-data.mjs`: id shape, filename/id agreement, unique ids,
  status/priority/epic/phase enums, `depends_on` shape and targets, self-dependencies, cycles. Each
  message names the file. Workflow rules (which statuses may depend on which) deliberately not encoded.
- `npm run check:backlog` (`generate-backlog.mjs --check`) validates and compares the in-memory
  BACKLOG.md/TODO.md against the committed files without writing; a stale view fails with the
  regeneration command. Wired into `ci.yml` before the test run.
- Path resolution through `fileURLToPath`.
- Tests in `src/lib/backlog.test.js` use inline malformed fixtures, not the live task count, plus one
  assertion that the real `backlog/tasks/` validates.
- Also landed here: closed epics (no open, in-progress or blocked task) collapse to a "Closed epics"
  section at the bottom of BACKLOG.md and behind a toggle on the board, so the lane view is live work
  only. First run of the validator caught one bad value (FONT-01's `phase`) and two files with
  unquoted front matter, all normalized.
