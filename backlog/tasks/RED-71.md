---
id: "RED-71"
title: "Delete previews try again after the source document fails to load once"
status: "open"
priority: "P2"
epic: "redact"
horizon: "next"
depends_on: []
---

# RED-71 · Delete previews try again after the source document fails to load once

*Filed 2026-11-08, from the implicit state machine inventory.* `useDeletePreviews`
(`src/tools/redact/hooks/useDeletePreviews.ts`) caches the pdf-lib load as a promise keyed by the
file's bytes: `sourceDocRef.current = { bytes: fileBytes, doc: load }` (`:166`), rebuilt only when
`sourceDocRef.current.bytes !== fileBytes` (`:158`). If that promise rejects (a lazy chunk fails to
load offline, or pdf-lib throws on the file), the rejected promise stays cached. Every later rebuild
for the same file awaits it again and fails straight away, so Delete previews stay missing for that
file until a different file is opened.

## Acceptance

- A rejected load is dropped from `sourceDocRef`, so the next rebuild for the same bytes tries again.
- The failure is classified per the catch rules in `tools-and-shell.md`: an environment failure falls
  back quietly with an `// expected:` reason, and a failure in our own code or pdf-lib calls
  `reportError` first.
- A unit test fails the first load, then lets the second succeed, and asserts previews appear.

## Outcome
