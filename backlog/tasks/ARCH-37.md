---
id: "ARCH-37"
title: "Opening a file is one hook per kind of tool"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 6
depends_on: []
---

# ARCH-37 · Opening a file is one hook per kind of tool

*Filed 2026-10-26* from the architecture review ([docs/architecture-debt-review-2026-10-26.md](../../docs/architecture-debt-review-2026-10-26.md), section 3).

## Why

Split (`:115-175`), Edit Pages (`:93-153`) and PDF to Image (`:98-152`) paste the same ~60-line
open path: picked-file guard, encryption probe, repaired copy, lazy `PageGrid`. Sign (1201 lines) and
Redact (1421 lines) duplicate their whole session skeleton, and the copies have drifted: only Sign
handles `launchQueue`, Redact's load announcements are hard-coded English, Redact's `:420` comment
says it mirrors Sign, and Sign hand-rolls export request ids (`:283-292`) where Redact uses
`lib/useLatestRun`.

## Outcome

- `useOpenPageDocument` (and its lazy `PageGrid` loader) in `src/shell/pageWorkspace/` is the one
  open path for Split, Edit Pages and PDF to Image.
- `useEditorFileSession` in `src/editor-ui/` (or the layer the boundaries doc names) owns load, add,
  recents, unique ids, draft persistence and `launchQueue` for Sign and Redact. Redact gains
  `launchQueue` as a result.
- Sign uses `useLatestRun` for export invalidation.
- The two editors share one fullscreen toggle, one undo/redo button pair and one `useCoarsePointer`
  with a single, documented meaning.

## Acceptance

- [ ] Each island's open path is a hook call; the copies are gone.
- [ ] Opening a PDF from the operating system ("Open with" on the installed app) works in Redact.
- [ ] Existing unit and e2e tests for the five tools pass; the new hooks have unit tests, including
      an encrypted file and a stale pick replaced by a newer one.
